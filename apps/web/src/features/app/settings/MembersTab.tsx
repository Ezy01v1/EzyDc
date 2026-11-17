import { type MemberDto, type Page, type ServerDetail } from '@ezydc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { api } from '../../../lib/api';
import { displayName } from '../../../lib/format';
import { qk } from '../../../lib/queryClient';
import { byPositionDesc, hex, myTopPosition } from '../../../lib/roles';
import { useAuth } from '../../../stores/auth';

export function MembersTab({ server }: { server: ServerDetail }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user?.id);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: qk.members(server.id),
    queryFn: () => api<Page<MemberDto>>(`/servers/${server.id}/members?limit=1000`),
  });

  const top = myTopPosition(server, me);
  const roles = useMemo(() => server.roles.filter((r) => r.id !== server.id).sort(byPositionDesc), [server]);
  const assignable = roles.filter((r) => r.position < top);
  const members = (data?.items ?? []).filter((m) =>
    `${m.user.username} ${m.user.displayName ?? ''} ${m.nickname ?? ''}`.toLowerCase().includes(filter.toLowerCase()),
  );

  async function setRole(m: MemberDto, roleId: string, add: boolean) {
    setError(null);
    // Optimista; el evento MEMBER_UPDATE confirma (o el error revierte).
    const roleIds = add ? [...m.roleIds, roleId] : m.roleIds.filter((r) => r !== roleId);
    qc.setQueryData<Page<MemberDto>>(qk.members(server.id), (d) =>
      d ? { ...d, items: d.items.map((x) => (x.user.id === m.user.id ? { ...x, roleIds } : x)) } : d,
    );
    try {
      await api(`/servers/${server.id}/members/${m.user.id}/roles/${roleId}`, { method: add ? 'PUT' : 'DELETE' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      void qc.invalidateQueries({ queryKey: qk.members(server.id) });
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Miembros</h1>
      <p className="mb-4 text-sm text-fg-muted">{data?.items.length ?? 0} miembros · solo puedes asignar roles por debajo del tuyo.</p>
      <input className="input mb-4" placeholder="Buscar miembro" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {error && <p className="mb-4 rounded bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>}

      <ul className="divide-y divide-surface-3">
        {members.map((m) => {
          const missing = assignable.filter((r) => !m.roleIds.includes(r.id));
          return (
            <li key={m.user.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar user={m.user} size={36} />
              <div className="min-w-32 flex-1">
                <div className="truncate text-sm font-semibold">
                  {m.nickname ?? displayName(m.user)}
                  {server.ownerId === m.user.id && <span title="Dueño" className="ml-1">👑</span>}
                </div>
                <div className="truncate text-xs text-fg-subtle">{m.user.username}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {roles
                  .filter((r) => m.roleIds.includes(r.id))
                  .map((r) => (
                    <span key={r.id} className="flex items-center gap-1 rounded bg-surface-0 px-2 py-0.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color ? hex(r.color) : 'var(--fg-subtle)' }} />
                      {r.name}
                      {r.position < top && (
                        <button aria-label={`Quitar ${r.name}`} className="ml-0.5 text-fg-subtle hover:text-danger" onClick={() => void setRole(m, r.id, false)}>
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                {missing.length > 0 && (
                  <select
                    aria-label="Añadir rol"
                    className="rounded bg-surface-0 px-1.5 py-0.5 text-xs text-fg-muted"
                    value=""
                    onChange={(e) => e.target.value && void setRole(m, e.target.value, true)}
                  >
                    <option value="">+ rol</option>
                    {missing.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
