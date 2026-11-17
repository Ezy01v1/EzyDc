import { hasPermission, type MemberDto, type Page, Permission, type ServerDetail } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useLive } from '../../stores/live';
import { ChannelSidebar } from './ChannelSidebar';
import type { ChatContext } from './chat/chatContext';

// El chat (react-virtuoso + markdown) y la lista de miembros son chunks aparte.
const ChatView = lazy(() => import('./chat/ChatView'));
const MemberList = lazy(() => import('./MemberList'));

export function ServerView({ serverId, channelId }: { serverId: string; channelId?: string }) {
  const navigate = useNavigate();
  const mobileSidebar = useLive((s) => s.mobileSidebar);
  const server = useQuery({
    queryKey: qk.server(serverId),
    queryFn: () => api<ServerDetail>(`/servers/${serverId}`),
  });
  // Misma consulta que la lista de miembros (caché compartida): alimenta el autocompletado de @menciones.
  const members = useQuery({
    queryKey: qk.members(serverId),
    queryFn: () => api<Page<MemberDto>>(`/servers/${serverId}/members?limit=1000`),
    staleTime: 60_000,
  });

  const channel = server.data?.channels.find((c) => c.id === channelId);
  const channelPerms = channel ? BigInt(server.data?.channelPermissions[channel.id] ?? '0') : 0n;

  // Estable entre renders: si cambiara en cada render, todos los mensajes (memo) se repintarían.
  const chatContext = useMemo<ChatContext>(
    () => ({
      serverId,
      roles: server.data?.roles ?? [],
      myRoleIds: server.data?.myRoleIds ?? [],
      people: members.data?.items.map((m) => m.user) ?? [],
      canMentionEveryone: hasPermission(channelPerms, Permission.MENTION_EVERYONE),
    }),
    [serverId, server.data?.roles, server.data?.myRoleIds, members.data, channelPerms],
  );
  const firstText = server.data?.channels
    .filter((c) => c.type === 'TEXT' || c.type === 'ANNOUNCEMENT')
    .sort((a, b) => a.position - b.position)[0];

  // Sin canal (o canal borrado/ya no visible) → primer canal de texto.
  useEffect(() => {
    if (server.data && (!channelId || !channel) && firstText) {
      navigate(`/channels/${serverId}/${firstText.id}`, { replace: true });
    }
  }, [server.data, channelId, channel, firstText, serverId, navigate]);

  if (server.error instanceof ApiError && server.error.status === 404) return <Navigate to="/channels" replace />;
  if (!server.data) return <div className="flex-1 bg-surface-1" />;

  const perms = channel ? BigInt(server.data.channelPermissions[channel.id] ?? '0') : 0n;
  const isText = channel && (channel.type === 'TEXT' || channel.type === 'ANNOUNCEMENT');

  return (
    <div className="flex min-w-0 flex-1">
      <ChannelSidebar server={server.data} activeChannelId={channelId} className={mobileSidebar ? 'flex' : 'hidden md:flex'} />
      <Suspense fallback={<div className="flex-1" />}>
        {channel && isText ? (
          <ChatView
            key={channel.id}
            channel={channel}
            title={channel.name ?? ''}
            icon={channel.type === 'ANNOUNCEMENT' ? '📢' : '#'}
            canSend={hasPermission(perms, Permission.SEND_MESSAGES)}
            canManageMessages={hasPermission(perms, Permission.MANAGE_MESSAGES)}
            context={chatContext}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-fg-muted">
            {channel?.type === 'VOICE' ? 'Los canales de voz llegan en la Fase 4 (LiveKit).' : 'Selecciona un canal.'}
          </div>
        )}
        <MemberList serverId={serverId} />
      </Suspense>
    </div>
  );
}
