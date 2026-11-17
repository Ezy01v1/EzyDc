import { Injectable } from '@nestjs/common';
import { hasPermission, MENTION_EVERYONE_RE, MENTION_ROLE_RE, MENTION_USER_RE, Permission } from '@ezydc/shared';
import { type ChannelMeta, PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';

const MAX_USER_MENTIONS = 50;
const MAX_ROLE_MENTIONS = 20;

export interface ResolvedMentions {
  /** Usuarios mencionados explícitamente y válidos (se guardan en message_user_mentions). */
  userIds: string[];
  roleIds: string[];
  everyone: boolean;
  /** A quién hay que sumar +1 y avisar (sin el autor y solo quien puede ver el canal). */
  notify: string[];
}

const unique = (re: RegExp, s: string, max: number) => [...new Set([...s.matchAll(re)].map((m) => m[1]!))].slice(0, max);

/**
 * Resuelve y VALIDA las menciones en el servidor:
 *  - @usuario: debe ser miembro del servidor (o participante del DM).
 *  - @rol: el rol debe ser mencionable, o el autor tener MENTION_EVERYONE.
 *  - @everyone: solo con MENTION_EVERYONE; si no, queda como texto.
 *  - En DMs, todo mensaje notifica al resto de participantes.
 */
@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
  ) {}

  async resolve(
    meta: ChannelMeta,
    authorId: string,
    authorPerms: bigint,
    content: string,
    replyAuthorId?: string | null,
  ): Promise<ResolvedMentions> {
    const wantedUsers = unique(MENTION_USER_RE, content, MAX_USER_MENTIONS);

    if (!meta.serverId) {
      const participants = (
        await this.prisma.dmParticipant.findMany({ where: { channelId: meta.id }, select: { userId: true } })
      ).map((p) => p.userId);
      return {
        userIds: wantedUsers.filter((u) => participants.includes(u)),
        roleIds: [],
        everyone: false,
        notify: participants.filter((u) => u !== authorId),
      };
    }

    const serverId = meta.serverId;
    const canEveryone = hasPermission(authorPerms, Permission.MENTION_EVERYONE);
    const [members, roles] = await Promise.all([
      wantedUsers.length
        ? this.prisma.member.findMany({ where: { serverId, userId: { in: wantedUsers } }, select: { userId: true } })
        : [],
      this.prisma.role.findMany({
        where: { serverId, id: { in: unique(MENTION_ROLE_RE, content, MAX_ROLE_MENTIONS), not: serverId } },
        select: { id: true, mentionable: true },
      }),
    ]);
    const userIds = members.map((m) => m.userId);
    const roleIds = roles.filter((r) => r.mentionable || canEveryone).map((r) => r.id);
    const everyone = canEveryone && MENTION_EVERYONE_RE.test(content);

    const targets = new Set(userIds);
    if (replyAuthorId) targets.add(replyAuthorId); // responder "menciona" al autor original
    if (everyone) {
      for (const m of await this.prisma.member.findMany({ where: { serverId }, select: { userId: true } })) targets.add(m.userId);
    } else if (roleIds.length) {
      for (const m of await this.prisma.memberRole.findMany({ where: { serverId, roleId: { in: roleIds } }, select: { userId: true } })) {
        targets.add(m.userId);
      }
    }
    targets.delete(authorId);

    let notify = [...targets];
    if (notify.length && !(await this.perms.isPublic(meta))) {
      // Canal privado: solo notificamos a quien puede verlo (permisos cacheados).
      const visible = await Promise.all(
        notify.map(async (u) => hasPermission((await this.perms.channelPermissions(meta.id, u)).perms, Permission.VIEW_CHANNEL)),
      );
      notify = notify.filter((_, i) => visible[i]);
    }
    return { userIds, roleIds, everyone, notify };
  }
}
