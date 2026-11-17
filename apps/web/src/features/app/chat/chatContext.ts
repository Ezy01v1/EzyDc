import type { RoleDto, UserPublic } from '@ezydc/shared';
import { createContext, useContext } from 'react';

/** Contexto del chat: menciones (quién y cómo pintar roles) y permisos del canal. */
export interface ChatContext {
  serverId: string | null;
  roles: RoleDto[];
  myRoleIds: string[];
  /** Personas mencionables (miembros del servidor o participantes del DM). */
  people: UserPublic[];
  canMentionEveryone: boolean;
  canAttach: boolean;
  /** Crear reacciones nuevas (sumarse a una existente siempre se puede). */
  canReact: boolean;
}

export const ChatCtx = createContext<ChatContext>({
  serverId: null,
  roles: [],
  myRoleIds: [],
  people: [],
  canMentionEveryone: false,
  canAttach: false,
  canReact: false,
});
export const useChatContext = () => useContext(ChatCtx);
