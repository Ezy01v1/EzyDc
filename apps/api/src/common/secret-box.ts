import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifrado simétrico autenticado (AES-256-GCM) para secretos en reposo (p. ej. TOTP).
 * Formato: "<iv>.<tag>.<cipher>" en base64url. Si alguien roba la BD sin la clave,
 * no puede generar códigos 2FA.
 */
export class SecretBox {
  private readonly key: Buffer;

  /** `rawKey`: 32 bytes en base64. Si falta, se deriva (HKDF) de `fallbackSecret`. */
  constructor(rawKey: string | undefined, fallbackSecret: string) {
    if (rawKey) {
      this.key = Buffer.from(rawKey, 'base64');
      if (this.key.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY debe ser 32 bytes en base64');
    } else {
      this.key = Buffer.from(hkdfSync('sha256', fallbackSecret, 'ezydc', 'totp-secret-box', 32));
    }
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
  }

  open(sealed: string): string {
    const [iv, tag, enc] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
    if (!iv || !tag || !enc) throw new Error('Secreto corrupto');
    const d = createDecipheriv('aes-256-gcm', this.key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  }
}
