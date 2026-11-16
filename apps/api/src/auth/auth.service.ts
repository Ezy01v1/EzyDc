import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { LoginInput, RegisterInput, UserSelf } from '@ezydc/shared';
import { Prisma } from '@prisma/client';
import { toUserSelf } from '../common/mappers';
import { UUID_RE } from '../common/random';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { PrismaService } from '../core/prisma.service';

/** Parámetros argon2id recomendados por OWASP (19 MiB, 2 iteraciones). */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
/** Ventana en la que el refresh anterior sigue valiendo (pestañas que refrescan a la vez). */
const ROTATION_GRACE_MS = 30_000;

export interface Tokens {
  access: string;
  /** null cuando se usó la ventana de gracia: la cookie nueva ya la fijó la otra pestaña. */
  refresh: string | null;
}

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  async register(input: RegisterInput, meta: ClientMeta): Promise<{ user: UserSelf; tokens: Tokens }> {
    const passwordHash = await hash(input.password, ARGON);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          passwordHash,
          settings: { create: {} },
        },
      });
      return { user: toUserSelf(user), tokens: await this.issue(user.id, meta) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('El email o el nombre de usuario ya están en uso');
      }
      throw e;
    }
  }

  async login(input: LoginInput, meta: ClientMeta): Promise<{ user: UserSelf; tokens: Tokens }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Si no existe, igualamos el tiempo de respuesta para no filtrar qué emails están registrados.
    const ok = user ? await verify(user.passwordHash, input.password) : (await hash(input.password, ARGON), false);
    if (!user || !ok) throw new UnauthorizedException('Email o contraseña incorrectos');
    return { user: toUserSelf(user), tokens: await this.issue(user.id, meta) };
  }

  /** Rota el refresh token. Reutilizar uno ya rotado revoca TODAS las sesiones (robo probable). */
  async refresh(token: string): Promise<Tokens> {
    const [sessionId, secret] = token.split('.');
    if (!sessionId || !secret || !UUID_RE.test(sessionId)) throw new UnauthorizedException();

    const s = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) throw new UnauthorizedException();

    const h = sha256(secret);
    if (h !== s.tokenHash) {
      const inGrace =
        s.prevTokenHash === h && s.rotatedAt && Date.now() - s.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (inGrace) return { access: this.signAccess(s.userId), refresh: null };
      await this.prisma.session.updateMany({
        where: { userId: s.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sesión revocada');
    }

    const next = randomBytes(32).toString('base64url');
    await this.prisma.session.update({
      where: { id: s.id },
      data: { tokenHash: sha256(next), prevTokenHash: s.tokenHash, rotatedAt: new Date(), lastUsedAt: new Date() },
    });
    return { access: this.signAccess(s.userId), refresh: `${s.id}.${next}` };
  }

  async logout(token: string | undefined): Promise<void> {
    const sessionId = token?.split('.')[0];
    if (!sessionId || !UUID_RE.test(sessionId)) return;
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** JWT de 60 s para el handshake del WebSocket (audiencia distinta: no sirve contra la API). */
  signSocketToken(userId: string): string {
    return this.jwt.sign({ sub: userId }, { audience: 'ws', expiresIn: 60 });
  }

  private signAccess(userId: string): string {
    return this.jwt.sign({ sub: userId }, { audience: 'api', expiresIn: this.cfg.ACCESS_TOKEN_TTL });
  }

  private async issue(userId: string, meta: ClientMeta): Promise<Tokens> {
    const secret = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + this.cfg.REFRESH_TOKEN_TTL_DAYS * 86400_000),
        userAgent: meta.userAgent?.slice(0, 256),
        ip: meta.ip?.slice(0, 64),
      },
    });
    return { access: this.signAccess(userId), refresh: `${session.id}.${secret}` };
  }
}
