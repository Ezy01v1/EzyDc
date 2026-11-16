import { createParamDecorator, type ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC = 'isPublic';
/** Ruta accesible sin sesión (si hay sesión válida, igualmente se rellena req.user). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Id del usuario autenticado. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.user) throw new UnauthorizedException();
  return req.user.id;
});
