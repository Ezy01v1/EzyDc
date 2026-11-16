# ezyDC

Plataforma de comunicación en tiempo real (servidores, canales, mensajes, voz) pensada para equipos modestos y conexiones lentas.
Monorepo pnpm: **NestJS + Socket.IO + Prisma/PostgreSQL** en el backend, **React + Vite + Tailwind + Zustand + TanStack Query** en el frontend.

| Documento | Contenido |
|---|---|
| [01 · Arquitectura](docs/01-arquitectura.md) | Diagrama, decisiones y presupuestos de rendimiento |
| [02 · Base de datos](docs/02-base-de-datos.md) | Esquema, índices, paginación, FTS, archivado, pool |
| [03 · Estructura](docs/03-estructura.md) | Monorepo y reglas de dependencias |
| [04 · Contratos](docs/04-contratos.md) | Endpoints REST y eventos WebSocket |
| [05 · Roadmap](docs/05-roadmap.md) | Fases 1 → 6 |
| **06 · Levantar en local** | (abajo) |
| [07 · Despliegue](docs/07-despliegue.md) | Railway/Render + Vercel/Netlify + Neon + Upstash + LiveKit |

## 6. Levantar la Fase 1 en local

Requisitos: **Node ≥ 20.12** (probado con 24), **pnpm 10** (`corepack enable`) y una base **PostgreSQL**:
- Postgres instalado en el sistema (instalador oficial para Windows/macOS, o el paquete de tu distro), **o**
- una rama gratuita de **Neon** (no necesitas instalar nada).

Redis es **opcional** en local: sin `REDIS_URL` se usa caché en memoria.

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

Edita `apps/api/.env`: pon tu `DATABASE_URL` / `DIRECT_URL` y genera un secreto:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Crea las tablas (aplica `prisma/migrations`):

```bash
pnpm db:migrate
```

Arranca todo (shared en watch + API en :3100 + web en :5300):

```bash
pnpm dev
```

Abre http://localhost:5300, regístrate, crea un servidor y abre un segundo navegador (o ventana privada) con otra cuenta usando el enlace de invitación para ver el tiempo real.

### Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Todo en modo desarrollo con recarga |
| `pnpm build` | Build de producción de los tres paquetes |
| `pnpm typecheck` | Tipado estricto en todo el monorepo |
| `pnpm db:migrate` | `prisma migrate dev` (crea/aplica migraciones en local) |
| `pnpm db:deploy` | `prisma migrate deploy` (producción) |
| `pnpm --filter @ezydc/api db:studio` | Explorador visual de la BD |

### Medir los presupuestos

- **Bundle:** `pnpm --filter @ezydc/web build` muestra el tamaño gzip por chunk. Fase 1: ~150 KB de JS inicial (objetivo < 200 KB).
- **API:** `GET http://localhost:3100/api/metrics` → p50/p95/p99, RSS/heap, sockets abiertos.
- **WebSocket:** la latencia aparece bajo tu nombre en el panel inferior izquierdo.

## Qué incluye la Fase 1

- Registro/login con argon2id, access JWT (15 min) + refresh opaco rotativo con detección de reutilización, cookies httpOnly, CSRF double-submit.
- Servidores con rol `@everyone`, categorías y canales por defecto; invitaciones con caducidad/usos; abandonar/eliminar.
- Canales de texto/voz/anuncios/categorías; crear y reordenar con drag & drop (optimista).
- Mensajes en tiempo real: envío optimista con `nonce`, editar, borrar, responder, markdown seguro (sin `innerHTML`), agrupado por autor.
- Historial con paginación por cursor y lista **virtualizada**; sincronización incremental tras reconexión.
- "Está escribiendo…", presencia en línea/desconectado, miembros virtualizados, indicador de no leídos.
- Permisos por bits evaluados en servidor en cada acción (con caché), rate limit por usuario/IP, Helmet, compresión, CORS estricto, validación zod compartida.
