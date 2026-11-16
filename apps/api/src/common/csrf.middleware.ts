import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config/config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfCookieOptions(cfg: AppConfig): CookieOptions {
  return {
    httpOnly: false, // el frontend la lee y la reenvía en la cabecera x-csrf-token
    secure: cfg.COOKIE_SECURE,
    sameSite: cfg.COOKIE_SAMESITE,
    domain: cfg.COOKIE_DOMAIN,
    path: '/',
    maxAge: 30 * 86400_000,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * CSRF "double submit cookie": toda mutación autenticada por cookie debe traer
 * x-csrf-token === cookie csrf_token. Un sitio externo no puede leer la cookie.
 * Las llamadas con Authorization: Bearer (bots) no usan cookies y quedan exentas.
 */
export function csrfMiddleware(cfg: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookies = req.cookies as Record<string, string | undefined>;
    const cookieToken = cookies.csrf_token;

    if (SAFE_METHODS.has(req.method)) {
      if (!cookieToken) res.cookie('csrf_token', randomBytes(24).toString('hex'), csrfCookieOptions(cfg));
      return next();
    }
    if (req.headers.authorization?.startsWith('Bearer ')) return next();
    if (!cookies.access_token && !cookies.refresh_token) return next(); // sin sesión no hay nada que robar

    const header = req.get('x-csrf-token');
    if (!cookieToken || !header || !safeEqual(cookieToken, header)) {
      res.status(403).json({ statusCode: 403, message: 'CSRF token inválido' });
      return;
    }
    next();
  };
}
