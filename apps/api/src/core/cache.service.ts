import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config';

interface MemEntry {
  v: string;
  exp: number;
}

/**
 * Caché clave/valor JSON con TTL. Usa Redis (Upstash) si REDIS_URL existe;
 * si no, un Map en memoria (suficiente para desarrollo con una sola instancia).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly log = new Logger(CacheService.name);
  readonly redis: Redis | null;
  private readonly mem = new Map<string, MemEntry>();

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    this.redis = cfg.REDIS_URL ? new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: 2 }) : null;
    this.redis?.on('error', (e) => this.log.warn(`Redis: ${e.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.redis ? await this.redis.get(key) : this.memGet(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raws = this.redis ? await this.redis.mget(...keys) : keys.map((k) => this.memGet(k));
    return raws.map((r) => (r === null ? null : (JSON.parse(r) as T)));
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.redis) {
      await this.redis.set(key, raw, 'EX', ttlSeconds);
      return;
    }
    if (this.mem.size > 50_000) this.sweep();
    this.mem.set(key, { v: raw, exp: Date.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    if (this.redis) await this.redis.del(...keys);
    else keys.forEach((k) => this.mem.delete(k));
  }

  /** Lee y borra de forma atómica (un valor de un solo uso no se puede consumir dos veces). */
  async take<T>(key: string): Promise<T | null> {
    let raw: string | null;
    if (this.redis) raw = await this.redis.getdel(key);
    else {
      raw = this.memGet(key);
      this.mem.delete(key);
    }
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  /** Contador atómico (presencia: nº de conexiones por usuario). */
  async incr(key: string, delta: 1 | -1, ttlSeconds: number): Promise<number> {
    if (this.redis) {
      const n = await this.redis.incrby(key, delta);
      await this.redis.expire(key, ttlSeconds);
      return n;
    }
    const n = Number(this.memGet(key) ?? 0) + delta;
    this.mem.set(key, { v: String(n), exp: Date.now() + ttlSeconds * 1000 });
    return n;
  }

  private memGet(key: string): string | null {
    const e = this.mem.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) {
      this.mem.delete(key);
      return null;
    }
    return e.v;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, e] of this.mem) if (e.exp < now) this.mem.delete(k);
  }
}
