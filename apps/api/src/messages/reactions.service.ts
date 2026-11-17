import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hasPermission, Permission, type ReactionDto } from '@ezydc/shared';
import { Prisma } from '@prisma/client';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';
import { EmojisService } from '../emojis/emojis.service';

const MAX_DISTINCT = 20; // emojis distintos por mensaje

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
    private readonly emojis: EmojisService,
  ) {}

  /**
   * Reacciones agregadas de una página de mensajes: 2 queries para toda la página
   * (conteos agrupados + las mías), nunca una por mensaje.
   */
  async forMessages(messageIds: string[], userId: string): Promise<Map<string, ReactionDto[]>> {
    const out = new Map<string, ReactionDto[]>();
    if (messageIds.length === 0) return out;
    const [groups, mine] = await Promise.all([
      this.prisma.reaction.groupBy({
        by: ['messageId', 'emoji'],
        where: { messageId: { in: messageIds } },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      this.prisma.reaction.findMany({ where: { messageId: { in: messageIds }, userId }, select: { messageId: true, emoji: true } }),
    ]);
    if (groups.length === 0) return out;
    const mineSet = new Set(mine.map((r) => `${r.messageId}|${r.emoji}`));
    const customIds = [...new Set(groups.filter((g) => g.emoji.startsWith('c:')).map((g) => g.emoji.slice(2)))];
    const customs = customIds.length
      ? await this.prisma.emoji.findMany({ where: { id: { in: customIds } }, select: { id: true, name: true, imageUrl: true } })
      : [];
    const byId = new Map(customs.map((e) => [e.id, e]));
    groups.sort((a, b) => (a._min.createdAt?.getTime() ?? 0) - (b._min.createdAt?.getTime() ?? 0));
    for (const g of groups) {
      const r: ReactionDto = { emoji: g.emoji, count: g._count._all, me: mineSet.has(`${g.messageId}|${g.emoji}`) };
      if (g.emoji.startsWith('c:')) {
        const e = byId.get(g.emoji.slice(2));
        if (!e) continue; // emoji borrado: la reacción deja de mostrarse
        r.url = e.imageUrl;
        r.name = e.name;
      }
      const list = out.get(g.messageId) ?? [];
      list.push(r);
      out.set(g.messageId, list);
    }
    return out;
  }

  async add(channelId: string, messageId: string, userId: string, emoji: string): Promise<void> {
    const { perms, meta } = await this.perms.channelPermissions(channelId, userId);
    if (!hasPermission(perms, Permission.VIEW_CHANNEL)) throw new NotFoundException('Canal no encontrado');
    if (!hasPermission(perms, Permission.READ_MESSAGE_HISTORY)) throw new ForbiddenException('Permisos insuficientes');
    await this.assertMessage(channelId, messageId);

    // Sumarse a una reacción existente no requiere ADD_REACTIONS (igual que Discord); crear una nueva sí.
    const existing = await this.prisma.reaction.findMany({ where: { messageId }, distinct: ['emoji'], select: { emoji: true } });
    const isNew = !existing.some((r) => r.emoji === emoji);
    if (isNew) {
      if (!hasPermission(perms, Permission.ADD_REACTIONS)) throw new ForbiddenException('No puedes añadir reacciones aquí');
      if (existing.length >= MAX_DISTINCT) throw new BadRequestException(`Máximo ${MAX_DISTINCT} reacciones distintas`);
    }

    let extra: { url?: string; name?: string } = {};
    if (emoji.startsWith('c:')) {
      const e = await this.emojis.findById(emoji.slice(2));
      if (!e) throw new BadRequestException('Emoji desconocido');
      if (isNew && e.serverId !== meta.serverId) {
        // Emoji de otro servidor: debes pertenecer a él y, en un servidor, tener USE_EXTERNAL_EMOJIS.
        if (!(await this.perms.getBase(e.serverId, userId))) throw new ForbiddenException('No tienes acceso a ese emoji');
        if (meta.serverId && !hasPermission(perms, Permission.USE_EXTERNAL_EMOJIS)) {
          throw new ForbiddenException('No puedes usar emojis de otros servidores aquí');
        }
      }
      extra = { url: e.imageUrl, name: e.name };
    }

    try {
      await this.prisma.reaction.create({ data: { messageId, userId, emoji } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // idempotente
      throw e;
    }
    this.realtime.emit(room.channel(channelId), 'MESSAGE_REACTION_ADD', { channelId, messageId, userId, emoji, ...extra });
  }

  async remove(channelId: string, messageId: string, userId: string, emoji: string): Promise<void> {
    await this.perms.assertChannel(channelId, userId);
    await this.assertMessage(channelId, messageId);
    const { count } = await this.prisma.reaction.deleteMany({ where: { messageId, userId, emoji } });
    if (count) this.realtime.emit(room.channel(channelId), 'MESSAGE_REACTION_REMOVE', { channelId, messageId, userId, emoji });
  }

  private async assertMessage(channelId: string, messageId: string): Promise<void> {
    const m = await this.prisma.message.findFirst({ where: { id: messageId, channelId }, select: { id: true } });
    if (!m) throw new NotFoundException('Mensaje no encontrado');
  }
}
