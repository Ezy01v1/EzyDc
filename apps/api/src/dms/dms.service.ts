import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateDmInput, DmChannelDto, UserPublic } from '@ezydc/shared';
import type { Prisma } from '@prisma/client';
import { toChannelDto, userPublicSelect } from '../common/mappers';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';

const MAX_GROUP = 10;

const dmInclude = {
  participants: { select: { userId: true, closed: true, user: { select: userPublicSelect } } },
} satisfies Prisma.ChannelInclude;
type DmRow = Prisma.ChannelGetPayload<{ include: typeof dmInclude }>;

function toDmDto(c: DmRow, me: string): DmChannelDto {
  return {
    ...toChannelDto(c),
    ownerId: c.ownerId,
    recipients: c.participants.filter((p) => p.userId !== me).map((p) => p.user),
  };
}

/**
 * Mensajes directos (1:1) y grupos privados (hasta 10 personas).
 * Anti-spam: solo puedes escribir a quien comparte al menos un servidor contigo.
 */
@Injectable()
export class DmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(me: string): Promise<DmChannelDto[]> {
    const rows = await this.prisma.channel.findMany({
      where: { type: { in: ['DM', 'GROUP_DM'] }, participants: { some: { userId: me, closed: false } } },
      include: dmInclude,
      orderBy: [{ lastMessageId: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => toDmDto(r, me));
  }

  async create(me: string, input: CreateDmInput): Promise<DmChannelDto> {
    const ids = [...new Set(input.recipientIds)].filter((id) => id !== me);
    if (ids.length === 0) throw new BadRequestException('Elige al menos a otra persona');
    await this.assertShareServer(me, ids);

    if (ids.length === 1) {
      const other = ids[0]!;
      const existing = await this.prisma.channel.findFirst({
        where: { type: 'DM', AND: [{ participants: { some: { userId: me } } }, { participants: { some: { userId: other } } }] },
        include: dmInclude,
      });
      if (existing) {
        await this.prisma.dmParticipant.update({ where: { channelId_userId: { channelId: existing.id, userId: me } }, data: { closed: false } });
        return toDmDto(existing, me);
      }
    }

    const isGroup = ids.length > 1;
    const ch = await this.prisma.channel.create({
      data: {
        type: isGroup ? 'GROUP_DM' : 'DM',
        ownerId: isGroup ? me : null,
        name: isGroup ? (input.name ?? null) : null,
        participants: { create: [me, ...ids].map((userId) => ({ userId })) },
      },
      include: dmInclude,
    });
    // Los grupos aparecen al momento; un DM 1:1 aparece al otro con el primer mensaje.
    if (isGroup) this.realtime.emit(ids.map(room.user), 'DM_CHANNELS_UPDATE', { channelId: ch.id });
    return toDmDto(ch, me);
  }

  async addRecipient(me: string, channelId: string, userId: string): Promise<DmChannelDto> {
    const ch = await this.getGroup(channelId, me);
    if (ch.participants.some((p) => p.userId === userId)) return toDmDto(ch, me);
    if (ch.participants.length >= MAX_GROUP) throw new BadRequestException(`Un grupo admite como máximo ${MAX_GROUP} personas`);
    await this.assertShareServer(me, [userId]);
    await this.prisma.dmParticipant.create({ data: { channelId, userId } });
    const updated = await this.prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: dmInclude });
    this.realtime.emit(updated.participants.map((p) => room.user(p.userId)), 'DM_CHANNELS_UPDATE', { channelId });
    return toDmDto(updated, me);
  }

  /** DM 1:1 → se oculta (closed). Grupo → sales; si eras el dueño, pasa al siguiente; si no queda nadie, se borra. */
  async leave(me: string, channelId: string): Promise<void> {
    const ch = await this.prisma.channel.findFirst({
      where: { id: channelId, type: { in: ['DM', 'GROUP_DM'] }, participants: { some: { userId: me } } },
      include: dmInclude,
    });
    if (!ch) throw new NotFoundException('Conversación no encontrada');

    if (ch.type === 'DM') {
      await this.prisma.dmParticipant.update({ where: { channelId_userId: { channelId, userId: me } }, data: { closed: true } });
      this.realtime.emit(room.user(me), 'DM_CHANNELS_UPDATE', { channelId });
      return;
    }
    const rest = ch.participants.filter((p) => p.userId !== me);
    if (rest.length === 0) {
      await this.prisma.channel.delete({ where: { id: channelId } });
    } else {
      await this.prisma.$transaction([
        this.prisma.dmParticipant.delete({ where: { channelId_userId: { channelId, userId: me } } }),
        ...(ch.ownerId === me ? [this.prisma.channel.update({ where: { id: channelId }, data: { ownerId: rest[0]!.userId } })] : []),
      ]);
    }
    this.realtime.leaveRooms(me, [room.channel(channelId)]);
    this.realtime.emit([me, ...rest.map((p) => p.userId)].map(room.user), 'DM_CHANNELS_UPDATE', { channelId });
  }

  /** Personas con las que compartes servidor (para iniciar DMs). */
  async contacts(me: string): Promise<UserPublic[]> {
    const rows = await this.prisma.member.findMany({
      where: { userId: { not: me }, server: { members: { some: { userId: me } } } },
      distinct: ['userId'],
      select: { user: { select: userPublicSelect } },
      take: 200,
    });
    return rows.map((r) => r.user).sort((a, b) => a.username.localeCompare(b.username));
  }

  private async getGroup(channelId: string, me: string): Promise<DmRow> {
    const ch = await this.prisma.channel.findFirst({
      where: { id: channelId, participants: { some: { userId: me } } },
      include: dmInclude,
    });
    if (!ch) throw new NotFoundException('Conversación no encontrada');
    if (ch.type !== 'GROUP_DM') throw new BadRequestException('Solo se pueden añadir personas a grupos');
    return ch;
  }

  private async assertShareServer(me: string, ids: string[]): Promise<void> {
    const shared = await this.prisma.member.findMany({
      where: { userId: { in: ids }, server: { members: { some: { userId: me } } } },
      distinct: ['userId'],
      select: { userId: true },
    });
    if (shared.length !== ids.length) {
      throw new ForbiddenException('Solo puedes escribir a personas con las que compartes un servidor');
    }
  }
}
