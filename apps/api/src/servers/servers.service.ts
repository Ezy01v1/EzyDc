import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import {
  computeChannelPermissions,
  type CreateInviteInput,
  type CreateServerInput,
  DEFAULT_EVERYONE_PERMISSIONS,
  hasPermission,
  type InviteDto,
  type InvitePreview,
  type MemberDto,
  type PageQuery,
  type Page,
  Permission,
  type PresenceStatus,
  type ServerDetail,
  type ServerSummary,
} from '@ezydc/shared';
import { toChannelDto, toRoleDto, toServerSummary, userPublicSelect } from '../common/mappers';
import { randomCode } from '../common/random';
import { CacheService } from '../core/cache.service';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';

export const presenceKey = (userId: string) => `presence:conn:${userId}`;

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
    private readonly cache: CacheService,
  ) {}

  listForUser(userId: string): Promise<ServerSummary[]> {
    return this.prisma.server.findMany({
      where: { members: { some: { userId } } },
      select: { id: true, name: true, iconUrl: true, ownerId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Crea servidor + rol @everyone + miembro dueño + categorías y canales por defecto, en una transacción. */
  async create(userId: string, input: CreateServerInput): Promise<ServerSummary> {
    const server = await this.prisma.$transaction(async (tx) => {
      const s = await tx.server.create({ data: { name: input.name, ownerId: userId } });
      await tx.role.create({
        data: { id: s.id, serverId: s.id, name: '@everyone', position: 0, permissions: DEFAULT_EVERYONE_PERMISSIONS },
      });
      await tx.member.create({ data: { serverId: s.id, userId } });
      const text = await tx.channel.create({
        data: { serverId: s.id, type: 'CATEGORY', name: 'Canales de texto', position: 0 },
      });
      const voice = await tx.channel.create({
        data: { serverId: s.id, type: 'CATEGORY', name: 'Canales de voz', position: 1 },
      });
      await tx.channel.createMany({
        data: [
          { serverId: s.id, parentId: text.id, type: 'TEXT', name: 'general', position: 0 },
          { serverId: s.id, parentId: voice.id, type: 'VOICE', name: 'General', position: 0 },
        ],
      });
      return s;
    });
    await this.perms.invalidateMember(server.id, userId);
    this.realtime.joinServerRoom(userId, server.id);
    return toServerSummary(server);
  }

  /** Detalle con SOLO los canales que el usuario puede ver y sus permisos efectivos. 2 consultas. */
  async detail(serverId: string, userId: string): Promise<ServerDetail> {
    const base = await this.perms.getBase(serverId, userId);
    if (!base) throw new NotFoundException('Servidor no encontrado');

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        channels: {
          where: { type: { in: ['TEXT', 'VOICE', 'ANNOUNCEMENT', 'CATEGORY'] } },
          include: { overwrites: true },
          orderBy: { position: 'asc' },
        },
        roles: { orderBy: { position: 'desc' } },
      },
    });
    if (!server) throw new NotFoundException('Servidor no encontrado');

    const channelPermissions: Record<string, string> = {};
    const channels = server.channels.filter((c) => {
      const p = computeChannelPermissions({
        base: base.perms,
        serverId,
        userId,
        roleIds: base.roleIds,
        overwrites: c.overwrites,
      });
      if (!hasPermission(p, Permission.VIEW_CHANNEL)) return false;
      channelPermissions[c.id] = p.toString();
      return true;
    });

    return {
      ...toServerSummary(server),
      channels: channels.map(toChannelDto),
      roles: server.roles.map(toRoleDto),
      myPermissions: base.perms.toString(),
      channelPermissions,
    };
  }

  async remove(serverId: string, userId: string): Promise<void> {
    const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!s) throw new NotFoundException('Servidor no encontrado');
    if (s.ownerId !== userId) throw new ForbiddenException('Solo el dueño puede eliminar el servidor');
    const channelIds = await this.channelRooms(serverId);
    await this.prisma.server.delete({ where: { id: serverId } });
    this.realtime.emit(room.server(serverId), 'SERVER_DELETE', { id: serverId });
    this.realtime.clearRooms([room.server(serverId), ...channelIds]);
  }

  /** Miembros paginados por cursor (user_id), con presencia desde la caché. */
  async members(serverId: string, userId: string, q: PageQuery): Promise<Page<MemberDto>> {
    await this.perms.assertServer(serverId, userId);
    const rows = await this.prisma.member.findMany({
      where: { serverId, ...(q.after ? { userId: { gt: q.after } } : {}) },
      orderBy: { userId: 'asc' },
      take: q.limit,
      select: {
        nickname: true,
        joinedAt: true,
        user: { select: { ...userPublicSelect, status: true } },
        roles: { select: { roleId: true } },
      },
    });
    const conns = await this.cache.mget<number>(rows.map((r) => presenceKey(r.user.id)));
    const items = rows.map((r, i): MemberDto => {
      const { status, ...user } = r.user;
      const online = (conns[i] ?? 0) > 0 && status !== 'INVISIBLE';
      return {
        user,
        nickname: r.nickname,
        roleIds: r.roles.map((x) => x.roleId),
        joinedAt: r.joinedAt.toISOString(),
        presence: online ? (status as PresenceStatus) : 'OFFLINE',
      };
    });
    return { items, next: rows.length === q.limit ? (rows[rows.length - 1]?.user.id ?? null) : null };
  }

  async leave(serverId: string, userId: string): Promise<void> {
    const s = await this.prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!s) throw new NotFoundException('Servidor no encontrado');
    if (s.ownerId === userId) throw new BadRequestException('El dueño no puede abandonar su servidor');
    await this.prisma.member.delete({ where: { serverId_userId: { serverId, userId } } }).catch(() => {
      throw new NotFoundException('No eres miembro');
    });
    await this.perms.invalidateMember(serverId, userId);
    this.realtime.leaveRooms(userId, [room.server(serverId), ...(await this.channelRooms(serverId))]);
    this.realtime.emit(room.server(serverId), 'MEMBER_REMOVE', { serverId, userId });
  }

  async createInvite(serverId: string, userId: string, input: CreateInviteInput): Promise<InviteDto> {
    await this.perms.assertServer(serverId, userId, Permission.CREATE_INVITE);
    const inv = await this.prisma.invite.create({
      data: {
        code: randomCode(8),
        serverId,
        inviterId: userId,
        maxUses: input.maxUses || null,
        expiresAt: input.maxAgeSeconds ? new Date(Date.now() + input.maxAgeSeconds * 1000) : null,
      },
    });
    return {
      code: inv.code,
      serverId,
      maxUses: inv.maxUses,
      uses: inv.uses,
      expiresAt: inv.expiresAt?.toISOString() ?? null,
    };
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const inv = await this.prisma.invite.findUnique({
      where: { code },
      include: {
        server: { select: { id: true, name: true, iconUrl: true, ownerId: true, _count: { select: { members: true } } } },
      },
    });
    if (!inv || (inv.expiresAt && inv.expiresAt < new Date()) || (inv.maxUses && inv.uses >= inv.maxUses)) {
      throw new NotFoundException('Invitación inválida o caducada');
    }
    const { _count, ...server } = inv.server;
    return { code, server: { ...server, memberCount: _count.members }, expiresAt: inv.expiresAt?.toISOString() ?? null };
  }

  async joinByInvite(code: string, userId: string): Promise<ServerSummary> {
    const preview = await this.previewInvite(code);
    const serverId = preview.server.id;

    const existing = await this.prisma.member.findUnique({ where: { serverId_userId: { serverId, userId } } });
    if (existing) return toServerSummary(preview.server);

    const banned = await this.prisma.ban.findUnique({ where: { serverId_userId: { serverId, userId } } });
    if (banned) throw new ForbiddenException('Estás baneado de este servidor');

    const member = await this.prisma.$transaction(async (tx) => {
      // El UPDATE bloquea la fila: peticiones concurrentes se serializan y la que
      // supere maxUses hace rollback de toda la transacción.
      const inv = await tx.invite.update({ where: { code }, data: { uses: { increment: 1 } } });
      if (inv.maxUses && inv.uses > inv.maxUses) {
        throw new GoneException('La invitación alcanzó su límite de usos');
      }
      return tx.member.create({
        data: { serverId, userId },
        select: { nickname: true, joinedAt: true, user: { select: userPublicSelect } },
      });
    });

    await this.perms.invalidateMember(serverId, userId);
    this.realtime.joinServerRoom(userId, serverId);
    this.realtime.emit(room.server(serverId), 'MEMBER_ADD', {
      serverId,
      member: {
        user: member.user,
        nickname: member.nickname,
        roleIds: [],
        joinedAt: member.joinedAt.toISOString(),
        presence: 'ONLINE',
      },
    });
    return toServerSummary(preview.server);
  }

  private async channelRooms(serverId: string): Promise<string[]> {
    const chans = await this.prisma.channel.findMany({ where: { serverId }, select: { id: true } });
    return chans.map((c) => room.channel(c.id));
  }
}
