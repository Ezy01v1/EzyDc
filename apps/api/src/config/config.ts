import { z } from 'zod';

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: optionalString,
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener ≥ 32 caracteres'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  COOKIE_SECURE: bool('false'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: optionalString,
  METRICS_TOKEN: optionalString,
});

export type AppConfig = z.infer<typeof EnvSchema>;
export const APP_CONFIG = Symbol('APP_CONFIG');

let cached: AppConfig | undefined;

/** Valida process.env una sola vez; falla rápido al arrancar si falta algo. */
export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
    throw new Error('Configuración inválida (revisa apps/api/.env)');
  }
  cached = parsed.data;
  return cached;
}
