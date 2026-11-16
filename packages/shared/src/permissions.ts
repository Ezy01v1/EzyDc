/**
 * Permisos por bits (BigInt). Mismos valores en servidor y cliente.
 * El servidor SIEMPRE recalcula; el cliente solo lo usa para mostrar/ocultar UI.
 * En JSON viajan como string decimal (BigInt no es serializable).
 */
export const Permission = {
  CREATE_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_SERVER: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EMOJIS: 1n << 30n,
  CREATE_THREADS: 1n << 35n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  MODERATE_MEMBERS: 1n << 40n,
} as const;

export type PermissionName = keyof typeof Permission;

export const ALL_PERMISSIONS: bigint = Object.values(Permission).reduce((acc, p) => acc | p, 0n);

const P = Permission;

/** Permisos por defecto del rol @everyone al crear un servidor. */
export const DEFAULT_EVERYONE_PERMISSIONS: bigint =
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.READ_MESSAGE_HISTORY |
  P.ADD_REACTIONS |
  P.CREATE_INVITE |
  P.EMBED_LINKS |
  P.ATTACH_FILES |
  P.USE_EXTERNAL_EMOJIS |
  P.CONNECT |
  P.SPEAK |
  P.STREAM |
  P.CHANGE_NICKNAME |
  P.CREATE_THREADS |
  P.SEND_MESSAGES_IN_THREADS;

/** Permisos implícitos en DMs y grupos privados. */
export const DM_PERMISSIONS: bigint =
  P.VIEW_CHANNEL |
  P.SEND_MESSAGES |
  P.READ_MESSAGE_HISTORY |
  P.ADD_REACTIONS |
  P.EMBED_LINKS |
  P.ATTACH_FILES |
  P.USE_EXTERNAL_EMOJIS |
  P.CONNECT |
  P.SPEAK |
  P.STREAM;

/** true si `perms` contiene TODOS los flags (ADMINISTRATOR lo concede todo). */
export function hasPermission(perms: bigint, ...flags: bigint[]): boolean {
  if ((perms & P.ADMINISTRATOR) === P.ADMINISTRATOR) return true;
  return flags.every((f) => (perms & f) === f);
}

export interface OverwriteLike {
  targetId: string;
  type: 'ROLE' | 'MEMBER';
  allow: bigint;
  deny: bigint;
}

/** Permisos a nivel de servidor: @everyone | roles del miembro. */
export function computeBasePermissions(input: {
  isOwner: boolean;
  everyone: bigint;
  rolePerms: readonly bigint[];
}): bigint {
  if (input.isOwner) return ALL_PERMISSIONS;
  let perms = input.everyone;
  for (const p of input.rolePerms) perms |= p;
  if ((perms & P.ADMINISTRATOR) === P.ADMINISTRATOR) return ALL_PERMISSIONS;
  return perms;
}

/**
 * Aplica overrides de canal en el orden de Discord:
 * 1) @everyone (targetId === serverId)  2) roles del miembro (combinados)  3) el miembro.
 */
export function computeChannelPermissions(input: {
  base: bigint;
  serverId: string;
  userId: string;
  roleIds: readonly string[];
  overwrites: readonly OverwriteLike[];
}): bigint {
  const { base, serverId, userId, roleIds, overwrites } = input;
  if ((base & P.ADMINISTRATOR) === P.ADMINISTRATOR) return ALL_PERMISSIONS;

  let perms = base;
  const everyone = overwrites.find((o) => o.targetId === serverId);
  if (everyone) perms = (perms & ~everyone.deny) | everyone.allow;

  let allow = 0n;
  let deny = 0n;
  for (const o of overwrites) {
    if (o.type === 'ROLE' && o.targetId !== serverId && roleIds.includes(o.targetId)) {
      allow |= o.allow;
      deny |= o.deny;
    }
  }
  perms = (perms & ~deny) | allow;

  const member = overwrites.find((o) => o.type === 'MEMBER' && o.targetId === userId);
  if (member) perms = (perms & ~member.deny) | member.allow;

  return perms;
}
