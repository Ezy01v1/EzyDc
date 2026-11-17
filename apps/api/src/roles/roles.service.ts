import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  type CreateRoleInput,
  type OverwriteDto,
  type OverwriteInput,
  Permission,
  type ReorderRolesInput,
  type RoleDto,
  type UpdateRoleInput,
} from '@ezydc/shared';
import { toRoleDto } from '../common/mappers';
import { type MemberContext, PermissionsService } from '../core/permissions.service';
import { PrismaService } from '../core/prisma.service';
import { RealtimeService, room } from '../core/realtime.service';

/**
 * Reglas de jerarquía (como Discord):
 *  1. Solo se gestionan roles con posición ESTRICTAMENTE menor que tu rol más alto.
 *  2. Nunca puedes conceder (ni denegar en overrides) un permiso que tú no tienes.
 *  3. El dueño se salta ambas reglas. @everyone (posición 0) siempre es gestionable con MANAGE_ROLES.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly perms: PermissionsService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(serverId: string, actorId: string, input: CreateRoleInput): Promise<RoleDto> {
    const actor = await this.perms.assertServer(serverId, actorId, Permission.MANAGE_ROLES);
    const permissions = parsePerms(input.permissions);
    assertCanGrant(actor, 0n, permissions);

    // Los roles nuevos nacen justo encima de @everyone (posición 1), como en Discord.
    const role = await this.prisma.$transaction(async (tx) => {
      await tx.role.updateMany({
        where: { serverId, position: { gte: 1 } },
        data: { position: { increment: 1 } },
      });
      return tx.role.create({
        data: { serverId, name: input.name, color: input.color, permissions, hoist: input.hoist, mentionable: input.mentionable, position: 1 },
      });
    });
    await this.changed(serverId);
    return toRoleDto(role);
  }

  async update(serverId: string, roleId: string, actorId: string, input: UpdateRoleInput): Promise<RoleDto> {
    const actor = await this.perms.assertServer(serverId, actorId, Permission.MANAGE_ROLES);
    const role = await this.findRole(serverId, roleId);
    const isEveryone = role.id === serverId;
    if (!isEveryone) assertAbove(actor, role.position);

    let permissions: bigint | undefined;
    if (input.permissions !== undefined) {
      permissions = parsePerms(input.permissions);
      assertCanGrant(actor, role.permissions, permissions);
    }
    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        // @everyone no se renombra ni se destaca.
        ...(isEveryone ? {} : { name: input.name, color: input.color, hoist: input.hoist, mentionable: input.mentionable }),
        ...(permissions !== undefined ? { permissions } : {}),
      },
    });
    await this.changed(serverId);
    return toRoleDto(updated);
  }

  async remove(serverId: string, roleId: string, actorId: string): Promise<void> {
    const actor = await this.perms.assertServer(serverId, actorId, Permission.MANAGE_ROLES);
    const role = await this.findRole(serverId, roleId);
    if (role.id === serverId) throw new BadRequestException('@everyone no se puede borrar');
    assertAbove(actor, role.position);

    // Los overrides no tienen FK (targetId puede ser rol o usuario): se borran a mano.
    const affected = await this.prisma.permissionOverwrite.findMany({
      where: { targetId: roleId, channel: { serverId } },
      select: { channelId: true },
    });
    await this.prisma.$transaction([
      this.prisma.permissionOverwrite.deleteMany({ where: { targetId: roleId, channel: { serverId } } }),
      this.prisma.role.delete({ where: { id: roleId } }),
      this.prisma.role.updateMany({ where: { serverId, position: { gt: role.position } }, data: { position: { decrement: 1 } } }),
    ]);
    await Promise.all(affected.map((a) => this.perms.invalidateChannel(a.channelId)));
    await this.changed(serverId);
  }

  /** `ids` = todos los roles (sin @everyone) de MAYOR a MENOR posición. */
  async reorder(serverId: string, actorId: string, ids: ReorderRolesInput): Promise<void> {
    const actor = await this.perms.assertServer(serverId, actorId, Permission.MANAGE_ROLES);
    const roles = await this.prisma.role.findMany({
      where: { serverId, id: { not: serverId } },
      select: { id: true, position: true },
    });
    const current = new Map(roles.map((r) => [r.id, r.position]));
    if (ids.length !== roles.length || new Set(ids).size !== ids.length || ids.some((id) => !current.has(id))) {
      throw new BadRequestException('Debes enviar todos los roles exactamente una vez');
    }
    const changes = ids
      .map((id, i) => ({ id, from: current.get(id)!, to: ids.length - i }))
      .filter((c) => c.from !== c.to);
    for (const c of changes) {
      // Ni mover roles por encima de ti, ni subir uno hasta tu nivel.
      assertAbove(actor, c.from);
      assertAbove(actor, c.to);
    }
    if (changes.length === 0) return;
    await this.prisma.$transaction(changes.map((c) => this.prisma.role.update({ where: { id: c.id }, data: { position: c.to } })));
    await this.changed(serverId);
  }

  async setMemberRole(serverId: string, userId: string, roleId: string, actorId: string, add: boolean): Promise<string[]> {
    const actor = await this.perms.assertServer(serverId, actorId, Permission.MANAGE_ROLES);
    const role = await this.findRole(serverId, roleId);
    if (role.id === serverId) throw new BadRequestException('@everyone se asigna implícitamente');
    assertAbove(actor, role.position);
    const member = await this.prisma.member.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { userId: true } });
    if (!member) throw new NotFoundException('Miembro no encontrado');

    if (add) {
      await this.prisma.memberRole.upsert({
        where: { serverId_userId_roleId: { serverId, userId, roleId } },
        create: { serverId, userId, roleId },
        update: {},
      });
    } else {
      await this.prisma.memberRole.deleteMany({ where: { serverId, userId, roleId } });
    }
    const roleIds = (await this.prisma.memberRole.findMany({ where: { serverId, userId }, select: { roleId: true } })).map(
      (r) => r.roleId,
    );
    await this.perms.invalidateMember(serverId, userId);
    this.realtime.emit(room.server(serverId), 'MEMBER_UPDATE', { serverId, userId, roleIds });
    this.perms.revalidateSockets(serverId, userId);
    return roleIds;
  }

  // ───────── overrides de canal ─────────

  async listOverwrites(channelId: string, actorId: string): Promise<OverwriteDto[]> {
    const meta = await this.perms.assertChannel(channelId, actorId, Permission.MANAGE_ROLES);
    return meta.overwrites;
  }

  async putOverwrite(channelId: string, targetId: string, actorId: string, input: OverwriteInput): Promise<OverwriteDto> {
    const meta = await this.perms.assertChannel(channelId, actorId, Permission.MANAGE_ROLES);
    const serverId = meta.serverId;
    if (!serverId) throw new BadRequestException('Solo canales de servidor');

    if (input.type === 'ROLE') await this.findRole(serverId, targetId);
    else {
      const m = await this.prisma.member.findUnique({ where: { serverId_userId: { serverId, userId: targetId } } });
      if (!m) throw new NotFoundException('Miembro no encontrado');
    }

    const allow = parsePerms(input.allow);
    const deny = parsePerms(input.deny) & ~allow; // si un bit está en ambos, gana allow
    const prev = meta.overwrites.find((o) => o.targetId === targetId);
    const changed = (allow ^ BigInt(prev?.allow ?? '0')) | (deny ^ BigInt(prev?.deny ?? '0'));
    const { perms: actorPerms } = await this.perms.channelPermissions(channelId, actorId);
    const actor = await this.perms.getBase(serverId, actorId);
    if (!actor?.isOwner && (changed & ~actorPerms) !== 0n) {
      throw new ForbiddenException('No puedes modificar permisos que no tienes en este canal');
    }

    await this.prisma.permissionOverwrite.upsert({
      where: { channelId_targetId: { channelId, targetId } },
      create: { channelId, targetId, type: input.type, allow, deny },
      update: { type: input.type, allow, deny },
    });
    await this.channelChanged(channelId, serverId);
    return { targetId, type: input.type, allow: allow.toString(), deny: deny.toString() };
  }

  async deleteOverwrite(channelId: string, targetId: string, actorId: string): Promise<void> {
    const meta = await this.perms.assertChannel(channelId, actorId, Permission.MANAGE_ROLES);
    if (!meta.serverId) throw new BadRequestException('Solo canales de servidor');
    await this.prisma.permissionOverwrite.deleteMany({ where: { channelId, targetId } });
    await this.channelChanged(channelId, meta.serverId);
  }

  // ───────── helpers ─────────

  private async findRole(serverId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, serverId } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
  }

  private async changed(serverId: string): Promise<void> {
    await this.perms.invalidateServer(serverId);
    this.realtime.emit(room.server(serverId), 'ROLES_UPDATE', { serverId });
    this.perms.revalidateSockets(serverId);
  }

  private async channelChanged(channelId: string, serverId: string): Promise<void> {
    await this.perms.invalidateChannel(channelId);
    // Aviso SIN datos del canal: quien gane o pierda acceso recarga su lista,
    // y quien no puede verlo no se entera de su nombre.
    this.realtime.emit(room.server(serverId), 'ROLES_UPDATE', { serverId });
    this.perms.revalidateSockets(serverId);
  }
}

function parsePerms(s: string): bigint {
  const v = BigInt(s);
  if ((v & ~ALL_PERMISSIONS) !== 0n) throw new BadRequestException('Bits de permiso desconocidos');
  return v;
}

function assertAbove(actor: MemberContext, position: number): void {
  if (!actor.isOwner && position >= actor.top) {
    throw new ForbiddenException('Ese rol está por encima o al nivel de tu rol más alto');
  }
}

/** Solo puedes AÑADIR bits que tú tienes (quitar siempre se permite si gestionas el rol). */
function assertCanGrant(actor: MemberContext, before: bigint, after: bigint): void {
  const added = after & ~before;
  if (!actor.isOwner && (added & ~actor.perms) !== 0n) {
    throw new ForbiddenException('No puedes conceder permisos que no tienes');
  }
}
