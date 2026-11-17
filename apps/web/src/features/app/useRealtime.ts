import type { DmChannelDto, MemberDto, MessageDto, Page, ServerListItem, ServerToClientEvents } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { getCurrentChannel, getSocket } from '../../lib/socket';
import { localAck, localMention, refreshServerBadges } from '../../lib/unread';
import { useAuth } from '../../stores/auth';
import { useLive } from '../../stores/live';
import { lastConfirmedId, patchMessage, removeMessage, upsertMessage } from './messageCache';

const SERVER_EVENTS = [
  'MESSAGE_CREATE',
  'MESSAGE_UPDATE',
  'MESSAGE_DELETE',
  'CHANNEL_ACTIVITY',
  'CHANNEL_CREATE',
  'CHANNEL_UPDATE',
  'CHANNEL_DELETE',
  'CHANNELS_REORDER',
  'MEMBER_ADD',
  'MEMBER_REMOVE',
  'TYPING_START',
  'PRESENCE_UPDATE',
  'ROLES_UPDATE',
  'MEMBER_UPDATE',
  'MENTION_CREATE',
  'CHANNEL_ACK',
  'DM_CHANNELS_UPDATE',
] as const satisfies readonly (keyof ServerToClientEvents)[];

/** Conecta el socket y traduce eventos a la caché de TanStack Query / stores. */
export function useRealtime(): void {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { serverId } = useParams();
  const me = useAuth((s) => s.user?.id);

  useEffect(() => {
    const s = getSocket();
    const live = useLive.getState();
    let hadConnected = false;

    const onConnect = async () => {
      live.set({ connected: true });
      if (!hadConnected) {
        hadConnected = true;
        return;
      }
      // Reconexión: sincronización INCREMENTAL del canal visible (solo lo que falta)…
      const ch = getCurrentChannel();
      const after = ch ? lastConfirmedId(qc, ch) : undefined;
      if (ch && after) {
        try {
          const missed = await api<MessageDto[]>(`/channels/${ch}/messages?after=${after}&limit=100`);
          missed.forEach((m) => upsertMessage(qc, m));
          if (missed.length === 100) await qc.resetQueries({ queryKey: qk.messages(ch) });
        } catch {
          /* se reintentará en la próxima reconexión */
        }
      }
      // …y el resto de canales cacheados se descarta (se recargan al abrirlos).
      qc.removeQueries({ queryKey: ['messages'], predicate: (q) => q.queryKey[1] !== ch });
      void qc.invalidateQueries({ queryKey: qk.servers });
      void qc.invalidateQueries({ queryKey: ['server'] });
      void qc.invalidateQueries({ queryKey: ['members'] });
      void qc.invalidateQueries({ queryKey: qk.readStates });
      void qc.invalidateQueries({ queryKey: qk.dms });
    };
    const onDisconnect = () => live.set({ connected: false });

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    if (s.connected) void onConnect();

    s.on('MESSAGE_CREATE', (m) => {
      upsertMessage(qc, m);
      if (m.author) useLive.getState().clearTyping(m.channelId, m.author.id);
    });
    s.on('MESSAGE_UPDATE', (m) => patchMessage(qc, m.channelId, m.id, m));
    s.on('MESSAGE_DELETE', (m) => removeMessage(qc, m.channelId, m.id));
    s.on('CHANNEL_ACTIVITY', (p) => {
      const mine = p.authorId === useAuth.getState().user?.id;
      const viewing = p.channelId === getCurrentChannel() && document.hasFocus();
      if (p.serverId) {
        qc.setQueryData(qk.server(p.serverId), (d: { channels: { id: string; lastMessageId: string | null }[] } | undefined) =>
          d ? { ...d, channels: d.channels.map((c) => (c.id === p.channelId ? { ...c, lastMessageId: p.messageId } : c)) } : d,
        );
        if (!mine && !viewing) {
          qc.setQueryData<ServerListItem[]>(qk.servers, (l) => l?.map((x) => (x.id === p.serverId ? { ...x, unread: true } : x)));
          refreshServerBadges(); // respeta silenciados y permisos (se calcula en el servidor)
        }
      } else {
        // DM: se mueve arriba de la lista; si no la conocemos (nueva o reabierta), se recarga.
        let known = false;
        qc.setQueryData<DmChannelDto[]>(qk.dms, (l) => {
          const ch = l?.find((c) => c.id === p.channelId);
          if (!l || !ch) return l;
          known = true;
          return [{ ...ch, lastMessageId: p.messageId }, ...l.filter((c) => c.id !== p.channelId)];
        });
        if (!known) void qc.invalidateQueries({ queryKey: qk.dms });
      }
      if (mine) localAck(p.channelId, p.messageId);
    });
    s.on('MENTION_CREATE', (p) => {
      const viewing = p.channelId === getCurrentChannel() && document.hasFocus();
      if (!viewing) localMention(p.channelId, p.serverId);
    });
    s.on('CHANNEL_ACK', (p) => {
      localAck(p.channelId, p.messageId);
      refreshServerBadges();
    });
    s.on('DM_CHANNELS_UPDATE', () => void qc.invalidateQueries({ queryKey: qk.dms }));
    const refreshServer = (sid: string | null) => sid && void qc.invalidateQueries({ queryKey: qk.server(sid) });
    s.on('CHANNEL_CREATE', (c) => refreshServer(c.serverId));
    s.on('CHANNEL_UPDATE', (c) => refreshServer(c.serverId));
    s.on('CHANNEL_DELETE', (c) => refreshServer(c.serverId));
    s.on('CHANNELS_REORDER', (p) => refreshServer(p.serverId));
    s.on('MEMBER_ADD', (p) => void qc.invalidateQueries({ queryKey: qk.members(p.serverId) }));
    s.on('MEMBER_REMOVE', (p) => void qc.invalidateQueries({ queryKey: qk.members(p.serverId) }));
    s.on('TYPING_START', (p) => {
      if (p.userId !== useAuth.getState().user?.id) useLive.getState().setTyping(p.channelId, p.userId, p.username);
    });
    s.on('PRESENCE_UPDATE', (p) => useLive.getState().setPresence(p.userId, p.status));
    // Permisos cambiados: el detalle trae canales visibles y permisos efectivos recalculados.
    s.on('ROLES_UPDATE', (p) => {
      void qc.invalidateQueries({ queryKey: qk.server(p.serverId) });
      void qc.invalidateQueries({ queryKey: qk.members(p.serverId) });
      void qc.invalidateQueries({ queryKey: ['overwrites'] });
    });
    s.on('MEMBER_UPDATE', (p) => {
      qc.setQueryData<Page<MemberDto>>(qk.members(p.serverId), (d) =>
        d ? { ...d, items: d.items.map((m) => (m.user.id === p.userId ? { ...m, roleIds: p.roleIds } : m)) } : d,
      );
      if (p.userId === useAuth.getState().user?.id) void qc.invalidateQueries({ queryKey: qk.server(p.serverId) });
    });

    // Latencia del WebSocket (presupuesto: < 100 ms).
    const ping = () => {
      if (!s.connected) return;
      const t0 = performance.now();
      s.emit('sys:ping', () => useLive.getState().set({ latencyMs: Math.round(performance.now() - t0) }));
    };
    const pingTimer = window.setInterval(ping, 30_000);
    s.on('connect', ping);

    return () => {
      window.clearInterval(pingTimer);
      s.off('connect', onConnect);
      s.off('connect', ping);
      s.off('disconnect', onDisconnect);
      // Los eventos del servidor solo los escucha este hook: se pueden quitar por nombre.
      for (const ev of SERVER_EVENTS) s.off(ev);
    };
  }, [qc]);

  // SERVER_DELETE necesita el servidor actual: listener aparte.
  useEffect(() => {
    const s = getSocket();
    const onDelete = (p: { id: string }) => {
      qc.setQueryData<ServerListItem[]>(qk.servers, (list) => list?.filter((x) => x.id !== p.id));
      qc.removeQueries({ queryKey: qk.server(p.id) });
      if (p.id === serverId) navigate('/channels', { replace: true });
    };
    s.on('SERVER_DELETE', onDelete);
    return () => {
      s.off('SERVER_DELETE', onDelete);
    };
  }, [qc, navigate, serverId, me]);
}
