import { type ChannelDto, hasPermission, Permission, type ServerDetail } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type DragEvent, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useAuth } from '../../stores/auth';
import { useLive } from '../../stores/live';
import { CreateChannelModal } from './modals/CreateChannelModal';
import { InviteModal } from './modals/InviteModal';
import { UserPanel } from './UserPanel';

interface Group {
  category: ChannelDto | null;
  channels: ChannelDto[];
}

function groupChannels(channels: ChannelDto[]): Group[] {
  const byPos = (a: ChannelDto, b: ChannelDto) => a.position - b.position;
  const cats = channels.filter((c) => c.type === 'CATEGORY').sort(byPos);
  const children = (parentId: string | null) =>
    channels.filter((c) => c.type !== 'CATEGORY' && c.parentId === parentId).sort(byPos);
  return [{ category: null, channels: children(null) }, ...cats.map((c) => ({ category: c, channels: children(c.id) }))];
}

export function ChannelSidebar({
  server,
  activeChannelId,
  className,
}: {
  server: ServerDetail;
  activeChannelId?: string;
  className: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user?.id);
  const unread = useLive((s) => s.unread);
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [inviting, setInviting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const perms = BigInt(server.myPermissions);
  const canManage = hasPermission(perms, Permission.MANAGE_CHANNELS);
  const canInvite = hasPermission(perms, Permission.CREATE_INVITE);
  const isOwner = server.ownerId === me;
  const groups = useMemo(() => groupChannels(server.channels), [server.channels]);

  /** Drag & drop: soltar un canal sobre otro lo coloca antes de él (incluso en otra categoría). */
  async function onDrop(e: DragEvent, target: ChannelDto) {
    e.preventDefault();
    const dragged = server.channels.find((c) => c.id === dragId);
    setDragId(null);
    if (!dragged || dragged.id === target.id || dragged.type === 'CATEGORY' || target.type === 'CATEGORY') return;

    const siblings = server.channels
      .filter((c) => c.type !== 'CATEGORY' && c.parentId === target.parentId && c.id !== dragged.id)
      .sort((a, b) => a.position - b.position);
    siblings.splice(siblings.indexOf(target), 0, { ...dragged, parentId: target.parentId });
    const positions = siblings.map((c, i) => ({ id: c.id, position: i, parentId: target.parentId }));

    // Optimista: la UI cambia al instante; si falla, se recarga del servidor.
    qc.setQueryData<ServerDetail>(qk.server(server.id), (d) =>
      d
        ? {
            ...d,
            channels: d.channels.map((c) => {
              const p = positions.find((x) => x.id === c.id);
              return p ? { ...c, position: p.position, parentId: p.parentId } : c;
            }),
          }
        : d,
    );
    try {
      await api(`/servers/${server.id}/channels/positions`, { method: 'PATCH', body: positions });
    } catch {
      void qc.invalidateQueries({ queryKey: qk.server(server.id) });
    }
  }

  async function leaveOrDelete() {
    setMenu(false);
    const msg = isOwner ? `¿Eliminar "${server.name}"? No se puede deshacer.` : `¿Abandonar "${server.name}"?`;
    if (!window.confirm(msg)) return;
    await api(isOwner ? `/servers/${server.id}` : `/servers/${server.id}/members/@me`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: qk.servers });
    navigate('/channels', { replace: true });
  }

  return (
    <aside className={`${className} w-60 shrink-0 flex-col bg-surface-1`}>
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          className="flex h-12 w-full items-center justify-between border-b border-surface-0 px-4 font-semibold hover:bg-surface-3/50"
        >
          <span className="truncate">{server.name}</span>
          <span aria-hidden>▾</span>
        </button>
        {menu && (
          <div className="absolute inset-x-2 top-12 z-20 rounded-md bg-surface-0 p-1.5 text-sm shadow-xl">
            {canInvite && (
              <MenuItem onClick={() => (setMenu(false), setInviting(true))} className="text-accent">
                Invitar gente
              </MenuItem>
            )}
            {canManage && <MenuItem onClick={() => (setMenu(false), setCreatingIn(null))}>Crear canal</MenuItem>}
            <MenuItem onClick={leaveOrDelete} className="text-danger">
              {isOwner ? 'Eliminar servidor' : 'Abandonar servidor'}
            </MenuItem>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Canales">
        {groups.map((g) => (
          <div key={g.category?.id ?? 'root'} className="mb-4">
            {g.category && (
              <div className="group flex items-center justify-between px-1 pb-1 text-xs font-bold tracking-wide text-fg-subtle uppercase">
                <span className="truncate">{g.category.name}</span>
                {canManage && (
                  <button
                    title="Crear canal"
                    className="text-base opacity-0 group-hover:opacity-100 hover:text-fg"
                    onClick={() => setCreatingIn(g.category!.id)}
                  >
                    +
                  </button>
                )}
              </div>
            )}
            {g.channels.map((c) => {
              const active = c.id === activeChannelId;
              const isUnread = !!unread[c.id] && !active;
              return (
                <Link
                  key={c.id}
                  to={`/channels/${server.id}/${c.id}`}
                  draggable={canManage}
                  onDragStart={() => setDragId(c.id)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={(e) => void onDrop(e, c)}
                  onClick={() => useLive.getState().set({ mobileSidebar: false })}
                  className={`relative mb-0.5 flex items-center gap-1.5 rounded px-2 py-1.5 text-[0.95rem] ${
                    active
                      ? 'bg-surface-3 text-fg'
                      : isUnread
                        ? 'font-semibold text-fg hover:bg-surface-3/60'
                        : 'text-fg-subtle hover:bg-surface-3/60 hover:text-fg-muted'
                  } ${dragId === c.id ? 'opacity-40' : ''}`}
                >
                  {isUnread && <span className="absolute -left-2 h-2 w-1 rounded-r bg-fg" />}
                  <span aria-hidden className="w-5 text-center text-fg-subtle">
                    {c.type === 'VOICE' ? '🔊' : c.type === 'ANNOUNCEMENT' ? '📢' : '#'}
                  </span>
                  <span className="truncate">{c.name}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <UserPanel />
      {creatingIn !== undefined && (
        <CreateChannelModal serverId={server.id} parentId={creatingIn} onClose={() => setCreatingIn(undefined)} />
      )}
      {inviting && <InviteModal serverId={server.id} onClose={() => setInviting(false)} />}
    </aside>
  );
}

function MenuItem({ onClick, className = '', children }: { onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`block w-full rounded px-2 py-1.5 text-left hover:bg-accent hover:text-white ${className}`}>
      {children}
    </button>
  );
}
