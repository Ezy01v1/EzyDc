import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from './decorators';

/** Guard global: valida el access JWT (cookie httpOnly o Authorization: Bearer). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true; // el gateway autentica en el handshake

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as Record<string, string | undefined>;
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = cookies.access_token ?? bearer;

    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: string }>(token, { audience: 'api' });
        req.user = { id: payload.sub };
        return true;
      } catch {
        /* expirado o inválido */
      }
    }
    if (isPublic) return true;
    throw new UnauthorizedException();
  }
}
