import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthResponse,
  type BackupCodes,
  CodeInput,
  DisableTwoFactorInput,
  LoginInput,
  type LoginResponse,
  LoginTwoFactorInput,
  PasswordInput,
  RegisterInput,
  type TwoFactorSetup,
  type UserSelf,
} from '@ezydc/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodPipe } from '../common/zod.pipe';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { UsersService } from '../users/users.service';
import { AuthService, type ClientMeta, type Tokens } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { TwoFactorService } from './two-factor.service';

const STRICT = { default: { limit: 10, ttl: 60_000 } }; // 10 intentos/min por IP

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly twoFactor: TwoFactorService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  async register(
    @Body(new ZodPipe(RegisterInput)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.register(body, meta(req));
    this.setCookies(res, tokens);
    return { user };
  }

  @Public()
  @Throttle(STRICT)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodPipe(LoginInput)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(body, meta(req));
    if ('mfaUserId' in result) return { mfaRequired: true, ticket: this.twoFactor.issueTicket(result.mfaUserId) };
    this.setCookies(res, result.tokens);
    return { user: result.user };
  }

  @Public()
  // 10 códigos/min por IP; además, cada ticket admite solo 5 intentos (TwoFactorService).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/2fa')
  async loginTwoFactor(
    @Body(new ZodPipe(LoginTwoFactorInput)) body: LoginTwoFactorInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const user = await this.twoFactor.redeemTicket(body.ticket, body.code);
    const { user: self, tokens } = await this.auth.completeLogin(user, meta(req));
    this.setCookies(res, tokens);
    return { user: self };
  }

  // ───────── gestión del 2FA (con sesión) ─────────

  @Throttle(STRICT)
  @Post('2fa/setup')
  setupTwoFactor(@CurrentUser() userId: string, @Body(new ZodPipe(PasswordInput)) body: PasswordInput): Promise<TwoFactorSetup> {
    return this.twoFactor.setup(userId, body.password);
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('2fa/enable')
  enableTwoFactor(@CurrentUser() userId: string, @Body(new ZodPipe(CodeInput)) body: CodeInput): Promise<BackupCodes> {
    return this.twoFactor.enable(userId, body.code);
  }

  @Throttle(STRICT)
  @HttpCode(204)
  @Post('2fa/disable')
  disableTwoFactor(@CurrentUser() userId: string, @Body(new ZodPipe(DisableTwoFactorInput)) body: DisableTwoFactorInput): Promise<void> {
    return this.twoFactor.disable(userId, body.password, body.code);
  }

  @Throttle(STRICT)
  @HttpCode(200)
  @Post('2fa/backup-codes')
  regenerateBackupCodes(@CurrentUser() userId: string, @Body(new ZodPipe(CodeInput)) body: CodeInput): Promise<BackupCodes> {
    return this.twoFactor.regenerateBackupCodes(userId, body.code);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const token = (req.cookies as Record<string, string | undefined>).refresh_token;
    if (!token) throw new UnauthorizedException();
    try {
      this.setCookies(res, await this.auth.refresh(token));
      return { ok: true };
    } catch (e) {
      this.clearCookies(res);
      throw e;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout((req.cookies as Record<string, string | undefined>).refresh_token);
    this.clearCookies(res);
  }

  @Get('me')
  me(@CurrentUser() userId: string): Promise<UserSelf> {
    return this.users.getSelf(userId);
  }

  @Get('socket-token')
  socketToken(@CurrentUser() userId: string): { token: string } {
    return { token: this.auth.signSocketToken(userId) };
  }

  private base(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.cfg.COOKIE_SECURE,
      sameSite: this.cfg.COOKIE_SAMESITE,
      domain: this.cfg.COOKIE_DOMAIN,
    };
  }

  private setCookies(res: Response, t: Tokens): void {
    res.cookie('access_token', t.access, { ...this.base(), path: '/', maxAge: this.cfg.ACCESS_TOKEN_TTL * 1000 });
    if (t.refresh) {
      // path restringido: el refresh token solo viaja a /api/auth/*
      res.cookie('refresh_token', t.refresh, {
        ...this.base(),
        path: '/api/auth',
        maxAge: this.cfg.REFRESH_TOKEN_TTL_DAYS * 86400_000,
      });
    }
  }

  private clearCookies(res: Response): void {
    res.clearCookie('access_token', { ...this.base(), path: '/' });
    res.clearCookie('refresh_token', { ...this.base(), path: '/api/auth' });
  }
}

function meta(req: Request): ClientMeta {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}
