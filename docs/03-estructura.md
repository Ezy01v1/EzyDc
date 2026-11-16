# 3. Estructura del monorepo

```
ezyDC/
├─ package.json              # scripts raíz: dev, build, typecheck, db:*
├─ pnpm-workspace.yaml       # workspaces + scripts de instalación permitidos
├─ tsconfig.base.json        # strict, noUncheckedIndexedAccess…
├─ docs/                     # estos documentos
├─ packages/
│  └─ shared/                # @ezydc/shared — ÚNICA fuente de verdad del contrato
│     └─ src/
│        ├─ permissions.ts   # bitfield, computeBase/ChannelPermissions
│        ├─ schemas.ts       # zod: validan formularios (web) y bodies (api)
│        ├─ types.ts         # DTOs REST/WS
│        └─ events.ts        # contrato tipado de Socket.IO
└─ apps/
   ├─ api/                   # @ezydc/api — NestJS
   │  ├─ prisma/
   │  │  ├─ schema.prisma    # esquema completo (todas las fases)
   │  │  └─ migrations/
   │  └─ src/
   │     ├─ main.ts          # helmet, compresión, cookies, CSRF, CORS, adapter WS
   │     ├─ app.module.ts    # guards globales (auth → rate limit), métricas
   │     ├─ config/          # validación zod de variables de entorno
   │     ├─ core/            # Prisma, caché (Redis|memoria), permisos, emisor realtime
   │     ├─ common/          # ZodPipe, CSRF, throttler por usuario, mappers DTO
   │     ├─ auth/            # registro, login, refresh rotativo, socket-token
   │     ├─ users/           # perfil
   │     ├─ servers/         # servidores, miembros, invitaciones
   │     ├─ channels/        # CRUD + reordenación
   │     ├─ messages/        # historial por cursor, CRUD
   │     ├─ realtime/        # gateway Socket.IO + adapter Redis
   │     └─ metrics/         # /health y /metrics
   │     # Fases siguientes: roles/, dms/, notifications/, files/, voice/,
   │     #                   moderation/, search/, bots/, webhooks/
   └─ web/                   # @ezydc/web — React + Vite
      ├─ vite.config.ts      # proxy /api y /socket.io, chunks manuales
      ├─ vercel.json · netlify.toml
      └─ src/
         ├─ App.tsx          # rutas con lazy()
         ├─ lib/             # api (CSRF + refresh), socket, markdown seguro, queryClient
         ├─ stores/          # Zustand: auth, live (typing, presencia, no leídos)
         ├─ components/      # Avatar, Modal, Splash
         └─ features/
            ├─ auth/         # Login / Registro
            ├─ invite/       # /invite/:code
            └─ app/          # layout, rail, sidebar, chat/, miembros, modales
```

**Regla de dependencias:** `web → shared ← api`. `web` y `api` nunca se importan entre sí.
`shared` se compila a CommonJS para la API y Vite consume directamente su código TS (alias), con tree-shaking.
