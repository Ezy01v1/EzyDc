import type { ServerListItem } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { ServerRail } from './ServerRail';
import { ServerView } from './ServerView';
import { DmView } from './dms/DmView';
import { useRealtime } from './useRealtime';
import { useUnreadTitle } from './useUnreadTitle';

export default function AppLayout() {
  const { serverId, channelId } = useParams();
  useRealtime();
  const servers = useQuery({ queryKey: qk.servers, queryFn: () => api<ServerListItem[]>('/servers') });
  useUnreadTitle(servers.data);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-2 text-fg">
      <ServerRail servers={servers.data ?? []} activeId={serverId} />
      {serverId && serverId !== '@me' ? (
        <ServerView key={serverId} serverId={serverId} channelId={channelId} />
      ) : (
        <DmView channelId={channelId} />
      )}
    </div>
  );
}
