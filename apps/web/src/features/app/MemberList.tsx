import type { MemberDto, Page } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Avatar } from '../../components/Avatar';
import { api } from '../../lib/api';
import { displayName } from '../../lib/format';
import { qk } from '../../lib/queryClient';
import { useLive } from '../../stores/live';

type Row = { kind: 'header'; label: string } | { kind: 'member'; m: MemberDto };

/** Lista virtualizada: miles de miembros con ~30 nodos en el DOM. */
export default function MemberList({ serverId }: { serverId: string }) {
  const presence = useLive((s) => s.presence);
  const { data } = useQuery({
    queryKey: qk.members(serverId),
    queryFn: () => api<Page<MemberDto>>(`/servers/${serverId}/members?limit=1000`),
    staleTime: 60_000,
  });

  const rows = useMemo<Row[]>(() => {
    const items = data?.items ?? [];
    const status = (m: MemberDto) => presence[m.user.id] ?? m.presence;
    const byName = (a: MemberDto, b: MemberDto) => displayName(a.user).localeCompare(displayName(b.user));
    const online = items.filter((m) => status(m) !== 'OFFLINE').sort(byName);
    const offline = items.filter((m) => status(m) === 'OFFLINE').sort(byName);
    return [
      { kind: 'header', label: `En línea — ${online.length}` },
      ...online.map((m) => ({ kind: 'member' as const, m })),
      ...(offline.length ? [{ kind: 'header' as const, label: `Desconectados — ${offline.length}` }] : []),
      ...offline.map((m) => ({ kind: 'member' as const, m })),
    ];
  }, [data, presence]);

  return (
    <aside className="hidden w-60 shrink-0 bg-surface-1 lg:block" aria-label="Miembros">
      <Virtuoso
        data={rows}
        className="h-full"
        itemContent={(_, row) =>
          row.kind === 'header' ? (
            <h3 className="px-4 pt-5 pb-1 text-xs font-bold tracking-wide text-fg-subtle uppercase">{row.label}</h3>
          ) : (
            <MemberRow m={row.m} status={presence[row.m.user.id] ?? row.m.presence} />
          )
        }
      />
    </aside>
  );
}

function MemberRow({ m, status }: { m: MemberDto; status: MemberDto['presence'] }) {
  return (
    <div className={`mx-2 flex items-center gap-3 rounded px-2 py-1.5 hover:bg-surface-3/60 ${status === 'OFFLINE' ? 'opacity-40' : ''}`}>
      <Avatar user={m.user} size={32} presence={status} />
      <span className="truncate text-sm">{m.nickname ?? displayName(m.user)}</span>
    </div>
  );
}
