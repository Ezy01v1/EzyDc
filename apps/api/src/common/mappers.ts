import type { ChannelDto, MessageDto, RoleDto, ServerSummary, UserPublic, UserSelf } from '@ezydc/shared';
import type { Channel, Prisma, Role, Server, User } from '@prisma/client';

/** Selects mínimos: nunca traer columnas que no se envían (passwordHash, totpSecret...). */
export const userPublicSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const messageInclude = {
  author: { select: userPublicSelect },
  replyTo: { select: { id: true, content: true, author: { select: userPublicSelect } } },
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function toUserSelf(u: User): UserSelf {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    email: u.email,
    bio: u.bio,
    bannerUrl: u.bannerUrl,
    customStatus: u.customStatus,
    status: u.status,
    totpEnabled: u.totpEnabled,
  };
}

export function toUserPublic(u: UserPublic): UserPublic {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl };
}

export function toServerSummary(s: Pick<Server, 'id' | 'name' | 'iconUrl' | 'ownerId'>): ServerSummary {
  return { id: s.id, name: s.name, iconUrl: s.iconUrl, ownerId: s.ownerId };
}

export function toChannelDto(c: Channel): ChannelDto {
  return {
    id: c.id,
    serverId: c.serverId,
    parentId: c.parentId,
    type: c.type,
    name: c.name,
    topic: c.topic,
    position: c.position,
    slowmodeSeconds: c.slowmodeSeconds,
    lastMessageId: c.lastMessageId,
  };
}

export function toRoleDto(r: Role): RoleDto {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    position: r.position,
    permissions: r.permissions.toString(),
    hoist: r.hoist,
    mentionable: r.mentionable,
  };
}

export function toMessageDto(m: MessageRow, nonce?: string): MessageDto {
  return {
    id: m.id,
    channelId: m.channelId,
    author: m.author,
    content: m.content,
    type: m.type,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    replyTo: m.replyTo
      ? { id: m.replyTo.id, author: m.replyTo.author, content: m.replyTo.content.slice(0, 200) }
      : null,
    ...(nonce ? { nonce } : {}),
  };
}
