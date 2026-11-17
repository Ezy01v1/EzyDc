import { BadRequestException, Injectable } from '@nestjs/common';
import type { UploadTicket } from '@ezydc/shared';
import { randomUUID } from 'node:crypto';
import { CacheService } from '../core/cache.service';
import { StorageService } from './storage.service';

const PENDING_TTL = 30 * 60; // un adjunto subido y no enviado caduca a los 30 min

/** Tipos que el navegador puede mostrar en línea sin riesgo. El resto se fuerza a descarga. */
const INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'text/plain',
]);

export interface PendingUpload {
  userId: string;
  /** Para qué se pidió: "ch:<channelId>" o "emoji:<serverId>". No se puede usar en otro sitio. */
  scope: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  const clean = base.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-100);
  return clean || 'archivo';
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  private pendingKey = (id: string) => `upl:${id}`;

  /** Emite una URL de subida firmada y guarda el "vale" pendiente hasta que se use. */
  async issue(
    userId: string,
    scope: string,
    key: (uploadId: string) => string,
    file: { filename: string; contentType: string; size: number },
  ): Promise<UploadTicket> {
    const uploadId = randomUUID();
    const filename = safeFilename(file.filename);
    const declared = file.contentType.toLowerCase().split(';')[0]!.trim();
    const inline = INLINE_TYPES.has(declared);
    const contentType = inline ? declared : 'application/octet-stream';
    // Lo que no se muestra en línea (html, svg, pdf…) se sirve como descarga: nunca se ejecuta en el dominio del CDN.
    const disposition = inline ? undefined : `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    const objectKey = key(uploadId);
    const signed = await this.storage.presignPut(objectKey, contentType, file.size, disposition);
    const pending: PendingUpload = { userId, scope, key: objectKey, filename, contentType, size: file.size };
    await this.cache.set(this.pendingKey(uploadId), pending, PENDING_TTL);
    return { uploadId, uploadUrl: signed.url, headers: signed.headers };
  }

  /**
   * Consume un vale (un solo uso) y comprueba en R2 que el archivo existe con el tamaño autorizado.
   * Si algo falla, el vale queda gastado: el cliente debe pedir otro.
   */
  async consume(userId: string, scope: string, uploadId: string): Promise<PendingUpload> {
    const key = this.pendingKey(uploadId);
    // Primero se comprueba el dueño SIN consumir: si no, un tercero que adivine el id gastaría mi vale.
    const peek = await this.cache.get<PendingUpload>(key);
    if (!peek || peek.userId !== userId || peek.scope !== scope) throw new BadRequestException('Archivo no encontrado o caducado');
    const p = await this.cache.take<PendingUpload>(key); // atómico: dos envíos simultáneos no lo usan dos veces
    if (!p) throw new BadRequestException('Archivo no encontrado o caducado');
    const size = await this.storage.size(p.key);
    if (size === null) throw new BadRequestException(`"${p.filename}" no terminó de subirse`);
    if (size !== p.size) {
      this.storage.deleteKeys([p.key]);
      throw new BadRequestException(`"${p.filename}" no coincide con lo autorizado`);
    }
    return p;
  }
}
