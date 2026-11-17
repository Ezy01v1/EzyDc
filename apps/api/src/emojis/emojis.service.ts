import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateEmojiInput,
  type EmojiDto,
  type EmojiUploadInput,
  MAX_EMOJIS_PER_SERVER,
  Permission,
  type UpdateEmojiInput,
  type UploadTicket,
} from '@ezydc/shared';
import { type Emoji, Prisma } from '@prisma/client';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';
import { StorageService } from '../storage/storage.service';
import { UploadsService } from '../storage/uploads.service';

export const toEmojiDto = (e: Emoji): EmojiDto => ({
  id: e.id,
  serverId: e.serverId,
  name: e.name,
  animated: e.animated,
  url: e.imageUrl,
});

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Emojis personalizados por servidor. La imagen vive en R2 bajo "emojis/<id>". */
@Injectable()
export class EmojisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
    private readonly storage: StorageService,
    private readonly uploads: UploadsService,
  ) {}

  async list(serverId: string, userId: string): Promise<EmojiDto[]> {
    await this.perms.assertServer(serverId, userId);
    const rows = await this.prisma.emoji.findMany({ where: { serverId }, orderBy: { name: 'asc' } });
    return rows.map(toEmojiDto);
  }

  /** Todos los emojis de mis servidores (para el selector), en un solo query. */
  async listMine(userId: string): Promise<EmojiDto[]> {
    const rows = await this.prisma.emoji.findMany({
      where: { server: { members: { some: { userId } } } },
      orderBy: [{ serverId: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toEmojiDto);
  }

  async requestUpload(serverId: string, userId: string, input: EmojiUploadInput): Promise<UploadTicket> {
    await this.perms.assertServer(serverId, userId, Permission.MANAGE_EMOJIS);
    await this.assertRoom(serverId);
    // El uploadId será el id del emoji: la clave en R2 queda fijada antes de subir.
    return this.uploads.issue(userId, `emoji:${serverId}`, (id) => `emojis/${id}`, {
      filename: 'emoji',
      contentType: input.contentType,
      size: input.size,
    });
  }

  async create(serverId: string, userId: string, input: CreateEmojiInput): Promise<EmojiDto> {
    await this.perms.assertServer(serverId, userId, Permission.MANAGE_EMOJIS);
    const p = await this.uploads.consume(userId, `emoji:${serverId}`, input.uploadId);
    try {
      await this.assertRoom(serverId);
      const e = await this.prisma.emoji.create({
        data: {
          id: input.uploadId,
          serverId,
          name: input.name,
          imageUrl: this.storage.publicUrl(p.key),
          animated: p.contentType === 'image/gif',
          creatorId: userId,
        },
      });
      this.realtime.emit(room.server(serverId), 'EMOJIS_UPDATE', { serverId });
      return toEmojiDto(e);
    } catch (e) {
      this.storage.deleteKeys([p.key]);
      if (isUnique(e)) throw new ConflictException(`Ya existe un emoji llamado :${input.name}:`);
      throw e;
    }
  }

  async rename(serverId: string, emojiId: string, userId: string, input: UpdateEmojiInput): Promise<EmojiDto> {
    await this.perms.assertServer(serverId, userId, Permission.MANAGE_EMOJIS);
    await this.find(serverId, emojiId);
    try {
      const e = await this.prisma.emoji.update({ where: { id: emojiId }, data: { name: input.name } });
      this.realtime.emit(room.server(serverId), 'EMOJIS_UPDATE', { serverId });
      return toEmojiDto(e);
    } catch (e) {
      if (isUnique(e)) throw new ConflictException(`Ya existe un emoji llamado :${input.name}:`);
      throw e;
    }
  }

  async remove(serverId: string, emojiId: string, userId: string): Promise<void> {
    await this.perms.assertServer(serverId, userId, Permission.MANAGE_EMOJIS);
    const e = await this.find(serverId, emojiId);
    await this.prisma.emoji.delete({ where: { id: emojiId } });
    const key = this.storage.keyFromUrl(e.imageUrl);
    if (key) this.storage.deleteKeys([key]);
    this.realtime.emit(room.server(serverId), 'EMOJIS_UPDATE', { serverId });
  }

  /** Para reacciones: el emoji existe y a qué servidor pertenece. */
  findById(id: string): Promise<Emoji | null> {
    return this.prisma.emoji.findUnique({ where: { id } });
  }

  private async find(serverId: string, emojiId: string): Promise<Emoji> {
    const e = await this.prisma.emoji.findFirst({ where: { id: emojiId, serverId } });
    if (!e) throw new NotFoundException('Emoji no encontrado');
    return e;
  }

  private async assertRoom(serverId: string): Promise<void> {
    const n = await this.prisma.emoji.count({ where: { serverId } });
    if (n >= MAX_EMOJIS_PER_SERVER) throw new BadRequestException(`Máximo ${MAX_EMOJIS_PER_SERVER} emojis por servidor`);
  }
}
