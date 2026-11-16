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

export const CreateMessageInput = z.object({
  content: messageContent,
  replyToId: uuid.optional(),
  /** Id temporal del cliente para reconciliar el mensaje optimista. */
  nonce: z.string().max(64).optional(),
});
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

// Gateway
export const ChannelSubscribeInput = z.object({ channelId: uuid });
