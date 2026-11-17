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
import { ReadStatesService } from '../notifications/read-states.service';
import { MentionsService } from './mentions.service';

const TEXT_TYPES = new Set(['TEXT', 'ANNOUNCEMENT', 'DM', 'GROUP_DM', 'THREAD']);

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
    private readonly mentions: MentionsService,
    private readonly readStates: ReadStatesService,
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
    const { perms, meta } = await this.perms.channelPermissions(channelId, userId);
    if (!hasPermission(perms, Permission.VIEW_CHANNEL)) throw new NotFoundException('Canal no encontrado');
    if (!hasPermission(perms, Permission.SEND_MESSAGES)) throw new ForbiddenException('Permisos insuficientes');
    if (!TEXT_TYPES.has(meta.type)) throw new BadRequestException('Este canal no admite mensajes');

    let replyAuthorId: string | null = null;
    if (input.replyToId) {
      const target = await this.prisma.message.findFirst({
        where: { id: input.replyToId, channelId },
        select: { authorId: true },
      });
      if (!target) throw new BadRequestException('El mensaje al que respondes no existe');
      replyAuthorId = target.authorId;
    }

    const mentions = await this.mentions.resolve(meta, userId, perms, input.content, replyAuthorId);
    const isDm = !meta.serverId;

    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          channelId,
          authorId: userId,
          content: input.content,
          type: input.replyToId ? 'REPLY' : 'DEFAULT',
          replyToId: input.replyToId,
          mentionEveryone: mentions.everyone,
          userMentions: { create: mentions.userIds.map((id) => ({ userId: id })) },
          roleMentions: { create: mentions.roleIds.map((id) => ({ roleId: id })) },
        },
        include: messageInclude,
      });
      await tx.channel.update({ where: { id: channelId }, data: { lastMessageId: m.id } });
      // Lo que escribes lo has leído: el autor no ve su propio mensaje como "no leído".
      await this.readStates.markRead(tx, userId, channelId, m.id);
      // Un DM cerrado reaparece en la lista de los destinatarios al recibir un mensaje.
      if (isDm) await tx.dmParticipant.updateMany({ where: { channelId, closed: true }, data: { closed: false } });
      return m;
    });

    const dto = toMessageDto(msg, input.nonce);
    // Payload completo solo a quien está mirando el canal…
    this.realtime.emit(room.channel(channelId), 'MESSAGE_CREATE', dto);
    // …y un aviso de pocos bytes al resto que PUEDA verlo (no leídos).
    const activity = { serverId: meta.serverId, channelId, messageId: msg.id, authorId: userId };
    if (meta.serverId) {
      await this.perms.emitToChannelViewers(meta, 'CHANNEL_ACTIVITY', activity);
    } else {
      const participants = await this.prisma.dmParticipant.findMany({ where: { channelId }, select: { userId: true } });
      this.realtime.emit(participants.map((p) => room.user(p.userId)), 'CHANNEL_ACTIVITY', activity);
    }
    if (mentions.notify.length) {
      await this.readStates.incrementMentions(channelId, mentions.notify);
      this.realtime.emit(mentions.notify.map(room.user), 'MENTION_CREATE', {
        serverId: meta.serverId,
        channelId,
        messageId: msg.id,
      });
    }
    return dto;
  }

  async update(channelId: string, messageId: string, userId: string, input: UpdateMessageInput): Promise<MessageDto> {
    const { perms, meta } = await this.perms.channelPermissions(channelId, userId);
    if (!hasPermission(perms, Permission.VIEW_CHANNEL)) throw new NotFoundException('Canal no encontrado');
    const existing = await this.prisma.message.findFirst({
      where: { id: messageId, channelId },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundException('Mensaje no encontrado');
    if (existing.authorId !== userId) throw new ForbiddenException('Solo puedes editar tus mensajes');

    // Al editar se recalculan las menciones guardadas, pero NO se vuelve a notificar.
    const mentions = await this.mentions.resolve(meta, userId, perms, input.content);
    const m = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: input.content,
        editedAt: new Date(),
        mentionEveryone: mentions.everyone,
        userMentions: { deleteMany: {}, create: mentions.userIds.map((id) => ({ userId: id })) },
        roleMentions: { deleteMany: {}, create: mentions.roleIds.map((id) => ({ roleId: id })) },
      },
      include: messageInclude,
    });
    const dto = toMessageDto(m);
    this.realtime.emit(room.channel(channelId), 'MESSAGE_UPDATE', dto);
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
