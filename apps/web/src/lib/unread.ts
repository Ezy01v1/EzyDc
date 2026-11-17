import type { NotificationSettingDto, ReadStateDto, ReadStatesResponse, ServerListItem } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { queryClient, qk } from './queryClient';

export interface ReadIndex {
  states: Map<string, ReadStateDto>;
  settings: Map<string, NotificationSettingDto>;
}

const EMPTY: ReadIndex = { states: new Map(), settings: new Map() };

/** Estados de lectura del usuario (una petición; luego el socket los mantiene). */
export function useReadIndex(): ReadIndex {
  const { data } = useQuery({
    queryKey: qk.readStates,
    queryFn: () => api<ReadStatesResponse>('/users/me/read-states'),
    staleTime: Infinity,
    select: (d): ReadIndex => ({
      states: new Map(d.readStates.map((s) => [s.channelId, s])),
      settings: new Map(d.settings.map((s) => [s.targetId, s])),
    }),
  });
  return data ?? EMPTY;
}

export const isMuted = (idx: ReadIndex, ...targetIds: (string | null | undefined)[]) =>
  targetIds.some((id) => !!id && idx.settings.get(id)?.muted);

/** UUIDv7: comparar ids como texto equivale a comparar por fecha. */
export function isUnread(idx: ReadIndex, channelId: string, lastMessageId: string | null): boolean {
  if (!lastMessageId) return false;
  return lastMessageId > (idx.states.get(channelId)?.lastReadMessageId ?? '');
}

export const mentionCount = (idx: ReadIndex, channelId: string) => idx.states.get(channelId)?.mentionCount ?? 0;

// ───────── mutaciones locales (las disparan el socket y los acks) ─────────

function patchState(channelId: string, fn: (s: ReadStateDto) => ReadStateDto) {
  queryClient.setQueryData<ReadStatesResponse>(qk.readStates, (d) => {
    if (!d) return d;
    const prev = d.readStates.find((s) => s.channelId === channelId) ?? { channelId, lastReadMessageId: null, mentionCount: 0 };
    return { ...d, readStates: [...d.readStates.filter((s) => s.channelId !== channelId), fn(prev)] };
  });
}

export function localAck(channelId: string, messageId: string) {
  patchState(channelId, (s) => ({
    ...s,
    lastReadMessageId: !s.lastReadMessageId || messageId > s.lastReadMessageId ? messageId : s.lastReadMessageId,
    mentionCount: 0,
  }));
}

export function localMention(channelId: string, serverId: string | null) {
  patchState(channelId, (s) => ({ ...s, mentionCount: s.mentionCount + 1 }));
  if (serverId) {
    queryClient.setQueryData<ServerListItem[]>(qk.servers, (l) => l?.map((x) => (x.id === serverId ? { ...x, mentions: x.mentions + 1 } : x)));
  }
}

export function setSetting(setting: NotificationSettingDto) {
  queryClient.setQueryData<ReadStatesResponse>(qk.readStates, (d) =>
    d ? { ...d, settings: [...d.settings.filter((s) => s.targetId !== setting.targetId), setting] } : d,
  );
}

let serversTimer: number | undefined;
/** El resumen de la barra de servidores se recalcula en el servidor; agrupamos las recargas. */
export function refreshServerBadges() {
  window.clearTimeout(serversTimer);
  serversTimer = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: qk.servers }), 1500);
}

export async function toggleMute(targetId: string, muted: boolean) {
  setSetting({ targetId, muted, level: 'ALL' });
  const s = await api<NotificationSettingDto>(`/users/me/notification-settings/${targetId}`, { method: 'PUT', body: { muted } });
  setSetting(s);
  refreshServerBadges();
}
