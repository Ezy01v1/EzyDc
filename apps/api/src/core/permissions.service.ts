import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  computeBasePermissions,
  computeChannelPermissions,
  DM_PERMISSIONS,
  hasPermission,
  type OverwriteLike,
  Permission,
  type ServerToClientEvents,
} from '@ezydc/shared';
import type { ChannelType } from '@prisma/client';
import { CacheService } from './cache.service';
import { PrismaService } from './prisma.service';
import { RealtimeService, room } from './realtime.service';

const TTL = 300; // 5 min; además se invalida explícitamente
const VERSION_TTL = 30 * 86400;

/** Contexto de permisos de un miembro a nivel servidor. */
export interface MemberContext {
  perms: bigint;
  roleIds: string[];
  /** Posición de su rol más alto (0 = solo @everyone). Infinity si es el dueño. */
  top: number;
  isOwner: boolean;
}

interface CachedBase {
  perms: string;
  roleIds: string[];
  top: number;
  owner: boolean;
}

export interface ChannelMeta {
  id: string;
  serverId: string | null;
  type: ChannelType;
  overwrites: { targetId: string; type: 'ROLE' | 'MEMBER'; allow: string; deny: string }[];
}

/**
 * Cálculo de permisos con caché (Redis o memoria). TODA acción pasa por aquí.
 *
 * Invalidación O(1): las claves base incluyen la "versión" del servidor
 * (perm:ver:<serverId>). Cambiar cualquier rol incrementa la versión y todas las
 * entradas antiguas dejan de leerse (caducan solas por TTL). Sin SCAN ni KEYS.
 */
@Injectable()
export class PermissionsService {
  private readonly log = new Logger(PermissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly realtime: RealtimeService,
  ) {}

  private verKey = (serverId: string) => `perm:ver:${serverId}`;
  private baseKey = (serverId: string, ver: number, userId: string) => `perm:base:${serverId}:${ver}:${userId}`;
  private everyoneKey = (serverId: string, ver: number) => `perm:everyone:${serverId}:${ver}`;
  private chanKey = (channelId: string) => `perm:chan:${channelId}`;

  private async version(serverId: string): Promise<number> {
    return (await this.cache.get<number>(this.verKey(serverId))) ?? 0;
  }

  /** Contexto del miembro, o null si no pertenece al servidor. */
  async getBase(serverId: string, userId: string): Promise<MemberContext | null> {
    const ver = await this.version(serverId);
    const key = this.baseKey(serverId, ver, userId);
    const cached = await this.cache.get<CachedBase | false>(key);
    if (cached === false) return null;
    if (cached) {
      return {
        perms: BigInt(cached.perms),
        roleIds: cached.roleIds,
        top: cached.owner ? Infinity : cached.top,
        isOwner: cached.owner,
      };
    }

    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: {
        roles: { select: { roleId: true, role: { select: { permissions: true, position: true } } } },
        server: {
          select: { ownerId: true, roles: { where: { id: serverId }, select: { permissions: true } } },
        },
      },
    });
    if (!member) {
      await this.cache.set(key, false, 30);
      return null;
    }
    const isOwner = member.server.ownerId === userId;
    const perms = computeBasePermissions({
      isOwner,
      everyone: member.server.roles[0]?.permissions ?? 0n,
      rolePerms: member.roles.map((r) => r.role.permissions),
    });
    const roleIds = member.roles.map((r) => r.roleId);
    const top = member.roles.reduce((m, r) => Math.max(m, r.role.position), 0);
    // Infinity no es serializable en JSON: se guarda el flag owner y se reconstruye al leer.
    await this.cache.set(key, { perms: perms.toString(), roleIds, top, owner: isOwner } satisfies CachedBase, TTL);
    return { perms, roleIds, top: isOwner ? Infinity : top, isOwner };
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

  /** Exige VIEW_CHANNEL + flags. Sin VIEW_CHANNEL responde 404 (no revela que existe). */
  async assertChannel(channelId: string, userId: string, ...flags: bigint[]): Promise<ChannelMeta> {
    const { perms, meta } = await this.channelPermissions(channelId, userId);
    if (!hasPermission(perms, Permission.VIEW_CHANNEL)) throw new NotFoundException('Canal no encontrado');
    if (!hasPermission(perms, ...flags)) throw new ForbiddenException('Permisos insuficientes');
    return meta;
  }

  async assertServer(serverId: string, userId: string, ...flags: bigint[]): Promise<MemberContext> {
    const base = await this.getBase(serverId, userId);
    if (!base) throw new NotFoundException('Servidor no encontrado');
    if (!hasPermission(base.perms, ...flags)) throw new ForbiddenException('Permisos insuficientes');
    return base;
  }

  // ───────── invalidación ─────────

  async invalidateMember(serverId: string, userId: string): Promise<void> {
    await this.cache.del(this.baseKey(serverId, await this.version(serverId), userId));
  }

  /** Invalida los permisos de TODOS los miembros del servidor (cambio de roles). */
  async invalidateServer(serverId: string): Promise<void> {
    await this.cache.incr(this.verKey(serverId), 1, VERSION_TTL);
  }

  invalidateChannel(channelId: string): Promise<void> {
    return this.cache.del(this.chanKey(channelId));
  }

  // ───────── tiempo real consciente de permisos ─────────

  private async everyonePerms(serverId: string): Promise<bigint> {
    const key = this.everyoneKey(serverId, await this.version(serverId));
    const cached = await this.cache.get<string>(key);
    if (cached !== null) return BigInt(cached);
    const role = await this.prisma.role.findUnique({ where: { id: serverId }, select: { permissions: true } });
    const perms = role?.permissions ?? 0n;
    await this.cache.set(key, perms.toString(), TTL);
    return perms;
  }

  /**
   * Un canal es "público" si TODOS los miembros pueden verlo: @everyone tiene VIEW_CHANNEL
   * y ningún override lo deniega (los allow nunca quitan visibilidad).
   */
  async isPublic(meta: ChannelMeta): Promise<boolean> {
    if (!meta.serverId) return false;
    if (meta.overwrites.some((o) => (BigInt(o.deny) & Permission.VIEW_CHANNEL) !== 0n)) return false;
    return hasPermission(await this.everyonePerms(meta.serverId), Permission.VIEW_CHANNEL);
  }

  /**
   * Emite a la sala del servidor SOLO a quien puede ver el canal.
   * Canal público → un único broadcast. Privado → filtra los sockets conectados.
   */
  async emitToChannelViewers<E extends keyof ServerToClientEvents>(
    meta: ChannelMeta,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): Promise<void> {
    const io = this.realtime.server;
    if (!io || !meta.serverId) return;
    if (await this.isPublic(meta)) {
      io.to(room.server(meta.serverId)).emit(event, payload);
      return;
    }
    const sockets = await io.in(room.server(meta.serverId)).fetchSockets();
    const allowed = new Map<string, boolean>();
    const ids: string[] = [];
    for (const s of sockets) {
      const userId = (s.data as { userId?: string }).userId;
      if (!userId) continue;
      if (!allowed.has(userId)) {
        const { perms } = await this.channelPermissions(meta.id, userId);
        allowed.set(userId, hasPermission(perms, Permission.VIEW_CHANNEL));
      }
      if (allowed.get(userId)) ids.push(s.id);
    }
    if (ids.length) io.to(ids).emit(event, payload);
  }

  /**
   * Tras un cambio de permisos, saca de las salas ch:* a quien ya no pueda ver el canal.
   * Asíncrono y tolerante a fallos: nunca bloquea la respuesta HTTP.
   */
  revalidateSockets(serverId: string, userId?: string): void {
    void this.doRevalidate(serverId, userId).catch((e: unknown) => this.log.warn(`revalidate: ${String(e)}`));
  }

  private async doRevalidate(serverId: string, onlyUser?: string): Promise<void> {
    const io = this.realtime.server;
    if (!io) return;
    const channels = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true } });
    for (const ch of channels) {
      const target = onlyUser ? io.in(room.user(onlyUser)) : io.in(room.channel(ch.id));
      for (const s of await target.fetchSockets()) {
        if (!s.rooms.has(room.channel(ch.id))) continue;
        const uid = (s.data as { userId?: string }).userId;
        if (!uid) continue;
        const { perms } = await this.channelPermissions(ch.id, uid);
        if (!hasPermission(perms, Permission.VIEW_CHANNEL)) s.leave(room.channel(ch.id));
      }
    }
  }
}

export function toOverwrite(o: ChannelMeta['overwrites'][number]): OverwriteLike {
  return { targetId: o.targetId, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) };
}
