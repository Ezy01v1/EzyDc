import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import type { BackupCodes, TwoFactorSetup } from '@ezydc/shared';
import type { User } from '@prisma/client';
import QRCode from 'qrcode';
import { SecretBox } from '../common/secret-box';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { CacheService } from '../core/cache.service';
import { PrismaService } from '../core/prisma.service';
import { generateSecret, otpauthUrl, verifyTotp } from './totp';

const BACKUP_COUNT = 10;
const TICKET_TTL = 300; // 5 min para introducir el código tras la contraseña
const MAX_TICKET_ATTEMPTS = 5;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** "ABCde-12 345" → "abcde12345" */
const normalize = (code: string) => code.replace(/[\s-]/g, '').toLowerCase();

@Injectable()
export class TwoFactorService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cache: CacheService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {
    this.box = new SecretBox(cfg.TOTP_ENCRYPTION_KEY, cfg.JWT_ACCESS_SECRET);
  }

  /** Paso 1: genera un secreto PENDIENTE (aún no activo) y su QR. Exige la contraseña. */
  async setup(userId: string, password: string): Promise<TwoFactorSetup> {
    const user = await this.getUser(userId);
    await this.assertPassword(user, password);
    if (user.totpEnabled) throw new BadRequestException('El 2FA ya está activado');

    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: this.box.seal(secret), totpLastStep: null },
    });
    const url = otpauthUrl(secret, user.email, this.cfg.TOTP_ISSUER);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { secret, otpauthUrl: url, qrSvg };
  }

  /** Paso 2: confirma con un código de la app (prueba que se escaneó bien) y devuelve los códigos de respaldo. */
  async enable(userId: string, code: string): Promise<BackupCodes> {
    const user = await this.getUser(userId);
    if (user.totpEnabled) throw new BadRequestException('El 2FA ya está activado');
    if (!user.totpSecret) throw new BadRequestException('Primero inicia la configuración');
    const step = verifyTotp(this.box.open(user.totpSecret), normalize(code), user.totpLastStep ?? -1);
    if (step === null) throw new BadRequestException('Código incorrecto. Revisa la hora de tu móvil.');

    const { codes, hashes } = this.makeBackupCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true, totpLastStep: step, backupCodes: hashes },
    });
    return { codes };
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.getUser(userId);
    await this.assertPassword(user, password);
    if (!user.totpEnabled) throw new BadRequestException('El 2FA no está activado');
    if (!(await this.verifySecondFactor(user, code))) throw new BadRequestException('Código incorrecto');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null, totpLastStep: null, backupCodes: [] },
    });
  }

  async regenerateBackupCodes(userId: string, code: string): Promise<BackupCodes> {
    const user = await this.getUser(userId);
    if (!user.totpEnabled) throw new BadRequestException('El 2FA no está activado');
    if (!(await this.verifySecondFactor(user, code))) throw new BadRequestException('Código incorrecto');
    const { codes, hashes } = this.makeBackupCodes();
    await this.prisma.user.update({ where: { id: userId }, data: { backupCodes: hashes } });
    return { codes };
  }

  // ───────── login en dos pasos ─────────

  /** Ticket firmado (audiencia "mfa"): NO sirve contra la API ni el socket. */
  issueTicket(userId: string): string {
    return this.jwt.sign({ sub: userId, tid: randomUUID() }, { audience: 'mfa', expiresIn: TICKET_TTL });
  }

  /** Canjea ticket + código. Máximo 5 intentos por ticket (además del rate limit por IP). */
  async redeemTicket(ticket: string, code: string): Promise<User> {
    let payload: { sub: string; tid: string };
    try {
      payload = this.jwt.verify(ticket, { audience: 'mfa' });
    } catch {
      throw new UnauthorizedException('La verificación caducó. Vuelve a iniciar sesión.');
    }
    const key = `mfa:attempts:${payload.tid}`;
    const attempts = await this.cache.incr(key, 1, TICKET_TTL);
    if (attempts > MAX_TICKET_ATTEMPTS) throw new UnauthorizedException('Demasiados intentos. Vuelve a iniciar sesión.');

    const user = await this.getUser(payload.sub);
    if (!user.totpEnabled || !(await this.verifySecondFactor(user, code))) {
      throw new UnauthorizedException('Código incorrecto');
    }
    // Un ticket solo vale una vez: se agotan sus intentos restantes.
    await this.cache.set(key, MAX_TICKET_ATTEMPTS + 1, TICKET_TTL);
    return user;
  }

  /**
   * Acepta un código TOTP o uno de respaldo. Ambas comprobaciones son ATÓMICAS en la BD
   * (updateMany condicional): dos peticiones simultáneas con el mismo código no pasan las dos.
   */
  async verifySecondFactor(user: User, raw: string): Promise<boolean> {
    const code = normalize(raw);
    if (/^\d{6}$/.test(code)) {
      if (!user.totpSecret) return false;
      const step = verifyTotp(this.box.open(user.totpSecret), code, user.totpLastStep ?? -1);
      if (step === null) return false;
      const res = await this.prisma.user.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      return res.count === 1;
    }
    const h = sha256(code);
    if (!user.backupCodes.includes(h)) return false;
    const res = await this.prisma.user.updateMany({
      where: { id: user.id, backupCodes: { has: h } },
      data: { backupCodes: user.backupCodes.filter((x) => x !== h) },
    });
    return res.count === 1;
  }

  private makeBackupCodes(): { codes: string[]; hashes: string[] } {
    const codes = Array.from({ length: BACKUP_COUNT }, () => {
      const raw = randomBytes(6).toString('hex').slice(0, 10); // 40 bits
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    return { codes, hashes: codes.map((c) => sha256(normalize(c))) };
  }

  private async getUser(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async assertPassword(user: User, password: string): Promise<void> {
    if (!(await verify(user.passwordHash, password))) throw new UnauthorizedException('Contraseña incorrecta');
  }
}
