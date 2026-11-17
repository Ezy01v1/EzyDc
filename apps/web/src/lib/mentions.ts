import type { MessageDto, RoleDto, UserPublic } from '@ezydc/shared';

/**
 * En el editor el usuario ve "@ana" / "@Moderadores"; en el mensaje guardado viaja
 * "<@id>" / "<@&id>" (estable aunque cambien los nombres). Estas funciones traducen.
 */
export interface MentionCandidate {
  /** Texto visible sin la arroba: "ana", "Moderadores". */
  text: string;
  token: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "@ana hola @Moderadores" → "<@id> hola <@&id>" (los nombres largos primero). */
export function encodeMentions(text: string, candidates: MentionCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => b.text.length - a.text.length);
  let out = text;
  for (const c of sorted) {
    out = out.replace(new RegExp(`(^|[^\\w@<])@${escape(c.text)}(?![\\w.])`, 'g'), `$1${c.token}`);
  }
  return out;
}

/** Inverso, para editar un mensaje existente. */
export function decodeMentions(content: string, users: UserPublic[], roles: RoleDto[]): string {
  return content
    .replace(/<@&([0-9a-f-]{36})>/g, (m, id: string) => {
      const r = roles.find((x) => x.id === id);
      return r ? `@${r.name}` : m;
    })
    .replace(/<@([0-9a-f-]{36})>/g, (m, id: string) => {
      const u = users.find((x) => x.id === id);
      return u ? `@${u.username}` : m;
    });
}

export function userCandidates(users: UserPublic[]): MentionCandidate[] {
  return users.map((u) => ({ text: u.username, token: `<@${u.id}>` }));
}

export function roleCandidates(roles: RoleDto[]): MentionCandidate[] {
  return roles.map((r) => ({ text: r.name, token: `<@&${r.id}>` }));
}

/** ¿Este mensaje me menciona? (directo, por rol o @everyone). */
export function mentionsMe(m: MessageDto, meId: string | undefined, myRoleIds: string[]): boolean {
  if (!meId || m.author?.id === meId) return false;
  return m.mentionEveryone || m.mentions.some((u) => u.id === meId) || m.mentionRoleIds.some((r) => myRoleIds.includes(r));
}
