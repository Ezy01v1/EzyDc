import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type ChannelDto,
  type CreateChannelInput,
  Permission,
  type ReorderChannelsInput,
  type UpdateChannelInput,
} from '@ezydc/shared';
import { toChannelDto } from '../common/mappers';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(serverId: string, userId: string, input: CreateChannelInput): Promise<ChannelDto> {
    await this.perms.assertServer(serverId, userId, Permission.MANAGE_CHANNELS);
    const parentId = input.type === 'CATEGORY' ? null : (input.parentId ?? null);
    if (parentId) {
      const parent = await this.prisma.channel.findFirst({
        where: { id: parentId, serverId, type: 'CATEGORY' },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('Categoría inválida');
    }
    const last = await this.prisma.channel.aggregate({
      where: { serverId, parentId },
      _max: { position: true },
    });
    const name = input.type === 'TEXT' || input.type === 'ANNOUNCEMENT' ? slugify(input.name) : input.name;
    const ch = await this.prisma.channel.create({
      data: {
        serverId,
        parentId,
        type: input.type,
        name,
        topic: input.topic,
        position: (last._max.position ?? -1) + 1,
      },
    });
    const dto = toChannelDto(ch);
    this.realtime.emit(room.server(serverId), 'CHANNEL_CREATE', dto);
    return dto;
  }

  async update(channelId: string, userId: string, input: UpdateChannelInput): Promise<ChannelDto> {
    const meta = await this.perms.assertChannel(channelId, userId, Permission.MANAGE_CHANNELS);
    if (!meta.serverId) throw new BadRequestException('No es un canal de servidor');
    const ch = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...input,
        ...(input.name && (meta.type === 'TEXT' || meta.type === 'ANNOUNCEMENT') ? { name: slugify(input.name) } : {}),
      },
    });
    await this.perms.invalidateChannel(channelId);
    const dto = toChannelDto(ch);
    await this.perms.emitToChannelViewers(meta, 'CHANNEL_UPDATE', dto);
    return dto;
  }

  async remove(channelId: string, userId: string): Promise<void> {
    const meta = await this.perms.assertChannel(channelId, userId, Permission.MANAGE_CHANNELS);
    if (!meta.serverId) throw new BadRequestException('No es un canal de servidor');
    await this.perms.emitToChannelViewers(meta, 'CHANNEL_DELETE', { id: channelId, serverId: meta.serverId });
    await this.prisma.channel.delete({ where: { id: channelId } });
    await this.perms.invalidateChannel(channelId);
    this.realtime.clearRooms([room.channel(channelId)]);
  }

  /** Reordenación en bloque (drag & drop). Una transacción con N updates pequeños. */
  async reorder(serverId: string, userId: string, items: ReorderChannelsInput): Promise<void> {
    await this.perms.assertServer(serverId, userId, Permission.MANAGE_CHANNELS);
    const ids = [...new Set(items.map((i) => i.id))];
    const parentIds = [...new Set(items.map((i) => i.parentId).filter((p): p is string => !!p))];
    const [owned, categories] = await Promise.all([
      this.prisma.channel.count({ where: { serverId, id: { in: ids } } }),
      this.prisma.channel.count({ where: { serverId, id: { in: parentIds }, type: 'CATEGORY' } }),
    ]);
    if (owned !== ids.length || categories !== parentIds.length) throw new BadRequestException('Canales inválidos');

    await this.prisma.$transaction(
      items.map((i) =>
        this.prisma.channel.update({
          where: { id: i.id },
          data: { position: i.position, ...(i.parentId !== undefined ? { parentId: i.parentId } : {}) },
        }),
      ),
    );
    this.realtime.emit(room.server(serverId), 'CHANNELS_REORDER', { serverId, positions: items });
  }
}

/** "Mi Canal Nuevo" → "mi-canal-nuevo" (convención de canales de texto). */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .replace(/-+/g, '-')
      .slice(0, 100) || 'canal'
  );
}
