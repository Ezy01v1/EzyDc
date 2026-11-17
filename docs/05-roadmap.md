# 5. Roadmap por fases

Cada fase se puede desplegar sola. El esquema de BD ya contempla todas, así que ninguna obliga a rediseñar.

## Fase 1 — MVP ✅ (este repositorio)
**Qué:** cuentas (registro/login, JWT + refresh rotativo en cookies httpOnly, CSRF), perfil básico, servidores, invitaciones, categorías y canales de texto/voz/anuncios con drag & drop, mensajes en tiempo real (enviar optimista, editar, borrar, responder, markdown seguro), "escribiendo…", presencia en línea/desconectado, lista de miembros virtualizada, métricas.
**Por qué primero:** es el camino crítico; todo lo demás cuelga de servidor → canal → mensaje, y fija las piezas transversales (permisos, caché, salas de socket).

## Fase 2 — Roles y permisos (1–2 semanas)
- CRUD de roles con jerarquía (`position`): nadie edita roles ≥ su rol más alto.
- Overrides por canal (`permission_overwrites`) y editor de permisos en la UI.
- Invalidación de caché: al cambiar un rol → borrar `perm:base:<server>:*` (Redis `SCAN` + `UNLINK`, o versión por servidor en la clave).
- Filtrar `CHANNEL_ACTIVITY` por permisos (hoy cualquier miembro recibe el id de canales privados, sin contenido).
- 2FA TOTP (`otplib`, secreto cifrado con AES-GCM) + códigos de respaldo.
- Rate limit con storage Redis (`@nest-lab/throttler-storage-redis`) para varias instancias.

## Fase 3 — DMs, notificaciones y archivos (2–3 semanas)
- DMs y grupos (`channels.type = DM | GROUP_DM` + `dm_participants`), amigos y bloqueos.
- No leídos persistentes: `read_states` + `channels.last_message_id`; `POST /channels/:id/ack` con *debounce*; contadores por canal y servidor.
- Menciones `@usuario`, `@rol`, `@everyone` (parseo en servidor, `message_*_mentions`, `mention_count`).
- Web Push ✅ (3c): VAPID con `web-push` 3.x, solo a quien no tiene sockets activos, respeta silencios; `POST|DELETE /users/me/push-subscriptions`.
- Archivos ✅ (3b): `POST /channels/:id/attachments` → URLs firmadas → PUT directo a R2 (Content-Type y Content-Length firmados) → `POST /messages` con `uploadId` (vale de un solo uso, verificado con HEAD). Imágenes medidas y pasadas a WebP en el navegador.
- Reacciones ✅ (3b): `PUT|DELETE /channels/:id/messages/:mid/reactions/:emoji/@me`; emojis personalizados `servers/:id/emojis` (imagen en `emojis/<id>` del CDN).
- Reacciones y emojis personalizados; picker de emojis con `import()` perezoso.
- Previews de enlaces ✅ (3c): unfurl en segundo plano (evento `MESSAGE_EMBEDS_UPDATE`), `safe-fetch` con IP validada en el `lookup` del socket, caché 6 h.
- Resaltado de código perezoso (`shiki` con `import()` solo si hay bloques).
- **PWA ✅ (3c):** service worker propio en `public/sw.js` (sin `vite-plugin-pwa`: ~3 KB) + caché en IndexedDB por usuario (últimos 50 mensajes de 30 canales) usada como `placeholderData`.

## Fase 4 — Voz y vídeo (1–2 semanas)
- `POST /voice/:channelId/token`: el backend firma un `AccessToken` de LiveKit con permisos derivados del bitfield (`CONNECT` → join, `SPEAK` → publish audio, `STREAM` → pantalla).
- Cliente: `@livekit/components-react` cargado con `import()` solo al entrar a voz (~0 KB en el bundle inicial).
- Mute/deafen, indicador de quién habla (`ActiveSpeakers`), volumen por usuario (`RemoteAudioTrack.setVolume`), compartir pantalla, `adaptiveStream` + `dynacast` para conexiones lentas.
- Estado de voz en la sala `srv:` vía webhooks de LiveKit (`participant_joined/left`).

## Fase 5 — Moderación, bots y búsqueda (2–3 semanas)
- Kick, ban (con borrado de mensajes recientes), timeout (`members.timeout_until`), slowmode (`channels.slowmode_seconds` + clave Redis por usuario/canal), filtro de palabras, `audit_logs` en cada acción administrativa.
- Búsqueda: columna `tsvector` generada + índice GIN (ver docs/02), filtros por autor, canal y fechas.
- Bots: `applications` con token (hash), autenticación `Bearer`, mismos permisos que un miembro; webhooks entrantes `POST /webhooks/:id/:token`.
- Archivado de mensajes > 12 meses (cron de Railway/Render).

## Fase 6 — Personalización y pulido
- Temas claro/oscuro/custom, color de acento y tamaño de fuente (ya son variables CSS: `user_settings` + `PATCH /users/me/settings`).
- Avatar y banner (reutiliza la subida por URL firmada), "sobre mí", estado personalizado.
- Accesibilidad, atajos de teclado, i18n.
