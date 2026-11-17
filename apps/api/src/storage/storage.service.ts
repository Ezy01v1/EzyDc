import { DeleteObjectsCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';

const PRESIGN_TTL = 600; // 10 min para empezar la subida

/**
 * Cloudflare R2 vía API S3. El navegador sube DIRECTO al bucket con una URL firmada:
 * la API nunca toca los bytes (ni ancho de banda ni memoria del servidor).
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  readonly publicBase: string | null;

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    const ok = cfg.R2_ACCOUNT_ID && cfg.R2_ACCESS_KEY_ID && cfg.R2_SECRET_ACCESS_KEY && cfg.R2_BUCKET && cfg.R2_PUBLIC_URL;
    this.bucket = cfg.R2_BUCKET ?? '';
    this.publicBase = ok ? cfg.R2_PUBLIC_URL!.replace(/\/+$/, '') : null;
    this.s3 = ok
      ? new S3Client({
          region: 'auto',
          endpoint: `https://${cfg.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: cfg.R2_ACCESS_KEY_ID!, secretAccessKey: cfg.R2_SECRET_ACCESS_KEY! },
          // Sin esto el SDK firma un checksum CRC32 de un cuerpo que aún no existe (lo sube el navegador).
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
        })
      : null;
    if (!ok) this.log.warn('R2 no configurado: subidas de archivos desactivadas');
  }

  get enabled(): boolean {
    return this.s3 !== null;
  }

  private client(): S3Client {
    if (!this.s3) throw new ServiceUnavailableException('El almacenamiento de archivos no está configurado');
    return this.s3;
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Inverso de publicUrl (para borrar); null si la URL no es de nuestro bucket. */
  keyFromUrl(url: string): string | null {
    if (!this.publicBase || !url.startsWith(`${this.publicBase}/`)) return null;
    return url.slice(this.publicBase.length + 1).split('/').map(decodeURIComponent).join('/');
  }

  /**
   * URL de PUT firmada. Content-Type, Content-Length y Content-Disposition entran en la firma:
   * el cliente no puede subir otro tamaño ni otro tipo distinto del autorizado.
   */
  async presignPut(
    key: string,
    contentType: string,
    size: number,
    disposition?: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
      ...(disposition ? { ContentDisposition: disposition } : {}),
      CacheControl: 'public, max-age=31536000, immutable',
    });
    const url = await getSignedUrl(this.client(), cmd, {
      expiresIn: PRESIGN_TTL,
      signableHeaders: new Set(['content-type', 'content-length', 'cache-control', ...(disposition ? ['content-disposition'] : [])]),
    });
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (disposition) headers['Content-Disposition'] = disposition;
    return { url, headers };
  }

  /** Tamaño real del objeto subido, o null si no existe. */
  async size(key: string): Promise<number | null> {
    try {
      const h = await this.client().send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return h.ContentLength ?? null;
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  /** Borrado de mejor esfuerzo (no bloquea ni falla la operación que lo pide). */
  deleteKeys(keys: string[]): void {
    if (!this.s3 || keys.length === 0) return;
    const s3 = this.s3;
    void (async () => {
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        await s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
      }
    })().catch((e: Error) => this.log.warn(`No se pudieron borrar ${keys.length} objetos: ${e.message}`));
  }
}
