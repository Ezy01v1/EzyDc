import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PushSubscriptionInput } from '@ezydc/shared';
import webpush from 'web-push';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { CacheService } from '../core/cache.service';
import { PrismaService } from '../core/prisma.service';
import { presenceKey } from '../servers/servers.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta de la app a abrir al pulsar la notificación. */
  url: string;
  /** Agrupa: una notificación por canal (la nueva reemplaza a la anterior). */
  tag: string;
  icon?: string;
}

const MAX_PER_SEND = 500; // tope de destinatarios por mensaje (p. ej. @everyone en un servidor grande)

/**
 * Web Push (VAPID). Solo se envía a quien NO tiene ninguna pestaña conectada: si estás en la app,
 * ya te enteras por el socket. Respeta silencios de canal y servidor.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(APP_CONFIG) cfg: AppConfig,
  ) {
    this.enabled = !!(cfg.VAPID_PUBLIC_KEY && cfg.VAPID_PRIVATE_KEY);
    if (this.enabled) webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY!, cfg.VAPID_PRIVATE_KEY!);
    else this.log.warn('VAPID no configurado: notificaciones push desactivadas');
  }

  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    // El endpoint identifica al navegador: si otra cuenta lo usaba en este equipo, pasa a esta.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
      update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Lanza el envío sin bloquear la petición que lo provoca. */
  notify(userIds: string[], ctx: { channelId: string; serverId: string | null }, payload: PushPayload): void {
    if (!this.enabled || userIds.length === 0) return;
    void this.send(userIds.slice(0, MAX_PER_SEND), ctx, payload).catch((e: Error) => this.log.warn(`push: ${e.message}`));
  }

  private async send(userIds: string[], ctx: { channelId: string; serverId: string | null }, payload: PushPayload): Promise<void> {
    // 1) Fuera quien tiene sockets abiertos.
    const conns = await this.cache.mget<number>(userIds.map(presenceKey));
    let targets = userIds.filter((_, i) => !conns[i] || conns[i]! <= 0);
    if (!targets.length) return;
    // 2) Fuera quien silenció el canal o el servidor.
    const now = new Date();
    const muted = await this.prisma.notificationSetting.findMany({
      where: {
        userId: { in: targets },
        targetId: { in: [ctx.channelId, ...(ctx.serverId ? [ctx.serverId] : [])] },
        muted: true,
        OR: [{ muteUntil: null }, { muteUntil: { gt: now } }],
      },
      select: { userId: true },
    });
    const mutedSet = new Set(muted.map((m) => m.userId));
    targets = targets.filter((u) => !mutedSet.has(u));
    if (!targets.length) return;

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: targets } } });
    const body = JSON.stringify(payload);
    const dead: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 3600,
            urgency: 'high',
            topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
            timeout: 5000,
          });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.id); // el navegador anuló la suscripción
          else this.log.debug(`push a ${s.id}: ${(e as Error).message}`);
        }
      }),
    );
    if (dead.length) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
}
