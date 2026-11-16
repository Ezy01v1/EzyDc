import type { ServerSummary } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { ServerRail } from './ServerRail';
import { ServerView } from './ServerView';
import { UserPanel } from './UserPanel';
import { useRealtime } from './useRealtime';

export default function AppLayout() {
  const { serverId, channelId } = useParams();
  useRealtime();
  const servers = useQuery({ queryKey: qk.servers, queryFn: () => api<ServerSummary[]>('/servers') });

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-2 text-fg">
      <ServerRail servers={servers.data ?? []} activeId={serverId} />
      {serverId ? (
        <ServerView key={serverId} serverId={serverId} channelId={channelId} />
      ) : (
        <div className="flex flex-1">
          <aside className="hidden w-60 flex-col bg-surface-1 md:flex">
            <div className="flex-1 p-4 text-sm text-fg-subtle">Mensajes directos llegan en la Fase 3.</div>
            <UserPanel />
          </aside>
          <main className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <h1 className="text-2xl font-bold">Bienvenido a ezyDC</h1>
              <p className="mt-2 text-fg-muted">
                {servers.data?.length
                  ? 'Elige un servidor a la izquierda.'
                  : 'Crea un servidor o únete con una invitación usando el botón “+”.'}
              </p>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
