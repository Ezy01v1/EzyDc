import type { ServerSummary } from '@ezydc/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { initials } from '../../lib/format';
import { AddServerModal } from './modals/AddServerModal';

export function ServerRail({ servers, activeId }: { servers: ServerSummary[]; activeId?: string }) {
  const [adding, setAdding] = useState(false);

  return (
    <nav aria-label="Servidores" className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-surface-0 py-3">
      <RailItem to="/channels" label="Inicio" active={!activeId}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4 5h16v11H8l-4 4V5z" />
        </svg>
      </RailItem>
      <div className="mx-auto h-0.5 w-8 rounded bg-surface-3" />
      {servers.map((s) => (
        <RailItem key={s.id} to={`/channels/${s.id}`} label={s.name} active={s.id === activeId}>
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
        className="grid h-12 w-12 place-items-center rounded-3xl bg-surface-2 text-2xl text-ok transition-all hover:rounded-2xl hover:bg-ok hover:text-white"
      >
        +
      </button>
      {adding && <AddServerModal onClose={() => setAdding(false)} />}
    </nav>
  );
}

function RailItem({ to, label, active, children }: { to: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <div className="group relative flex w-full justify-center">
      <span
        className={`absolute top-1/2 left-0 w-1 -translate-y-1/2 rounded-r bg-fg transition-all ${
          active ? 'h-10' : 'h-0 group-hover:h-5'
        }`}
      />
      <Link
        to={to}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`grid h-12 w-12 place-items-center overflow-hidden transition-all ${
          active ? 'rounded-2xl bg-accent text-white' : 'rounded-3xl bg-surface-2 hover:rounded-2xl hover:bg-accent hover:text-white'
        }`}
      >
        {children}
      </Link>
    </div>
  );
}
