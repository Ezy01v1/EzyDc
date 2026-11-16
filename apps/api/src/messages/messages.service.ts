import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateMessageInput,
  hasPermission,
  type MessageDto,
  type MessageQuery,
  Permission,
  type UpdateMessageInput,
} from '@ezydc/shared';
import { messageInclude, toMessageDto } from '../common/mappers';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';

const TEXT_TYPES = new Set(['TEXT', 'ANNOUNCEMENT', 'DM', 'GROUP_DM', 'THREAD']);

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Historial por cursor. Devuelve SIEMPRE orden ascendente (antiguo → nuevo).
   *  - sin cursor: los últimos `limit`
   *  - before: página anterior (scroll hacia arriba)
   *  - after: mensajes nuevos (sincronización tras reconexión)
   * Usa el índice (channel_id, id DESC): coste constante a cualquier profundidad.
   */
  async list(channelId: string, userId: string, q: MessageQuery): Promise<MessageDto[]> {
    await this.perms.assertChannel(channelId, userId, Permission.READ_MESSAGE_HISTORY);
    if (q.after) {
      const rows = await this.prisma.message.findMany({
        where: { channelId, id: { gt: q.after } },
        orderBy: { id: 'asc' },
        take: q.limit,
        include: messageInclude,
      });
      return rows.map((m) => toMessageDto(m));
    }
    const rows = await this.prisma.message.findMany({
      where: { channelId, ...(q.before ? { id: { lt: q.before } } : {}) },
      orderBy: { id: 'desc' },
      take: q.limit,
      include: messageInclude,
    });
    return rows.reverse().map((m) => toMessageDto(m));
  }

  async create(channelId: string, userId: string, input: CreateMessageInput): Promise<MessageDto> {
    const meta = await this.perms.assertChannel(channelId, userId, Permission.SEND_MESSAGES);
    if (!TEXT_TYPES.has(meta.type)) throw new BadRequestException('Este canal no admite mensajes');

    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToId, channelId },
        select: { id: true },
      });
      if (!target) throw new BadRequestException('El mensaje al que respondes no existe');
    }

    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          channelId,
          authorId: userId,
          content: input.content,
          type: input.replyToId ? 'REPLY' : 'DEFAULT',
          replyToId: input.replyToId,
        },
        include: messageInclude,
      });
      await tx.channel.update({ where: { id: channelId }, data: { lastMessageId: m.id } });
      return m;
    });

    const dto = toMessageDto(msg, input.nonce);
    // Payload completo solo a quien está mirando el canal…
    this.realtime.emit(room.channel(channelId), 'MESSAGE_CREATE', dto);
    // …y un aviso de pocos bytes al resto del servidor (no leídos).
    if (meta.serverId) {
      this.realtime.emit(room.server(meta.serverId), 'CHANNEL_ACTIVITY', {
        serverId: meta.serverId,
        channelId,
        messageId: msg.id,
        authorId: userId,
      });
    }
    return dto;
  }

  async update(channelId: string, messageId: string, userId: string, input: UpdateMessageInput): Promise<MessageDto> {
    await this.perms.assertChannel(channelId, userId);
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundException('Mensaje no encontrado');
    if (existing.authorId !== userId) throw new ForbiddenException('Solo puedes editar tus mensajes');

    const m = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: input.content, editedAt: new Date() },
      include: messageInclude,
    });
    const dto = toMessageDto(m);
    this.realtime.emit(room.channel(channelId), 'MESSAGE_UPDATE', {
      id: m.id,
      channelId,
      content: m.content,
      editedAt: dto.editedAt ?? new Date().toISOString(),
    });
    return dto;
  }

  async remove(channelId: string, messageId: string, userId: string): Promise<void> {
    const { perms } = await this.perms.channelPermissions(channelId, userId);
    if (!hasPermission(perms, Permission.VIEW_CHANNEL)) throw new NotFoundException('Canal no encontrado');
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundException('Mensaje no encontrado');
    if (existing.authorId !== userId && !hasPermission(perms, Permission.MANAGE_MESSAGES)) {
      throw new ForbiddenException('Permisos insuficientes');
    }
    await this.prisma.message.delete({ where: { id: messageId } });
    this.realtime.emit(room.channel(channelId), 'MESSAGE_DELETE', { id: messageId, channelId });
  }
}
