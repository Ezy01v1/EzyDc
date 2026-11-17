/** DTOs que viajan por REST y WebSocket. Fechas en ISO-8601, permisos como string. */

export type UserStatus = 'ONLINE' | 'IDLE' | 'DND' | 'INVISIBLE';
export type PresenceStatus = 'ONLINE' | 'IDLE' | 'DND' | 'OFFLINE';

export interface UserPublic {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface UserSelf extends UserPublic {
  email: string;
  bio: string | null;
  bannerUrl: string | null;
  customStatus: string | null;
  status: UserStatus;
  totpEnabled: boolean;
}

export type ChannelType = 'TEXT' | 'VOICE' | 'ANNOUNCEMENT' | 'CATEGORY' | 'DM' | 'GROUP_DM' | 'THREAD';

export interface ChannelDto {
  id: string;
  serverId: string | null;
  parentId: string | null;
  type: ChannelType;
  name: string | null;
  topic: string | null;
  position: number;
  slowmodeSeconds: number;
  lastMessageId: string | null;
}

export interface RoleDto {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
}

export interface ServerSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
}

export interface ServerDetail extends ServerSummary {
  channels: ChannelDto[];
  roles: RoleDto[];
  /** Permisos del usuario a nivel servidor. */
  myPermissions: string;
  /** Roles del usuario (para calcular su jerarquía en la UI). */
  myRoleIds: string[];
  /** Permisos efectivos del usuario por canal visible. */
  channelPermissions: Record<string, string>;
}

export interface OverwriteDto {
  targetId: string;
  type: 'ROLE' | 'MEMBER';
  allow: string;
  deny: string;
}

export interface MemberDto {
  user: UserPublic;
  nickname: string | null;
  roleIds: string[];
  joinedAt: string;
  presence: PresenceStatus;
}

export interface MessageDto {
  id: string;
  channelId: string;
  author: UserPublic | null;
  content: string;
  type: string;
  createdAt: string;
  editedAt: string | null;
  replyTo: { id: string; author: UserPublic | null; content: string } | null;
  /** Usuarios mencionados con <@id> (para pintar "@nombre"). */
  mentions: UserPublic[];
  /** Roles mencionados con <@&id>. */
  mentionRoleIds: string[];
  mentionEveryone: boolean;
  attachments: AttachmentDto[];
  /** Agrupadas por emoji, en orden de primera reacción. `me` depende de quién pide. */
  reactions: ReactionDto[];
  /** Vistas previas de enlaces (llegan después, con MESSAGE_EMBEDS_UPDATE). */
  embeds: EmbedDto[];
  nonce?: string;
}

export interface EmbedDto {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
  /** Color del sitio (meta theme-color), "#rrggbb". */
  color: string | null;
}

export interface AttachmentDto {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
}

export interface ReactionDto {
  /** Unicode, o "c:<emojiId>" si es personalizado. */
  emoji: string;
  count: number;
  me: boolean;
  /** Imagen y nombre del emoji personalizado. */
  url?: string;
  name?: string;
}

export interface EmojiDto {
  id: string;
  serverId: string;
  name: string;
  animated: boolean;
  url: string;
}

/** Subida directa a R2: PUT a uploadUrl con EXACTAMENTE estas cabeceras. */
export interface UploadTicket {
  uploadId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

export interface PublicConfig {
  /** Base pública de R2 (null si los archivos no están configurados). */
  cdnUrl: string | null;
  maxUploadBytes: number;
  /** Clave pública VAPID para Web Push (null si no está configurado). */
  vapidPublicKey: string | null;
}

/** DM 1:1 o grupo privado. `recipients` excluye al propio usuario. */
export interface DmChannelDto extends ChannelDto {
  ownerId: string | null;
  recipients: UserPublic[];
}

export interface ReadStateDto {
  channelId: string;
  lastReadMessageId: string | null;
  mentionCount: number;
}

export type NotificationLevel = 'ALL' | 'MENTIONS' | 'NONE';

export interface NotificationSettingDto {
  /** Id de servidor o de canal. */
  targetId: string;
  muted: boolean;
  level: NotificationLevel;
}

export interface ReadStatesResponse {
  readStates: ReadStateDto[];
  settings: NotificationSettingDto[];
}

/** Servidor en la barra lateral, con su estado de no leídos ya calculado. */
export interface ServerListItem extends ServerSummary {
  unread: boolean;
  mentions: number;
}

export interface InviteDto {
  code: string;
  serverId: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
}

export interface InvitePreview {
  code: string;
  server: ServerSummary & { memberCount: number };
  expiresAt: string | null;
}

export interface AuthResponse {
  user: UserSelf;
}

/** El login puede requerir un segundo paso: se canjea el ticket (5 min) con el código. */
export type LoginResponse = AuthResponse | { mfaRequired: true; ticket: string };

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  /** Código QR como SVG (generado en el servidor). */
  qrSvg: string;
}

export interface BackupCodes {
  /** Se muestran UNA sola vez; en la BD solo se guarda su hash. */
  codes: string[];
}

export interface Page<T> {
  items: T[];
  /** Cursor para la siguiente página o null si no hay más. */
  next: string | null;
}
