import type { RoleDto, ServerDetail } from '@ezydc/shared';

export const byPositionDesc = (a: RoleDto, b: RoleDto) => b.position - a.position;

/** Posición del rol más alto del usuario (Infinity si es el dueño). Misma regla que la API. */
export function myTopPosition(server: ServerDetail, meId: string | undefined): number {
  if (server.ownerId === meId) return Infinity;
  return server.roles.filter((r) => server.myRoleIds.includes(r.id)).reduce((m, r) => Math.max(m, r.position), 0);
}

/** ¿Puedo editar este rol? @everyone siempre (con MANAGE_ROLES); el resto, solo si está por debajo. */
export function canEditRole(role: RoleDto, server: ServerDetail, top: number): boolean {
  return role.id === server.id || role.position < top;
}

export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
export const fromHex = (h: string) => Number.parseInt(h.slice(1), 16);

/** Color del nombre: el del rol con color más alto. */
export function memberColor(roleIds: string[], rolesDesc: RoleDto[]): string | undefined {
  const r = rolesDesc.find((x) => x.color !== 0 && roleIds.includes(x.id));
  return r ? hex(r.color) : undefined;
}

/** Rol "destacado" (hoist) más alto del miembro, para agrupar la lista de miembros. */
export function hoistedRole(roleIds: string[], rolesDesc: RoleDto[]): RoleDto | undefined {
  return rolesDesc.find((x) => x.hoist && roleIds.includes(x.id));
}
