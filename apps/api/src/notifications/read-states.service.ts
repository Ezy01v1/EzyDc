import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationSettingDto, NotificationSettingInput, ReadStatesResponse } from '@ezydc/shared';
import { Prisma } from '@prisma/client';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * No leídos persistentes.
 *  - "no leído" = channels.last_message_id > read_states.last_read_message_id
 *    (UUIDv7: el orden de los ids es el orden temporal → sin COUNT(*)).
 *  - mention_count se incrementa en lote y se pone a 0 al leer (ack).
 */
@Injectable()
export class ReadStatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  async get(userId: string): Promise<ReadStatesResponse> {
    const [states, settings] = await Promise.all([
      this.prisma.readState.findMany({ where: { userId } }),
      this.prisma.notificationSetting.findMany({ where: { userId } }),
    ]);
    return {
      readStates: states.map((s) => ({ channelId: s.channelId, lastReadMessageId: s.lastReadMessageId, mentionCount: s.mentionCount })),
      settings: settings.map(toSettingDto),
    };
  }

  /** Marca leído hasta `messageId`. Idempotente y nunca retrocede (GREATEST). */
  async ack(userId: string, channelId: string, messageId: string): Promise<void> {
    await this.perms.assertChannel(channelId, userId);
    await this.markRead(this.prisma, userId, channelId, messageId);
    this.realtime.emit(room.user(userId), 'CHANNEL_ACK', { channelId, messageId });
  }

  markRead(tx: Tx, userId: string, channelId: string, messageId: string): Promise<number> {
    return tx.$executeRaw`
      INSERT INTO read_states (user_id, channel_id, last_read_message_id, mention_count)
      VALUES (${userId}::uuid, ${channelId}::uuid, ${messageId}::uuid, 0)
      ON CONFLICT (user_id, channel_id) DO UPDATE SET
        last_read_message_id = GREATEST(read_states.last_read_message_id, EXCLUDED.last_read_message_id),
        mention_count = 0`;
  }

  /** +1 mención para muchos usuarios en UNA consulta (sirve para @everyone en servidores grandes). */
  async incrementMentions(channelId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.$executeRaw`
      INSERT INTO read_states (user_id, channel_id, mention_count)
      SELECT u, ${channelId}::uuid, 1 FROM unnest(${userIds}::uuid[]) AS u
      ON CONFLICT (user_id, channel_id) DO UPDATE SET mention_count = read_states.mention_count + 1`;
  }

  async setSetting(userId: string, targetId: string, input: NotificationSettingInput): Promise<NotificationSettingDto> {
    // El destino debe ser un servidor del que eres miembro o un canal que puedes ver.
    const isServer = await this.perms.getBase(targetId, userId).catch(() => null);
    if (!isServer) {
      try {
        await this.perms.assertChannel(targetId, userId);
      } catch {
        throw new NotFoundException('Servidor o canal no encontrado');
      }
    }
    if (input.level === undefined && input.muted === undefined) throw new BadRequestException();
    const s = await this.prisma.notificationSetting.upsert({
      where: { userId_targetId: { userId, targetId } },
      create: { userId, targetId, muted: input.muted ?? false, level: input.level ?? 'ALL' },
      update: { ...(input.muted !== undefined ? { muted: input.muted } : {}), ...(input.level ? { level: input.level } : {}) },
    });
    return toSettingDto(s);
  }
}

function toSettingDto(s: { targetId: string; muted: boolean; level: NotificationSettingDto['level']; muteUntil: Date | null }): NotificationSettingDto {
  const expired = s.muteUntil !== null && s.muteUntil < new Date();
  return { targetId: s.targetId, muted: s.muted && !expired, level: s.level };
}
