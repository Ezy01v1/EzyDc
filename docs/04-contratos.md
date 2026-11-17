# 4. Contrato REST y WebSocket

Los tipos exactos están en [`packages/shared/src`](../packages/shared/src). Todas las rutas cuelgan de `/api`.

## Convenciones

- Autenticación: cookie `access_token` (httpOnly, 15 min) **o** `Authorization: Bearer <token>` (bots, fase 5).
- Mutaciones con cookie: cabecera `x-csrf-token` = cookie `csrf_token`.
- Errores: `{ statusCode, message, issues? }`. `404` también cuando no tienes `VIEW_CHANNEL` (no se revela que existe).
- IDs UUIDv7; paginación por cursor (`before`/`after`), nunca `offset`.
- Permisos en JSON como **string** decimal (BigInt).

## REST — Fase 1

| Método | Ruta | Body / Query | Respuesta | Permiso |
|---|---|---|---|---|
| POST | `/auth/register` | `RegisterInput` | `AuthResponse` + cookies | público · 10/min |
| POST | `/auth/login` | `LoginInput` | `AuthResponse` + cookies | público · 10/min |
| POST | `/auth/refresh` | cookie `refresh_token` | `{ ok }` + cookies rotadas | público |
| POST | `/auth/logout` | — | 204 | público |
| GET | `/auth/me` | — | `UserSelf` | sesión |
| GET | `/auth/socket-token` | — | `{ token }` (JWT 60 s, aud `ws`) | sesión |
| GET / PATCH | `/users/me` | `UpdateProfileInput` | `UserSelf` | sesión |
| GET | `/users/:id` | — | perfil público | sesión |
| GET | `/servers` | — | `ServerSummary[]` | sesión |
| POST | `/servers` | `CreateServerInput` | `ServerSummary` | 10/hora |
| GET | `/servers/:id` | — | `ServerDetail` (solo canales visibles + permisos) | miembro |
| DELETE | `/servers/:id` | — | 204 | dueño |
| GET | `/servers/:id/members` | `?after&limit` | `Page<MemberDto>` | miembro |
| DELETE | `/servers/:id/members/@me` | — | 204 | miembro (no dueño) |
| POST | `/servers/:id/invites` | `CreateInviteInput` | `InviteDto` | `CREATE_INVITE` |
| GET | `/invites/:code` | — | `InvitePreview` | sesión |
| POST | `/invites/:code` | — | `ServerSummary` | sesión, no baneado |
| POST | `/servers/:id/channels` | `CreateChannelInput` | `ChannelDto` | `MANAGE_CHANNELS` |
| PATCH | `/servers/:id/channels/positions` | `ReorderChannelsInput` | 204 | `MANAGE_CHANNELS` |
| PATCH | `/channels/:id` | `UpdateChannelInput` | `ChannelDto` | `MANAGE_CHANNELS` |
| DELETE | `/channels/:id` | — | 204 | `MANAGE_CHANNELS` |
| GET | `/channels/:id/messages` | `?before\|after&limit≤100` | `MessageDto[]` (ascendente) | `VIEW_CHANNEL`+`READ_MESSAGE_HISTORY` |
| POST | `/channels/:id/messages` | `CreateMessageInput` | `MessageDto` | `SEND_MESSAGES` · 10/5 s |
| PATCH | `/channels/:id/messages/:mid` | `UpdateMessageInput` | `MessageDto` | autor |
| DELETE | `/channels/:id/messages/:mid` | — | 204 | autor o `MANAGE_MESSAGES` |
| GET | `/health` | — | `{ ok, db }` | público |
| GET | `/metrics` | cabecera `x-metrics-token` | latencias, memoria, sockets | token |

## REST — fases siguientes (planificado)

| Fase | Rutas |
|---|---|
| 2 Roles ✅ | `POST/PATCH/DELETE /servers/:id/roles`, `PATCH /servers/:id/roles/positions`, `PUT/DELETE /servers/:id/members/:uid/roles/:rid`, `GET` y `PUT/DELETE /channels/:id/overwrites/:targetId` (requieren `MANAGE_ROLES`, jerarquía y no conceder bits que no tienes) |
| 2b 2FA ✅ | `POST /auth/2fa/setup` (`{password}` → secreto + QR SVG), `POST /auth/2fa/enable` (`{code}` → 10 códigos de respaldo), `POST /auth/2fa/disable` (`{password, code}`), `POST /auth/2fa/backup-codes` (`{code}`), `POST /auth/login/2fa` (`{ticket, code}`). Con 2FA, `POST /auth/login` responde `{ mfaRequired: true, ticket }` sin crear sesión. |
| 3 DMs | `GET /users/me/channels`, `POST /users/me/channels` (`{ recipientIds }`), `PUT/DELETE /channels/:id/recipients/:uid`, `/users/me/relationships` |
| 3 Notificaciones | `POST /channels/:id/ack` (`{ messageId }`), `GET /users/me/read-states`, `PUT /users/me/notification-settings/:targetId`, `POST /push/subscribe` |
| 3 Archivos | `POST /files/presign` (`{ filename, contentType, size }` → `{ uploadUrl, fileUrl }`), reacciones `PUT/DELETE /channels/:id/messages/:mid/reactions/:emoji`, `/servers/:id/emojis`, `GET /unfurl?url=` |
| 4 Voz | `POST /voice/:channelId/token` → `{ url, token }` (LiveKit, firmado con `CONNECT`/`SPEAK`/`STREAM`) |
| 5 Moderación | `PUT/DELETE /servers/:id/bans/:uid`, `DELETE /servers/:id/members/:uid` (kick), `PATCH …/members/:uid` (`timeoutUntil`), `GET /servers/:id/audit-log`, `/servers/:id/word-filters` |
| 5 Búsqueda | `GET /servers/:id/messages/search?q&authorId&channelId&before&after` |
| 5 Bots | `POST /applications`, `POST /applications/:id/reset-token`, `POST /webhooks/:id/:token` (entrante, sin sesión) |

## WebSocket (Socket.IO)

Conexión: `io(WS_URL, { transports: ['websocket'], auth: { token } })` con el token de `/auth/socket-token`.

### Salas

| Sala | Quién entra | Qué recibe |
|---|---|---|
| `user:<id>` | todas las conexiones del usuario | eventos personales (DMs, menciones — fase 3) |
| `srv:<id>` | al conectar, uno por servidor | eventos **ligeros**: actividad, canales, miembros, presencia |
| `ch:<id>` | solo el canal visible (`channel:subscribe`) | mensajes completos y "escribiendo…" |

### Cliente → servidor

| Evento | Payload | Ack |
|---|---|---|
| `channel:subscribe` | `{ channelId }` | `{ ok }` (comprueba `VIEW_CHANNEL`, sale del canal anterior) |
| `channel:unsubscribe` | `{ channelId }` | — |
| `typing:start` | `{ channelId }` | — (máx. 1 cada 3 s) |
| `sys:ping` | — | `{ t }` (latencia) |

### Servidor → cliente

| Evento | Sala | Payload |
|---|---|---|
| `MESSAGE_CREATE` | `ch:` | `MessageDto` (con `nonce` para reconciliar el envío optimista) |
| `MESSAGE_UPDATE` | `ch:` | `{ id, channelId, content, editedAt }` |
| `MESSAGE_DELETE` | `ch:` | `{ id, channelId }` |
| `CHANNEL_ACTIVITY` | `srv:` | `{ serverId, channelId, messageId, authorId }` (~150 B, para no leídos) |
| `CHANNEL_CREATE` / `CHANNEL_UPDATE` | `srv:` | `ChannelDto` |
| `CHANNEL_DELETE` | `srv:` | `{ id, serverId }` |
| `CHANNELS_REORDER` | `srv:` | `{ serverId, positions[] }` |
| `SERVER_DELETE` | `srv:` | `{ id }` |
| `MEMBER_ADD` / `MEMBER_REMOVE` | `srv:` | `{ serverId, member }` / `{ serverId, userId }` |
| `TYPING_START` | `ch:` | `{ channelId, userId, username }` |
| `PRESENCE_UPDATE` | `srv:` | `{ userId, status }` |
| `ROLES_UPDATE` | `srv:` | `{ serverId }` — roles u overrides cambiaron: recargar detalle (sin filtrar datos de canales privados) |
| `MEMBER_UPDATE` | `srv:` | `{ serverId, userId, roleIds }` |

`CHANNEL_ACTIVITY`, `CHANNEL_UPDATE` y `CHANNEL_DELETE` solo se envían a los sockets que pueden ver el canal (difusión directa si el canal es público).

### Reconexión y sincronización incremental

1. Socket.IO reintenta con backoff exponencial + jitter (1 s → 15 s) y pide un token nuevo en cada intento.
2. Al reconectar, el cliente vuelve a suscribirse al canal visible y pide `GET /channels/:id/messages?after=<último id>`: solo lo que se perdió.
3. Los demás canales cacheados se descartan y se recargan al abrirlos (más barato que sincronizarlos todos).
