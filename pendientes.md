# Pendientes de ezyDC

Estado al 16/11/2026: **Fases 1, 2 y 2b completas y probadas** contra Neon (REST, tiempo real, UI).
Detalle de cada fase en [docs/05-roadmap.md](docs/05-roadmap.md).

## Urgente / housekeeping
- [ ] Rotar la contraseña de Neon (se compartió en el chat) y actualizar `apps/api/.env`.
- [ ] Borrar datos de prueba: usuarios `ana6939`, `beto6939` y el servidor "Prueba".
- [x] Probar la UI en ancho de escritorio.
- [ ] Añadir tests automáticos (unitarios de permisos + e2e de auth/mensajes/roles). Hay un guion e2e manual de la Fase 2 (25 casos) que convendría convertir en test.
- [ ] Configurar CI (GitHub Actions: `pnpm typecheck` + `pnpm build`).

## Deuda conocida de la Fase 1
- [x] `CHANNEL_ACTIVITY` ahora solo llega a quien puede ver el canal.
- [ ] El rate limit vive en memoria por instancia → pasarlo a Redis antes de escalar a varias réplicas.
- [ ] La presencia puede quedar "en línea" hasta 24 h si una instancia muere (contador con TTL). Usar heartbeat por socket.
- [~] El panel propio ya muestra el estado elegido, pero cambiarlo no emite `PRESENCE_UPDATE` a los demás hasta reconectar.
- [x] Editar perfil tiene UI (ajustes de usuario).

## Fase 2 — Roles y permisos
- [x] CRUD de roles con jerarquía, reordenar con drag & drop y UI de gestión.
- [x] Asignar/quitar roles a miembros (pestaña Miembros).
- [x] Overrides por canal (permitir / heredar / denegar) + ajustes de canal (nombre, tema, borrar).
- [x] Invalidación O(1) de la caché de permisos (versión por servidor).
- [x] Expulsar de la sala del canal a quien pierde acceso en vivo.
- [x] Lista de miembros agrupada por roles destacados y nombres con color.
- [x] **Fase 2b:** 2FA (TOTP RFC 6238 propio, secreto cifrado AES-256-GCM, anti-replay, 10 códigos de respaldo, login en dos pasos con ticket de 5 min y 5 intentos).
- [x] Ajustes de usuario: perfil (nombre visible, estado, estado personalizado, bio) y seguridad (2FA).
- [ ] Definir `TOTP_ENCRYPTION_KEY` en producción (si falta se deriva de `JWT_ACCESS_SECRET` y rotarlo rompería el 2FA de todos).
- [ ] Al activar el 2FA, ofrecer cerrar las demás sesiones abiertas.
- [ ] Cambiar contraseña y gestión de sesiones activas (la tabla `sessions` ya existe).
- [ ] Sincronizar permisos de un canal con su categoría (botón "sincronizar").
- [ ] `emitToChannelViewers` recorre los sockets del servidor en canales privados: en servidores muy grandes, cachear la lista de usuarios con acceso.

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
