import type { ChannelDto } from '@ezydc/shared';
import { useEffect, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { subscribeChannel } from '../../../lib/socket';
import { useLive } from '../../../stores/live';
import { useMessages } from '../messageCache';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';
import { TypingIndicator } from './TypingIndicator';

/** Índice base alto para que Virtuoso pueda "prepend" páginas antiguas sin saltos de scroll. */
const BASE_INDEX = 1_000_000;
const GROUP_WINDOW_MS = 5 * 60_000;

export default function ChatView({
  channel,
  canSend,
  canManageMessages,
}: {
  channel: ChannelDto;
  canSend: boolean;
  canManageMessages: boolean;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useMessages(channel.id);

  // Solo este canal recibe payloads completos por el socket.
  useEffect(() => {
    subscribeChannel(channel.id);
    useLive.getState().markRead(channel.id);
    return () => useLive.getState().set({ replyTo: null });
  }, [channel.id]);

  const messages = useMemo(() => (data ? [...data.pages].reverse().flat() : []), [data]);
  // Solo las páginas antiguas desplazan el índice; los mensajes nuevos se añaden al final.
  const olderCount = data ? data.pages.slice(1).reduce((n, p) => n + p.length, 0) : 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-2">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-surface-0 px-4 shadow-sm">
        <button
          className="btn-ghost -ml-2 px-2 py-1 md:hidden"
          aria-label="Canales"
          onClick={() => useLive.getState().set({ mobileSidebar: !useLive.getState().mobileSidebar })}
        >
          ☰
        </button>
        <span className="text-fg-subtle">#</span>
        <h1 className="truncate font-semibold">{channel.name}</h1>
        {channel.topic && <p className="hidden truncate border-l border-surface-3 pl-3 text-sm text-fg-muted sm:block">{channel.topic}</p>}
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
                      <h2 className="text-3xl font-bold">¡Bienvenido a #{channel.name}!</h2>
                      <p className="mt-1 text-fg-muted">Este es el comienzo del canal.</p>
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
              return <MessageItem message={m} grouped={grouped} canManage={canManageMessages} />;
            }}
          />
        )}
      </div>

      <div className="relative px-4 pb-5">
        <TypingIndicator channelId={channel.id} />
        <Composer channel={channel} disabled={!canSend} />
      </div>
    </main>
  );
}
