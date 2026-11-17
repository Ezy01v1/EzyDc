# 7. Despliegue (sin Docker, Nginx ni PM2)

Topología: **Vercel/Netlify** (estáticos + rewrite `/api`) → **Railway/Render** (NestJS) → **Neon/Supabase** + **Upstash** (+ LiveKit Cloud y R2 en fases 3–4).

Gracias al rewrite, el navegador ve la API en el **mismo origen** que la web: las cookies funcionan con `SameSite=Lax` y no hace falta CORS para HTTP. El WebSocket va directo al backend con un token efímero.

## 1. Base de datos — Neon (o Supabase)

1. Crea un proyecto en neon.tech (región cercana al backend).
2. Copia dos cadenas de conexión:
   - **Pooled** (host con `-pooler`) → `DATABASE_URL`, añade `&pgbouncer=true&connection_limit=5`.
   - **Direct** → `DIRECT_URL` (solo migraciones).
3. *Supabase:* `DATABASE_URL` = puerto **6543** con `?pgbouncer=true&connection_limit=5`; `DIRECT_URL` = puerto **5432**.

## 2. Redis — Upstash

1. Crea una base Redis en upstash.com (misma región).
2. Copia la URL **TLS** (`rediss://default:…@…upstash.io:6379`) → `REDIS_URL`.
   Activa el adapter de Socket.IO, la caché de permisos y la presencia compartida.

## 3. Backend — Railway

1. *New Project → Deploy from GitHub repo* (sube antes el repo).
2. En el servicio, **Settings**:
   - Root directory: `/` (el monorepo completo).
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @ezydc/shared build && pnpm --filter @ezydc/api build`
   - Pre-deploy command: `pnpm --filter @ezydc/api db:deploy`
   - Start command: `pnpm --filter @ezydc/api start`
   - Healthcheck path: `/api/health`
   - Watch paths: `apps/api/**`, `packages/shared/**`
3. **Variables** (ver `apps/api/.env.example`):
   ```
   NODE_ENV=production
   DATABASE_URL=…pooler…&pgbouncer=true&connection_limit=5
   DIRECT_URL=…directa…
   REDIS_URL=rediss://…
   JWT_ACCESS_SECRET=<48+ bytes aleatorios>
   CORS_ORIGINS=https://tu-app.vercel.app
   COOKIE_SECURE=true
   COOKIE_SAMESITE=lax
   METRICS_TOKEN=<aleatorio>
   TOTP_ENCRYPTION_KEY=<32 bytes base64; no cambiarla nunca>
   ```
   Railway inyecta `PORT` automáticamente.
4. *Networking → Generate Domain* → p. ej. `https://ezydc-api.up.railway.app`.
5. Escalar: *Replicas* > 1 funciona porque el adapter Redis difunde eventos entre instancias (Railway soporta WebSocket sin configuración extra).

### Alternativa: Render

*New → Web Service* (runtime **Node**, no Docker) con los mismos comandos:
- Build: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @ezydc/shared build && pnpm --filter @ezydc/api build && pnpm --filter @ezydc/api db:deploy`
- Start: `pnpm --filter @ezydc/api start` · Health check: `/api/health`
- Plan gratuito duerme tras 15 min sin tráfico (primer arranque lento); para tiempo real usa *Starter*.

## 4. Frontend — Vercel

1. *Add New Project* → mismo repo.
   - Root Directory: `apps/web`
   - Framework: Vite (detectado). Install: `pnpm install --frozen-lockfile` · Build: `pnpm build` · Output: `dist`
   - Activa *Include files outside the root directory* (necesario para `packages/shared`).
2. Edita `apps/web/vercel.json` y cambia `YOUR-API-HOST` por el dominio de Railway/Render.
3. Variables: `VITE_API_URL=/api` y `VITE_WS_URL=https://ezydc-api.up.railway.app`.
4. Despliega y añade el dominio final a `CORS_ORIGINS` en el backend (lo usa Socket.IO).

### Alternativa: Netlify

Base directory `apps/web`, build `pnpm build`, publish `apps/web/dist`. Cambia `YOUR-API-HOST` en `apps/web/netlify.toml`. Mismas variables `VITE_*`.

## 5. LiveKit Cloud (Fase 4)

Crea un proyecto en cloud.livekit.io y añade al backend `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Configura el webhook de LiveKit hacia `https://<api>/api/voice/webhook`.

## 6. Archivos — Cloudflare R2 (Fase 3)

Bucket + token S3 con permiso de escritura solo sobre ese bucket. CORS del bucket (R2 → bucket → Settings → CORS Policy):

```json
[
  {
    "AllowedOrigins": ["http://localhost:5300", "https://TU-DOMINIO-WEB"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "cache-control", "content-disposition"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
 Variables `R2_*` en el backend; dominio público (o `r2.dev`) en `R2_PUBLIC_URL`.

## 6b. Notificaciones push — VAPID (Fase 3c)

Genera las claves UNA vez y guárdalas (si cambian, todas las suscripciones dejan de valer):

```bash
npx web-push generate-vapid-keys
```

En el backend: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT=mailto:tu-correo`. El frontend obtiene la clave pública de `GET /api/config`. Push y el service worker exigen **HTTPS** (en local, `localhost` vale).

## 7. Verificación tras desplegar

```bash
curl https://<api>/api/health                              # {"ok":true,"db":true}
curl -H "x-metrics-token: $TOKEN" https://<api>/api/metrics # p95, RSS, sockets
```
En la web: registra dos cuentas en dos navegadores, crea servidor, invita, chatea → los mensajes y el "escribiendo…" deben aparecer al instante. El panel de usuario muestra la latencia del WebSocket.

## Checklist de seguridad en producción
- [ ] `COOKIE_SECURE=true`, `JWT_ACCESS_SECRET` aleatorio y distinto por entorno.
- [ ] `CORS_ORIGINS` solo con tus dominios.
- [ ] `METRICS_TOKEN` definido.
- [ ] Postgres y Redis con TLS (`sslmode=require`, `rediss://`).
- [ ] Migraciones vía `db:deploy` (nunca `migrate dev` en producción).
