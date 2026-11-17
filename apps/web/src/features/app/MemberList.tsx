import type { MemberDto, Page, ServerDetail } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Avatar } from '../../components/Avatar';
import { api } from '../../lib/api';
import { displayName } from '../../lib/format';
import { queryClient, qk } from '../../lib/queryClient';
import { byPositionDesc, hoistedRole, memberColor } from '../../lib/roles';
import { useNavigate } from 'react-router';
import { useAuth } from '../../stores/auth';
import { useLive } from '../../stores/live';
import { openDm } from './dms/NewDmModal';

type Row = { kind: 'header'; label: string } | { kind: 'member'; m: MemberDto; color?: string };

/** Lista virtualizada: miles de miembros con ~30 nodos en el DOM. */
export default function MemberList({ serverId }: { serverId: string }) {
  const presence = useLive((s) => s.presence);
  const { data } = useQuery({
    queryKey: qk.members(serverId),
    queryFn: () => api<Page<MemberDto>>(`/servers/${serverId}/members?limit=1000`),
    staleTime: 60_000,
  });

  // El detalle ya está en caché (ServerView lo cargó): no hay petición extra.
  const { data: server } = useQuery({
    queryKey: qk.server(serverId),
    queryFn: () => api<ServerDetail>(`/servers/${serverId}`),
  });

  const rows = useMemo<Row[]>(() => {
    const items = data?.items ?? [];
    const roles = [...(server?.roles ?? [])].sort(byPositionDesc);
    const status = (m: MemberDto) => presence[m.user.id] ?? m.presence;
    const byName = (a: MemberDto, b: MemberDto) => displayName(a.user).localeCompare(displayName(b.user));
    const row = (m: MemberDto): Row => ({ kind: 'member', m, color: memberColor(m.roleIds, roles) });

    // En línea: agrupados por su rol "destacado" más alto (en orden de jerarquía).
    const online = items.filter((m) => status(m) !== 'OFFLINE');
    const groups = new Map<string, MemberDto[]>();
    for (const m of online) {
      const key = hoistedRole(m.roleIds, roles)?.id ?? '';
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    const out: Row[] = [];
    for (const r of roles.filter((x) => x.hoist && groups.has(x.id))) {
      const list = groups.get(r.id)!.sort(byName);
      out.push({ kind: 'header', label: `${r.name} — ${list.length}` }, ...list.map(row));
    }
    const rest = (groups.get('') ?? []).sort(byName);
    if (rest.length || out.length === 0) out.push({ kind: 'header', label: `En línea — ${rest.length}` }, ...rest.map(row));

    const offline = items.filter((m) => status(m) === 'OFFLINE').sort(byName);
    if (offline.length) out.push({ kind: 'header', label: `Desconectados — ${offline.length}` }, ...offline.map(row));
    return out;
  }, [data, presence, server?.roles]);

  return (
    <aside className="hidden w-60 shrink-0 bg-surface-1 lg:block" aria-label="Miembros">
      <Virtuoso
        data={rows}
        className="h-full"
        itemContent={(_, row) =>
          row.kind === 'header' ? (
            <h3 className="px-4 pt-5 pb-1 text-xs font-bold tracking-wide text-fg-subtle uppercase">{row.label}</h3>
          ) : (
            <MemberRow m={row.m} color={row.color} status={presence[row.m.user.id] ?? row.m.presence} />
          )
        }
      />
    </aside>
  );
}

function MemberRow({ m, status, color }: { m: MemberDto; status: MemberDto['presence']; color?: string }) {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user?.id);
  const isMe = m.user.id === me;
  // Clic en un miembro → abre (o reutiliza) el DM con esa persona.
  async function message() {
    if (isMe) return;
    const dm = await openDm([m.user.id]);
    await queryClient.invalidateQueries({ queryKey: qk.dms });
    navigate(`/channels/@me/${dm.id}`);
  }
  return (
    <button
      type="button"
      onClick={() => void message()}
      disabled={isMe}
      title={isMe ? undefined : `Enviar mensaje a ${m.nickname ?? displayName(m.user)}`}
      className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-surface-3/60 disabled:cursor-default ${status === 'OFFLINE' ? 'opacity-40' : ''}`}
    >
      <Avatar user={m.user} size={32} presence={status} />
      <span className="truncate text-sm font-medium" style={{ color }}>
        {m.nickname ?? displayName(m.user)}
      </span>
    </button>
  );
}
