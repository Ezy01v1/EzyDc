import type { ClientToServerEvents, ServerToClientEvents } from '@ezydc/shared';
import { io, type Socket } from 'socket.io-client';
import { api } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const WS_URL = import.meta.env.VITE_WS_URL || undefined; // undefined = mismo origen

let socket: AppSocket | null = null;
let currentChannel: string | null = null;

/** Conexión única y perezosa. Reconexión con backoff exponencial + jitter (1 s → 15 s). */
export function getSocket(): AppSocket {
  if (socket) return socket;
  socket = io(WS_URL ?? '', {
    path: '/socket.io',
    transports: ['websocket'], // sin long-polling: menos peticiones y menos CPU
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.5,
    // Token efímero pedido en cada (re)conexión: no hacen falta cookies cross-site.
    auth: (cb) => {
      api<{ token: string }>('/auth/socket-token')
        .then(({ token }) => cb({ token }))
        .catch(() => cb({}));
    },
  });
  socket.on('connect', () => {
    if (currentChannel) socket?.emit('channel:subscribe', { channelId: currentChannel }, () => {});
  });
  return socket;
}

/** Solo el canal visible recibe payloads completos. */
export function subscribeChannel(channelId: string | null): void {
  currentChannel = channelId;
  const s = getSocket();
  if (channelId && s.connected) s.emit('channel:subscribe', { channelId }, () => {});
}

export function getCurrentChannel(): string | null {
  return currentChannel;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentChannel = null;
}
