import type { DmChannelDto, ServerListItem } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { initials } from '../../lib/format';
import { qk } from '../../lib/queryClient';
import { mentionCount, useReadIndex } from '../../lib/unread';
import { AddServerModal } from './modals/AddServerModal';

export function ServerRail({ servers, activeId }: { servers: ServerListItem[]; activeId?: string }) {
  const [adding, setAdding] = useState(false);
  const idx = useReadIndex();
  const { data: dms = [] } = useQuery({ queryKey: qk.dms, queryFn: () => api<DmChannelDto[]>('/users/me/channels') });
  const dmMentions = dms.reduce((n, d) => n + mentionCount(idx, d.id), 0);
  const isHome = !activeId || activeId === '@me';

  return (
    <nav aria-label="Servidores" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-surface-0 py-3">
      <RailItem to="/channels/@me" label="Mensajes directos" active={isHome} unread={false} mentions={dmMentions}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4 5h16v11H8l-4 4V5z" />
        </svg>
      </RailItem>
      <div className="mx-auto h-0.5 w-8 rounded bg-surface-3" />
      {servers.map((s) => (
        <RailItem key={s.id} to={`/channels/${s.id}`} label={s.name} active={s.id === activeId} unread={s.unread} mentions={s.mentions}>
          {s.iconUrl ? (
            <img src={s.iconUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold">{initials(s.name)}</span>
          )}
        </RailItem>
      ))}
      <button
        title="Añadir un servidor"
        onClick={() => setAdding(true)}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-3xl bg-surface-2 text-2xl text-ok transition-all hover:rounded-2xl hover:bg-ok hover:text-white"
      >
        +
      </button>
      {adding && <AddServerModal onClose={() => setAdding(false)} />}
    </nav>
  );
}

function RailItem({
  to,
  label,
  active,
  unread,
  mentions,
  children,
}: {
  to: string;
  label: string;
  active: boolean;
  unread: boolean;
  mentions: number;
  children: ReactNode;
}) {
  const a11y = mentions ? `${label}, ${mentions} menciones` : unread ? `${label}, no leído` : label;
  return (
    <div className="group relative flex w-full shrink-0 justify-center">
      <span
        className={`absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r bg-fg transition-all ${
          active ? 'h-10' : unread ? 'h-2 group-hover:h-5' : 'h-0 group-hover:h-5'
        }`}
      />
      <Link
        to={to}
        title={label}
        aria-label={a11y}
        aria-current={active ? 'page' : undefined}
        className={`relative grid h-12 w-12 place-items-center transition-all ${
          active ? 'rounded-2xl bg-accent text-white' : 'rounded-3xl bg-surface-2 hover:rounded-2xl hover:bg-accent hover:text-white'
        }`}
      >
        <span className="grid h-full w-full place-items-center overflow-hidden rounded-[inherit]">{children}</span>
        {mentions > 0 && <Badge n={mentions} className="-right-1 -bottom-1 border-4 border-surface-0" />}
      </Link>
    </div>
  );
}

export function Badge({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`absolute grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[0.7rem] font-bold text-white ${className}`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
