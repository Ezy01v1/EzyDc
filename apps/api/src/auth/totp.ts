import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226): HMAC-SHA1, 6 dígitos, intervalos de 30 s.
 * Es lo que esperan Google Authenticator, Aegis, 1Password, Authy…
 */
export const TOTP_PERIOD = 30;
const DIGITS = 6;
/** Tolerancia de reloj: acepta el intervalo anterior y el siguiente (±30 s). */
const WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secreto de 160 bits (recomendado por RFC 4226), en base32 para la app. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return bin.toString().padStart(digits, '0');
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD);

/**
 * Devuelve el intervalo (step) que coincide, o null. Ignora steps <= lastStep:
 * así un código ya usado no puede reutilizarse (anti-replay).
 */
export function verifyTotp(secretB32: string, code: string, lastStep: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const step = currentStep(now);
  const given = Buffer.from(code);
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const s = step + w;
    if (s <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(key, s)), given)) return s;
  }
  return null;
}

export function otpauthUrl(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(TOTP_PERIOD) });
  return `otpauth://totp/${label}?${q.toString()}`;
}
