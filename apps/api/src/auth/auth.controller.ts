import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthResponse, LoginInput, RegisterInput, type UserSelf } from '@ezydc/shared';
import type { CookieOptions, Request, Response } from 'express';
import { ZodPipe } from '../common/zod.pipe';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { UsersService } from '../users/users.service';
import { AuthService, type ClientMeta, type Tokens } from './auth.service';
import { CurrentUser, Public } from './decorators';

const STRICT = { default: { limit: 10, ttl: 60_000 } }; // 10 intentos/min por IP

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
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
  ): Promise<AuthResponse> {
    const { user, tokens } = await this.auth.login(body, meta(req));
    this.setCookies(res, tokens);
    return { user };
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
