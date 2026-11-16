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
  /** Permisos efectivos del usuario por canal visible. */
  channelPermissions: Record<string, string>;
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
  nonce?: string;
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

export interface Page<T> {
  items: T[];
  /** Cursor para la siguiente página o null si no hay más. */
  next: string | null;
}
