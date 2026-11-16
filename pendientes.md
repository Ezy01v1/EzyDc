# Pendientes de ezyDC

Estado al 16/11/2026: **Fase 1 completa y probada** contra Neon (REST, tiempo real, UI).
Detalle de cada fase en [docs/05-roadmap.md](docs/05-roadmap.md).

## Urgente / housekeeping
- [ ] Rotar la contraseña de Neon (se compartió en el chat) y actualizar `apps/api/.env`.
- [ ] Borrar datos de prueba: usuarios `ana6939`, `beto6939` y el servidor "Prueba".
- [ ] Probar la UI en ancho de escritorio (solo se vio la vista móvil).
- [ ] Añadir tests automáticos (unitarios de permisos + e2e de auth/mensajes).
- [ ] Configurar CI (GitHub Actions: `pnpm typecheck` + `pnpm build`).

## Deuda conocida de la Fase 1
- [ ] `CHANNEL_ACTIVITY` llega a todos los miembros, incluso de canales privados (solo ids, sin contenido). Filtrar por permisos en la Fase 2.
- [ ] El rate limit vive en memoria por instancia → pasarlo a Redis antes de escalar a varias réplicas.
- [ ] La presencia puede quedar "en línea" hasta 24 h si una instancia muere (contador con TTL). Usar heartbeat por socket.
- [ ] El panel de usuario muestra "en línea" según la conexión, no el estado elegido (ausente/no molestar).
- [ ] Editar perfil (nombre visible, bio, estado) existe en la API pero no tiene UI.

## Fase 2 — Roles y permisos
- [ ] CRUD de roles con jerarquía y UI de gestión.
- [ ] Overrides por canal + editor de permisos.
- [ ] Invalidación de la caché de permisos al cambiar roles.
- [ ] 2FA (TOTP) + códigos de respaldo.

## Fase 3 — DMs, notificaciones y archivos
- [ ] Mensajes directos y grupos privados; amigos y bloqueos.
- [ ] No leídos persistentes (`read_states`), contadores por canal y servidor, silenciar.
- [ ] Menciones @usuario / @rol / @everyone.
- [ ] Web Push.
- [ ] Subida de archivos por URL firmada (R2), imágenes WebP/AVIF.
- [ ] Reacciones, emojis personalizados, picker con carga perezosa.
- [ ] Previews de enlaces (con protección SSRF).
- [ ] Resaltado de código perezoso.
- [ ] PWA: service worker, IndexedDB, instalable.
- [ ] Hilos.

## Fase 4 — Voz y vídeo (LiveKit Cloud)
- [ ] Token firmado en el backend según permisos.
- [ ] Canales de voz, mute/deafen, quién habla, volumen por usuario, compartir pantalla.

## Fase 5 — Moderación, bots y búsqueda
- [ ] Kick, ban, timeout, slowmode, filtro de palabras, logs de auditoría.
- [ ] Búsqueda full-text (tsvector + GIN) con filtros.
- [ ] Bots con token y webhooks entrantes.
- [ ] Archivado de mensajes antiguos.

## Fase 6 — Personalización
- [ ] Temas claro/oscuro/custom, color de acento y tamaño de fuente.
- [ ] Avatar, banner, "sobre mí".

## Despliegue
- [ ] Desplegar en Railway + Vercel + Upstash (ver [docs/07-despliegue.md](docs/07-despliegue.md)).
