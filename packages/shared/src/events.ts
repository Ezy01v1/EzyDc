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
  /** Mensaje completo: al editar pueden cambiar las menciones. */
  MESSAGE_UPDATE: (m: Omit<MessageDto, 'reactions'>) => void;
  /** Sala ch:*. `url`/`name` solo en emojis personalizados. */
  MESSAGE_REACTION_ADD: (p: { channelId: string; messageId: string; userId: string; emoji: string; url?: string; name?: string }) => void;
  MESSAGE_REACTION_REMOVE: (p: { channelId: string; messageId: string; userId: string; emoji: string }) => void;
  /** Cambió la lista de emojis del servidor. Sala srv:*. */
  EMOJIS_UPDATE: (p: { serverId: string }) => void;
  MESSAGE_DELETE: (m: { id: string; channelId: string }) => void;
  /** Aviso mínimo para no leídos en canales a los que no estás suscrito.
   *  serverId null = DM o grupo (se envía a las salas user:* de los participantes). */
  CHANNEL_ACTIVITY: (p: { serverId: string | null; channelId: string; messageId: string; authorId: string }) => void;
  /** Te han mencionado (o es un DM): +1 al contador de ese canal. Sala user:*. */
  MENTION_CREATE: (p: { serverId: string | null; channelId: string; messageId: string }) => void;
  /** Leíste un canal en otra pestaña/dispositivo. Sala user:*. */
  CHANNEL_ACK: (p: { channelId: string; messageId: string }) => void;
  /** Cambió tu lista de DMs (nuevo grupo, te añadieron o saliste). Sala user:*. */
  DM_CHANNELS_UPDATE: (p: { channelId: string }) => void;
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
  /** Cambió algún rol (crear/editar/borrar/reordenar): recargar detalle y permisos. */
  ROLES_UPDATE: (p: { serverId: string }) => void;
  MEMBER_UPDATE: (p: { serverId: string; userId: string; roleIds: string[] }) => void;
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
