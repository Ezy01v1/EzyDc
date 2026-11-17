import type { ChannelDto } from '@ezydc/shared';
import { useEffect, useMemo, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { api } from '../../../lib/api';
import { subscribeChannel } from '../../../lib/socket';
import { isMuted, localAck, refreshServerBadges, toggleMute, useReadIndex } from '../../../lib/unread';
import { useLive } from '../../../stores/live';
import { useMessages } from '../messageCache';
import { type ChatContext, ChatCtx } from './chatContext';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';



/** Índice base alto para que Virtuoso pueda "prepend" páginas antiguas sin saltos de scroll. */
const BASE_INDEX = 1_000_000;
const GROUP_WINDOW_MS = 5 * 60_000;
const ACK_DELAY_MS = 700;

export default function ChatView({
  channel,
  title,
  icon = '#',
  canSend,
  canManageMessages,
  context,
}: {
  channel: ChannelDto;
  title: string;
  icon?: string;
  canSend: boolean;
  canManageMessages: boolean;
  context: ChatContext;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useMessages(channel.id);
  const idx = useReadIndex();
  const muted = isMuted(idx, channel.id);

  // Solo este canal recibe payloads completos por el socket.
  useEffect(() => {
    subscribeChannel(channel.id);
    return () => useLive.getState().set({ replyTo: null });
  }, [channel.id]);

  const messages = useMemo(() => (data ? [...data.pages].reverse().flat() : []), [data]);
  // Solo las páginas antiguas desplazan el índice; los mensajes nuevos se añaden al final.
  const olderCount = data ? data.pages.slice(1).reduce((n, p) => n + p.length, 0) : 0;
  const latestId = [...messages].reverse().find((m) => !m.pending)?.id;
  const lastRead = idx.states.get(channel.id)?.lastReadMessageId ?? null;
  const pendingMentions = idx.states.get(channel.id)?.mentionCount ?? 0;
  // Último leído AL ABRIR el canal: la línea "NUEVOS" no desaparece cuando se hace el ack.
  const marker = useRef<{ channelId: string; lastRead: string | null } | null>(null);
  if (marker.current?.channelId !== channel.id) marker.current = { channelId: channel.id, lastRead };
  const unreadFrom = marker.current.lastRead;

  // Marcar como leído: al abrir, al llegar mensajes con la ventana enfocada y al volver a la pestaña.
  useEffect(() => {
    if (!latestId) return;
    const needsAck = () => (!lastRead || latestId > lastRead || pendingMentions > 0) && document.hasFocus();
    let timer: number | undefined;
    const schedule = () => {
      if (!needsAck()) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        localAck(channel.id, latestId);
        refreshServerBadges();
        void api(`/channels/${channel.id}/ack`, { method: 'POST', body: { messageId: latestId } }).catch(() => {});
      }, ACK_DELAY_MS);
    };
    schedule();
    window.addEventListener('focus', schedule);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', schedule);
    };
  }, [channel.id, latestId, lastRead, pendingMentions]);

  return (
    <ChatCtx.Provider value={context}>
      <main className="flex min-w-0 flex-1 flex-col bg-surface-2">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-surface-0 px-4 shadow-sm">
          <button
            className="btn-ghost -ml-2 px-2 py-1 md:hidden"
            aria-label="Canales"
            onClick={() => useLive.getState().set({ mobileSidebar: !useLive.getState().mobileSidebar })}
          >
            ☰
          </button>
          <span className="text-fg-subtle" aria-hidden>
            {icon}
          </span>
          <h1 className="truncate font-semibold">{title}</h1>
          {channel.topic && <p className="hidden truncate border-l border-surface-3 pl-3 text-sm text-fg-muted sm:block">{channel.topic}</p>}
          <button
            className={`btn-ghost ml-auto px-2 py-1 ${muted ? 'text-danger' : ''}`}
            title={muted ? 'Dejar de silenciar' : 'Silenciar'}
            aria-label={muted ? 'Dejar de silenciar' : 'Silenciar'}
            aria-pressed={muted}
            onClick={() => void toggleMute(channel.id, !muted)}
          >
            {muted ? '🔕' : '🔔'}
          </button>
        </header>

        <div className="min-h-0 flex-1">
          {isPending ? (
            <div className="p-4 text-sm text-fg-subtle">Cargando mensajes…</div>
          ) : (
            <Virtuoso
              key={channel.id}
              className="h-full"
              data={messages}
              firstItemIndex={BASE_INDEX - olderCount}
              initialTopMostItemIndex={Math.max(0, messages.length - 1)}
              followOutput={(atBottom) => (atBottom ? 'smooth' : false)}
              atBottomThreshold={120}
              increaseViewportBy={{ top: 400, bottom: 200 }}
              startReached={() => {
                if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
              }}
              computeItemKey={(_, m) => m.nonce ?? m.id}
              components={{
                Header: () => (
                  <div className="px-4 pt-6 pb-2">
                    {hasNextPage ? (
                      <p className="text-center text-xs text-fg-subtle">{isFetchingNextPage ? 'Cargando…' : ' '}</p>
                    ) : (
                      <>
                        <h2 className="text-3xl font-bold">
                          {context.serverId ? `¡Bienvenido a #${title}!` : title}
                        </h2>
                        <p className="mt-1 text-fg-muted">
                          {context.serverId ? 'Este es el comienzo del canal.' : 'Este es el comienzo de vuestra conversación.'}
                        </p>
                      </>
                    )}
                  </div>
                ),
                Footer: () => <div className="h-2" />,
              }}
              itemContent={(index, m) => {
                const prev = messages[index - (BASE_INDEX - olderCount) - 1];
                const grouped =
                  !!prev &&
                  !m.replyTo &&
                  prev.author?.id === m.author?.id &&
                  new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
                // Línea "Nuevos" encima del primer mensaje no leído (si no es mío).
                const firstUnread = !!unreadFrom && !!prev && prev.id <= unreadFrom && m.id > unreadFrom;
                return (
                  <>
                    {firstUnread && (
                      <div className="mx-4 my-2 flex items-center gap-2 text-[0.7rem] font-bold text-danger" role="separator">
                        <span className="h-px flex-1 bg-danger/60" /> NUEVOS
                      </div>
                    )}
                    <MessageItem message={m} grouped={grouped && !firstUnread} canManage={canManageMessages} />
                  </>
                );
              }}
            />
          )}
        </div>

        <div className="relative px-4 pb-5">
          <TypingIndicator channelId={channel.id} />
          <Composer channel={channel} placeholderName={context.serverId ? `#${title}` : title} disabled={!canSend} />
        </div>
      </main>
    </ChatCtx.Provider>
  );
}
