import { Injectable, Logger } from '@nestjs/common';
import type { EmbedDto } from '@ezydc/shared';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CacheService } from '../core/cache.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';
import { assertSafeUrl, safeFetch } from './safe-fetch';

const MAX_LINKS = 3;
const CACHE_OK = 6 * 3600;
const CACHE_FAIL = 3600;
const MAX_CONCURRENT = 6;

/** URLs del texto, ignorando las que van en `código`, ```bloques``` o <entre ángulos> (como Discord). */
export function extractUrls(content: string): string[] {
  const clean = content.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/<https?:\/\/[^>\s]+>/g, ' ');
  const found = clean.match(/https?:\/\/[^\s<>]+[^\s<>.,:;"')\]!?]/g) ?? [];
  return [...new Set(found)].slice(0, MAX_LINKS);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

const clip = (s: string | undefined, n: number) => {
  const t = s ? decodeEntities(s).replace(/\s+/g, ' ').trim() : '';
  return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null;
};

/** Imagen de la preview: la cargan los NAVEGADORES, así que solo https y nunca hosts internos. */
function safeImage(raw: string | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    const u = assertSafeUrl(new URL(decodeEntities(raw), base).toString());
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseHtml(html: string, url: string): EmbedDto | null {
  const head = html.slice(0, 300_000);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
    const key = attr('property') ?? attr('name');
    const content = attr('content');
    const k = (key?.[2] ?? key?.[3] ?? key?.[4])?.toLowerCase();
    const v = content?.[2] ?? content?.[3] ?? content?.[4];
    if (k && v !== undefined && !meta.has(k)) meta.set(k, v);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clip(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 256);
  const description = clip(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 350);
  const image = safeImage(meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image'), url);
  if (!title && !description && !image) return null;
  const color = meta.get('theme-color');
  return {
    url,
    title,
    description,
    siteName: clip(meta.get('og:site_name'), 100) ?? new URL(url).hostname.replace(/^www\./, ''),
    image,
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null,
  };
}

/**
 * Vistas previas de enlaces, generadas en SEGUNDO PLANO tras enviar el mensaje:
 * el envío no espera a sitios lentos; cuando están listas llega MESSAGE_EMBEDS_UPDATE.
 */
@Injectable()
export class PreviewsService {
  private readonly log = new Logger(PreviewsService.name);
  private running = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Lanza (sin esperar) el cálculo de previews de un mensaje recién creado o editado. */
  schedule(messageId: string, channelId: string, content: string, previous: EmbedDto[] = []): void {
    const urls = extractUrls(content);
    const prevUrls = previous.map((e) => e.url);
    if (urls.join('\n') === prevUrls.join('\n')) return;
    void this.run(messageId, channelId, urls).catch((e: Error) => this.log.warn(`preview ${messageId}: ${e.message}`));
  }

  private async run(messageId: string, channelId: string, urls: string[]): Promise<void> {
    const embeds = (await Promise.all(urls.map((u) => this.limited(() => this.preview(u))))).filter((e): e is EmbedDto => !!e);
    try {
      await this.prisma.message.update({ where: { id: messageId }, data: { embeds: embeds as unknown as Prisma.InputJsonValue } });
    } catch {
      return; // el mensaje se borró mientras tanto
    }
    this.realtime.emit(room.channel(channelId), 'MESSAGE_EMBEDS_UPDATE', { id: messageId, channelId, embeds });
  }

  async preview(url: string): Promise<EmbedDto | null> {
    const key = `embed:${createHash('sha1').update(url).digest('hex')}`;
    const cached = await this.cache.get<EmbedDto | false>(key);
    if (cached !== null) return cached || null;
    let embed: EmbedDto | null = null;
    try {
      const res = await safeFetch(url);
      if (res.status >= 200 && res.status < 300) {
        if (res.contentType.startsWith('image/')) {
          const img = safeImage(res.url, res.url);
          embed = img ? { url, title: null, description: null, siteName: null, image: img, color: null } : null;
        } else if (/text\/html|application\/xhtml/.test(res.contentType)) {
          const charset = /charset=([\w-]+)/i.exec(res.contentType)?.[1] ?? 'utf-8';
          let html: string;
          try {
            html = new TextDecoder(charset).decode(res.body);
          } catch {
            html = res.body.toString('utf8');
          }
          embed = parseHtml(html, url);
        }
      }
    } catch (e) {
      this.log.debug(`sin preview ${url}: ${(e as Error).message}`);
    }
    await this.cache.set(key, embed ?? false, embed ? CACHE_OK : CACHE_FAIL);
    return embed;
  }

  /** Como mucho N descargas a la vez en toda la instancia. */
  private limited<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.queue.shift()?.();
          });
      };
      if (this.running < MAX_CONCURRENT) start();
      else this.queue.push(start);
    });
  }
}
