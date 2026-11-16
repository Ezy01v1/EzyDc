import { type INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import type { AppConfig } from '../config/config';

/**
 * Socket.IO afinado para bajo consumo:
 *  - perMessageDeflate desactivado (payloads pequeños; comprimir cuesta más CPU de lo que ahorra)
 *  - maxHttpBufferSize 64 KB (los clientes solo envían eventos diminutos)
 *  - adapter Redis (Upstash) para difundir entre varias instancias, si REDIS_URL existe
 */
export class RealtimeIoAdapter extends IoAdapter {
  private redisAdapter?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly cfg: AppConfig,
  ) {
    super(app);
  }

  async connectRedis(): Promise<void> {
    if (!this.cfg.REDIS_URL) return;
    const pub = new Redis(this.cfg.REDIS_URL, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    const log = new Logger('RedisAdapter');
    pub.on('error', (e) => log.warn(e.message));
    sub.on('error', (e) => log.warn(e.message));
    this.redisAdapter = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.cfg.CORS_ORIGINS, credentials: true },
      maxHttpBufferSize: 64 * 1024,
      perMessageDeflate: false,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    } satisfies Partial<ServerOptions>) as Server;
    if (this.redisAdapter) server.adapter(this.redisAdapter);
    return server;
  }
}
