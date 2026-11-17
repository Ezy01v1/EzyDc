import type { RoleDto, UserPublic } from '@ezydc/shared';
import { createContext, useContext } from 'react';

/** Contexto para menciones: quién se puede mencionar y cómo pintar roles. */
export interface ChatContext {
  serverId: string | null;
  roles: RoleDto[];
  myRoleIds: string[];
  /** Personas mencionables (miembros del servidor o participantes del DM). */
  people: UserPublic[];
  canMentionEveryone: boolean;
}

export const ChatCtx = createContext<ChatContext>({ serverId: null, roles: [], myRoleIds: [], people: [], canMentionEveryone: false });
export const useChatContext = () => useContext(ChatCtx);
