import type { ChannelDto, MemberDto, MessageDto, PresenceStatus } from './types';

/**
 * Contrato del gateway Socket.IO.
 *
 * Salas:
 *  - user:<userId>  → eventos personales (todas las pestañas del usuario)
 *  - srv:<serverId> → eventos LIGEROS del servidor (actividad, canales, miembros, presencia)
 *  - ch:<channelId> → payload completo de mensajes; solo el canal visible
 *
 * Las escrituras van por REST; el socket solo difunde.
 */
export interface ServerToClientEvents {
  MESSAGE_CREATE: (m: MessageDto) => void;
  MESSAGE_UPDATE: (m: { id: string; channelId: string; content: string; editedAt: string }) => void;
  MESSAGE_DELETE: (m: { id: string; channelId: string }) => void;
  /** Aviso mínimo para no leídos en canales a los que no estás suscrito. */
  CHANNEL_ACTIVITY: (p: { serverId: string; channelId: string; messageId: string; authorId: string }) => void;
  CHANNEL_CREATE: (c: ChannelDto) => void;
  CHANNEL_UPDATE: (c: ChannelDto) => void;
  CHANNEL_DELETE: (p: { id: string; serverId: string }) => void;
  CHANNELS_REORDER: (p: {
    serverId: string;
    positions: { id: string; position: number; parentId?: string | null }[];
  }) => void;
  SERVER_DELETE: (p: { id: string }) => void;
  MEMBER_ADD: (p: { serverId: string; member: MemberDto }) => void;
  MEMBER_REMOVE: (p: { serverId: string; userId: string }) => void;
  TYPING_START: (p: { channelId: string; userId: string; username: string }) => void;
  PRESENCE_UPDATE: (p: { userId: string; status: PresenceStatus }) => void;
}

export interface ClientToServerEvents {
  'channel:subscribe': (p: { channelId: string }, ack: (r: { ok: boolean }) => void) => void;
  'channel:unsubscribe': (p: { channelId: string }) => void;
  'typing:start': (p: { channelId: string }) => void;
  /** Medición de latencia: el servidor responde con su hora. */
  'sys:ping': (ack: (r: { t: number }) => void) => void;
}
