import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  ChannelSubscribeInput,
  hasPermission,
  Permission,
  type PresenceStatus,
  type ServerToClientEvents,
} from '@ezydc/shared';
import type { Server, Socket } from 'socket.io';
import { CacheService } from '../core/cache.service';
import { PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';
import { MetricsService } from '../metrics/metrics.service';
import { presenceKey } from '../servers/servers.service';

interface SocketData {
  userId: string;
  username: string;
  serverIds: string[];
  status: PresenceStatus;
  lastTyping: number;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvents = Record<string, (...args: any[]) => void>;
type AppSocket = Socket<AnyEvents, AnyEvents, AnyEvents, SocketData>;

const PRESENCE_TTL = 24 * 3600;
const TYPING_THROTTLE_MS = 3_000;

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.server = server;
    // Autenticación en el handshake con el token efímero (audiencia "ws").
    server.use((socket, next) => {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('unauthorized'));
      try {
        const payload = this.jwt.verify<{ sub: string }>(token, { audience: 'ws' });
        (socket.data as Partial<SocketData>).userId = payload.sub;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  async handleConnection(socket: AppSocket): Promise<void> {
    this.metrics.wsConnections++;
    const { userId } = socket.data;
    try {
      const [user, memberships] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId }, select: { username: true, status: true } }),
        this.prisma.member.findMany({ where: { userId }, select: { serverId: true } }),
      ]);
      if (!user) return void socket.disconnect(true);

      socket.data.username = user.username;
      socket.data.serverIds = memberships.map((m) => m.serverId);
      socket.data.status = user.status === 'INVISIBLE' ? 'OFFLINE' : user.status;
      socket.data.lastTyping = 0;
      await socket.join([room.user(userId), ...socket.data.serverIds.map(room.server)]);

      // Presencia: contador de conexiones (varias pestañas/dispositivos). 0→1 = en línea.
      const n = await this.cache.incr(presenceKey(userId), 1, PRESENCE_TTL);
      if (n === 1 && socket.data.status !== 'OFFLINE') this.broadcastPresence(socket, socket.data.status);
    } catch (e) {
      this.log.error(e);
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AppSocket): Promise<void> {
    this.metrics.wsConnections--;
    const { userId } = socket.data;
    if (!userId || !socket.data.serverIds) return;
    const n = await this.cache.incr(presenceKey(userId), -1, PRESENCE_TTL);
    if (n <= 0) {
      await this.cache.del(presenceKey(userId));
      this.broadcastPresence(socket, 'OFFLINE');
    }
  }

  /** Solo el canal visible: abandona el anterior y entra en el nuevo (si tiene VIEW_CHANNEL). */
  @SubscribeMessage('channel:subscribe')
  async subscribe(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<{ ok: boolean }> {
    const parsed = ChannelSubscribeInput.safeParse(body);
    if (!parsed.success) return { ok: false };
    const { channelId } = parsed.data;
    try {
      const { perms } = await this.perms.channelPermissions(channelId, socket.data.userId);
      if (!hasPermission(perms, Permission.VIEW_CHANNEL)) return { ok: false };
    } catch {
      return { ok: false };
    }
    for (const r of socket.rooms) if (r.startsWith('ch:') && r !== room.channel(channelId)) await socket.leave(r);
    await socket.join(room.channel(channelId));
    return { ok: true };
  }

  @SubscribeMessage('channel:unsubscribe')
  async unsubscribe(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): Promise<void> {
    const parsed = ChannelSubscribeInput.safeParse(body);
    if (parsed.success) await socket.leave(room.channel(parsed.data.channelId));
  }

  /** "Está escribiendo…": limitado a 1 evento / 3 s por socket y solo en el canal suscrito. */
  @SubscribeMessage('typing:start')
  typing(@ConnectedSocket() socket: AppSocket, @MessageBody() body: unknown): void {
    const parsed = ChannelSubscribeInput.safeParse(body);
    if (!parsed.success) return;
    const now = Date.now();
    if (now - socket.data.lastTyping < TYPING_THROTTLE_MS) return;
    const ch = room.channel(parsed.data.channelId);
    if (!socket.rooms.has(ch)) return; // ya se validó VIEW_CHANNEL al suscribirse
    socket.data.lastTyping = now;
    const payload: Parameters<ServerToClientEvents['TYPING_START']>[0] = {
      channelId: parsed.data.channelId,
      userId: socket.data.userId,
      username: socket.data.username,
    };
    socket.to(ch).emit('TYPING_START', payload);
  }

  @SubscribeMessage('sys:ping')
  ping(): { t: number } {
    return { t: Date.now() };
  }

  private broadcastPresence(socket: AppSocket, status: PresenceStatus): void {
    const rooms = socket.data.serverIds.map(room.server);
    if (rooms.length) {
      this.realtime.server?.to(rooms).emit('PRESENCE_UPDATE', { userId: socket.data.userId, status });
    }
  }
}
