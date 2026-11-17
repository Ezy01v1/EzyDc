import type { DmChannelDto } from '@ezydc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { api } from '../../../lib/api';
import { displayName } from '../../../lib/format';
import { qk } from '../../../lib/queryClient';
import { isMuted, isUnread, mentionCount, useReadIndex } from '../../../lib/unread';
import { useAuth } from '../../../stores/auth';
import { useLive } from '../../../stores/live';
import type { ChatContext } from '../chat/chatContext';
import { UserPanel } from '../UserPanel';
import { NewDmModal } from './NewDmModal';

const ChatView = lazy(() => import('../chat/ChatView'));

export const dmTitle = (d: DmChannelDto) => d.name ?? (d.recipients.map((r) => displayName(r)).join(', ') || 'Grupo vacío');

export function DmView({ channelId }: { channelId?: string }) {
  const me = useAuth((s) => s.user);
  const mobileSidebar = useLive((s) => s.mobileSidebar);
  const { data: dms, isPending } = useQuery({ queryKey: qk.dms, queryFn: () => api<DmChannelDto[]>('/users/me/channels') });
  const dm = dms?.find((d) => d.id === channelId);

  const context = useMemo<ChatContext>(
    () => ({
      serverId: null,
      roles: [],
      myRoleIds: [],
      people: [...(dm?.recipients ?? []), ...(me ? [me] : [])],
      canMentionEveryone: false,
    }),
    [dm?.recipients, me],
  );

  return (
    <div className="flex min-w-0 flex-1">
      <DmSidebar dms={dms ?? []} activeId={channelId} className={mobileSidebar || !channelId ? 'flex' : 'hidden md:flex'} />
      {dm ? (
        <Suspense fallback={<div className="flex-1" />}>
          <ChatView
            key={dm.id}
            channel={dm}
            title={dmTitle(dm)}
            icon={dm.type === 'GROUP_DM' ? '👥' : '@'}
            canSend
            canManageMessages={false}
            context={context}
          />
        </Suspense>
      ) : (
        <main className="hidden flex-1 place-items-center p-6 text-center md:grid">
          <div>
            <h1 className="text-2xl font-bold">{channelId && !isPending ? 'Conversación no encontrada' : 'Mensajes directos'}</h1>
            <p className="mt-2 text-fg-muted">Abre una conversación a la izquierda, o pulsa sobre alguien en la lista de miembros.</p>
          </div>
        </main>
      )}
    </div>
  );
}

function DmSidebar({ dms, activeId, className }: { dms: DmChannelDto[]; activeId?: string; className: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const idx = useReadIndex();
  const presence = useLive((s) => s.presence);
  const [creating, setCreating] = useState(false);

  async function close(e: React.MouseEvent, d: DmChannelDto) {
    e.preventDefault();
    if (d.type === 'GROUP_DM' && !window.confirm(`¿Salir del grupo "${dmTitle(d)}"?`)) return;
    await api(`/channels/${d.id}/recipients/@me`, { method: 'DELETE' });
    qc.setQueryData<DmChannelDto[]>(qk.dms, (l) => l?.filter((x) => x.id !== d.id));
    if (d.id === activeId) navigate('/channels/@me', { replace: true });
  }

  return (
    <aside className={`${className} w-60 shrink-0 flex-col bg-surface-1`}>
      <div className="flex h-12 items-center justify-between border-b border-surface-0 px-4">
        <span className="text-xs font-bold tracking-wide text-fg-subtle uppercase">Mensajes directos</span>
        <button className="text-xl text-fg-muted hover:text-fg" title="Nuevo mensaje o grupo" aria-label="Nuevo mensaje o grupo" onClick={() => setCreating(true)}>
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Conversaciones">
        {dms.length === 0 && <p className="px-2 py-4 text-sm text-fg-subtle">Aún no tienes conversaciones.</p>}
        {dms.map((d) => {
          const active = d.id === activeId;
          const unread = !active && !isMuted(idx, d.id) && isUnread(idx, d.id, d.lastMessageId);
          const mentions = active ? 0 : mentionCount(idx, d.id);
          const other = d.recipients[0] ?? null;
          return (
            <Link
              key={d.id}
              to={`/channels/@me/${d.id}`}
              onClick={() => useLive.getState().set({ mobileSidebar: false })}
              className={`group mb-0.5 flex items-center gap-3 rounded px-2 py-1.5 ${
                active ? 'bg-surface-3 text-fg' : unread ? 'text-fg hover:bg-surface-3/60' : 'text-fg-subtle hover:bg-surface-3/60 hover:text-fg-muted'
              }`}
            >
              {d.type === 'GROUP_DM' ? (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm">👥</div>
              ) : (
                <Avatar user={other} size={32} presence={other ? (presence[other.id] ?? undefined) : undefined} />
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className={`truncate text-sm ${unread ? 'font-semibold' : ''}`}>{dmTitle(d)}</div>
                {d.type === 'GROUP_DM' && <div className="truncate text-xs text-fg-subtle">{d.recipients.length + 1} miembros</div>}
              </div>
              {mentions > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.65rem] font-bold text-white">
                  {mentions > 99 ? '99+' : mentions}
                </span>
              )}
              <button
                onClick={(e) => void close(e, d)}
                title={d.type === 'GROUP_DM' ? 'Salir del grupo' : 'Cerrar conversación'}
                aria-label={d.type === 'GROUP_DM' ? 'Salir del grupo' : 'Cerrar conversación'}
                className="invisible text-fg-subtle group-hover:visible hover:text-fg"
              >
                ✕
              </button>
            </Link>
          );
        })}
      </nav>
      <UserPanel />
      {creating && <NewDmModal onClose={() => setCreating(false)} />}
    </aside>
  );
}
