import { z } from 'zod';

/** Esquemas compartidos: validan formularios en el cliente y bodies/queries en la API. */

const uuid = z.string().uuid();
const username = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Solo letras, números, "_" y "."');
const messageContent = z.string().trim().min(1, 'Mensaje vacío').max(4000);

export const IdParam = uuid;

export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  username,
  password: z.string().min(8, 'Mínimo 8 caracteres').max(128),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** Código TOTP (6 dígitos) o de respaldo ("abcde-fghij"); espacios y guiones se ignoran. */
const secondFactor = z.string().trim().min(6).max(24);

export const LoginTwoFactorInput = z.object({ ticket: z.string().min(10).max(2048), code: secondFactor });
export type LoginTwoFactorInput = z.infer<typeof LoginTwoFactorInput>;

export const PasswordInput = z.object({ password: z.string().min(1).max(128) });
export type PasswordInput = z.infer<typeof PasswordInput>;

export const CodeInput = z.object({ code: secondFactor });
export type CodeInput = z.infer<typeof CodeInput>;

export const DisableTwoFactorInput = z.object({ password: z.string().min(1).max(128), code: secondFactor });
export type DisableTwoFactorInput = z.infer<typeof DisableTwoFactorInput>;

export const UserStatusSchema = z.enum(['ONLINE', 'IDLE', 'DND', 'INVISIBLE']);

export const UpdateProfileInput = z.object({
  displayName: z.string().trim().min(1).max(32).nullable().optional(),
  bio: z.string().max(190).nullable().optional(),
  customStatus: z.string().max(128).nullable().optional(),
  status: UserStatusSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

export const CreateServerInput = z.object({
  name: z.string().trim().min(2).max(100),
});
export type CreateServerInput = z.infer<typeof CreateServerInput>;

export const ServerChannelTypeSchema = z.enum(['TEXT', 'VOICE', 'ANNOUNCEMENT', 'CATEGORY']);

export const CreateChannelInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: ServerChannelTypeSchema.default('TEXT'),
  parentId: uuid.nullable().optional(),
  topic: z.string().max(1024).optional(),
});
export type CreateChannelInput = z.infer<typeof CreateChannelInput>;

export const UpdateChannelInput = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    topic: z.string().max(1024).nullable().optional(),
    slowmodeSeconds: z.number().int().min(0).max(21600).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateChannelInput = z.infer<typeof UpdateChannelInput>;

export const ReorderChannelsInput = z
  .array(
    z.object({
      id: uuid,
      position: z.number().int().min(0),
      parentId: uuid.nullable().optional(),
    }),
  )
  .min(1)
  .max(500);
export type ReorderChannelsInput = z.infer<typeof ReorderChannelsInput>;

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_EMOJI_BYTES = 256 * 1024;
export const MAX_EMOJIS_PER_SERVER = 50;
export const EMOJI_TYPES = ['image/png', 'image/gif', 'image/webp'] as const;

export const CreateMessageInput = z
  .object({
    content: z.string().trim().max(4000).default(''),
    replyToId: uuid.optional(),
    /** Id temporal del cliente para reconciliar el mensaje optimista. */
    nonce: z.string().max(64).optional(),
    /** Archivos ya subidos a R2 con /attachments (uploadId) + dimensiones medidas en el cliente. */
    attachments: z
      .array(
        z.object({
          uploadId: uuid,
          width: z.number().int().min(1).max(16384).optional(),
          height: z.number().int().min(1).max(16384).optional(),
        }),
      )
      .max(MAX_ATTACHMENTS)
      .default([]),
  })
  .refine((m) => m.content.length > 0 || m.attachments.length > 0, { message: 'Mensaje vacío', path: ['content'] });
export type CreateMessageInput = z.infer<typeof CreateMessageInput>;

export const UpdateMessageInput = z.object({ content: messageContent });
export type UpdateMessageInput = z.infer<typeof UpdateMessageInput>;

export const MessageQuery = z
  .object({
    before: uuid.optional(),
    after: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => !(q.before && q.after), 'Usa before o after, no ambos');
export type MessageQuery = z.infer<typeof MessageQuery>;

export const PageQuery = z.object({
  after: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const CreateInviteInput = z.object({
  maxUses: z.number().int().min(0).max(1000).optional(), // 0 / ausente = ilimitado
  maxAgeSeconds: z.number().int().min(0).max(7 * 86400).default(86400), // 0 = nunca expira
});
export type CreateInviteInput = z.infer<typeof CreateInviteInput>;

// ───────── Fase 2: roles y permisos ─────────

/** Bitfield serializado como string decimal (BigInt no viaja en JSON). */
const permissionString = z.string().regex(/^\d{1,20}$/, 'Permisos inválidos');
const color = z.number().int().min(0).max(0xffffff);

export const CreateRoleInput = z.object({
  name: z.string().trim().min(1).max(100).default('nuevo rol'),
  color: color.default(0),
  permissions: permissionString.default('0'),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
});
export type CreateRoleInput = z.infer<typeof CreateRoleInput>;

export const UpdateRoleInput = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    color: color.optional(),
    permissions: permissionString.optional(),
    hoist: z.boolean().optional(),
    mentionable: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateRoleInput = z.infer<typeof UpdateRoleInput>;

/** Ids de rol de MAYOR a MENOR posición, sin @everyone. */
export const ReorderRolesInput = z.array(uuid).min(1).max(250);
export type ReorderRolesInput = z.infer<typeof ReorderRolesInput>;

export const OverwriteInput = z.object({
  type: z.enum(['ROLE', 'MEMBER']),
  allow: permissionString,
  deny: permissionString,
});
export type OverwriteInput = z.infer<typeof OverwriteInput>;

// ───────── Fase 3a: DMs, no leídos, silenciar ─────────

export const CreateDmInput = z.object({
  /** 1 destinatario = DM; 2..9 = grupo privado (máx. 10 personas contándote). */
  recipientIds: z.array(uuid).min(1).max(9),
  name: z.string().trim().min(1).max(100).optional(),
});
export type CreateDmInput = z.infer<typeof CreateDmInput>;

export const AckInput = z.object({ messageId: uuid });
export type AckInput = z.infer<typeof AckInput>;

export const NotificationSettingInput = z
  .object({
    muted: z.boolean().optional(),
    level: z.enum(['ALL', 'MENTIONS', 'NONE']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type NotificationSettingInput = z.infer<typeof NotificationSettingInput>;

/** Sintaxis de menciones en el contenido almacenado. */
export const MENTION_USER_RE = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/g;
export const MENTION_ROLE_RE = /<@&([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/g;
export const MENTION_EVERYONE_RE = /(^|[^\w<])@everyone(?!\w)/;

// Gateway
export const ChannelSubscribeInput = z.object({ channelId: uuid });

// ───────── Fase 3b: archivos, reacciones, emojis ─────────

export const RequestUploadsInput = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(255),
        size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES, 'Máximo 25 MB por archivo'),
        contentType: z.string().trim().max(127).default('application/octet-stream'),
      }),
    )
    .min(1)
    .max(MAX_ATTACHMENTS),
});
export type RequestUploadsInput = z.infer<typeof RequestUploadsInput>;

export const EmojiUploadInput = z.object({
  contentType: z.enum(EMOJI_TYPES),
  size: z.number().int().min(1).max(MAX_EMOJI_BYTES, 'Máximo 256 KB'),
});
export type EmojiUploadInput = z.infer<typeof EmojiUploadInput>;

const emojiName = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{2,32}$/, '2-32 caracteres: letras, números y "_"');
export const CreateEmojiInput = z.object({ name: emojiName, uploadId: uuid });
export type CreateEmojiInput = z.infer<typeof CreateEmojiInput>;
export const UpdateEmojiInput = z.object({ name: emojiName });
export type UpdateEmojiInput = z.infer<typeof UpdateEmojiInput>;

/** Emoji Unicode (secuencia pictográfica corta) o personalizado "c:<uuid>". */
export const ReactionEmoji = z
  .string()
  .max(64)
  .refine(
    (e) =>
      /^c:[0-9a-f-]{36}$/.test(e) ||
      (e.length <= 32 &&
        /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Component}\u{FE0F}\u{200D}\u{20E3}]+$/u.test(e) &&
        /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{20E3}/u.test(e)),
    'Emoji no válido',
  );

/** Emoji personalizado en el texto: <:nombre:id> (o <a:nombre:id> animado). */
export const CUSTOM_EMOJI_RE = /<(a?):(\w{2,32}):([0-9a-f-]{36})>/g;
