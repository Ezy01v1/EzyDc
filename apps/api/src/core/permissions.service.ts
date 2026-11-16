import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeBasePermissions,
  computeChannelPermissions,
  DM_PERMISSIONS,
  hasPermission,
  type OverwriteLike,
  Permission,
} from '@ezydc/shared';
import type { ChannelType } from '@prisma/client';
import { CacheService } from './cache.service';
import { PrismaService } from './prisma.service';

const TTL = 300; // 5 min; se invalida explícitamente al cambiar roles/canales/miembros

interface CachedBase {
  perms: string;
  roleIds: string[];
}

export interface ChannelMeta {
  id: string;
  serverId: string | null;
  type: ChannelType;
  overwrites: { targetId: string; type: 'ROLE' | 'MEMBER'; allow: string; deny: string }[];
}

/**
 * Cálculo de permisos con caché (Redis o memoria).
 * TODA acción de escritura/lectura en la API pasa por aquí: el cliente nunca decide.
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private baseKey = (serverId: string, userId: string) => `perm:base:${serverId}:${userId}`;
  private chanKey = (channelId: string) => `perm:chan:${channelId}`;

  /** Permisos de servidor del usuario + sus roles, o null si no es miembro. */
  async getBase(serverId: string, userId: string): Promise<{ perms: bigint; roleIds: string[] } | null> {
    const key = this.baseKey(serverId, userId);
    const cached = await this.cache.get<CachedBase | false>(key);
    if (cached === false) return null;
    if (cached) return { perms: BigInt(cached.perms), roleIds: cached.roleIds };

    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: {
        roles: { select: { roleId: true, role: { select: { permissions: true } } } },
        server: {
          select: { ownerId: true, roles: { where: { id: serverId }, select: { permissions: true } } },
        },
      },
    });
    if (!member) {
      await this.cache.set(key, false, 30);
      return null;
    }
    const perms = computeBasePermissions({
      isOwner: member.server.ownerId === userId,
      everyone: member.server.roles[0]?.permissions ?? 0n,
      rolePerms: member.roles.map((r) => r.role.permissions),
    });
    const roleIds = member.roles.map((r) => r.roleId);
    await this.cache.set(key, { perms: perms.toString(), roleIds } satisfies CachedBase, TTL);
    return { perms, roleIds };
  }

  async getChannelMeta(channelId: string): Promise<ChannelMeta | null> {
    const key = this.chanKey(channelId);
    const cached = await this.cache.get<ChannelMeta | false>(key);
    if (cached === false) return null;
    if (cached) return cached;

    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true, type: true, overwrites: true },
    });
    if (!ch) {
      await this.cache.set(key, false, 30);
      return null;
    }
    const meta: ChannelMeta = {
      id: ch.id,
      serverId: ch.serverId,
      type: ch.type,
      overwrites: ch.overwrites.map((o) => ({
        targetId: o.targetId,
        type: o.type,
        allow: o.allow.toString(),
        deny: o.deny.toString(),
      })),
    };
    await this.cache.set(key, meta, TTL);
    return meta;
  }

  /** Permisos efectivos del usuario en un canal. */
  async channelPermissions(channelId: string, userId: string): Promise<{ perms: bigint; meta: ChannelMeta }> {
    const meta = await this.getChannelMeta(channelId);
    if (!meta) throw new NotFoundException('Canal no encontrado');

    if (!meta.serverId) {
      const p = await this.prisma.dmParticipant.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { userId: true },
      });
      return { perms: p ? DM_PERMISSIONS : 0n, meta };
    }

    const base = await this.getBase(meta.serverId, userId);
    if (!base) return { perms: 0n, meta };
    const perms = computeChannelPermissions({
      base: base.perms,
      serverId: meta.serverId,
      userId,
      roleIds: base.roleIds,
      overwrites: meta.overwrites.map(toOverwrite),
    });
    return { perms, meta };
  }

  /**
   * Exige VIEW_CHANNEL + flags. Sin VIEW_CHANNEL responde 404 (no revela que el canal existe).
   */
  async assertChannel(channelId: string, userId: string, ...flags: bigint[]): Promise<ChannelMeta> {
    const { perms, meta } = await this.channelPermissions(channelId, userId);
    if (!hasPermission(perms, Permission.VIEW_CHANNEL)) throw new NotFoundException('Canal no encontrado');
    if (!hasPermission(perms, ...flags)) throw new ForbiddenException('Permisos insuficientes');
    return meta;
  }

  async assertServer(serverId: string, userId: string, ...flags: bigint[]): Promise<bigint> {
    const base = await this.getBase(serverId, userId);
    if (!base) throw new NotFoundException('Servidor no encontrado');
    if (!hasPermission(base.perms, ...flags)) throw new ForbiddenException('Permisos insuficientes');
    return base.perms;
  }

  invalidateMember(serverId: string, userId: string): Promise<void> {
    return this.cache.del(this.baseKey(serverId, userId));
  }

  invalidateChannel(channelId: string): Promise<void> {
    return this.cache.del(this.chanKey(channelId));
  }
}

export function toOverwrite(o: ChannelMeta['overwrites'][number]): OverwriteLike {
  return { targetId: o.targetId, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) };
}
