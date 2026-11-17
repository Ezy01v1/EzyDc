import {
  hasPermission,
  Permission,
  PERMISSION_GROUPS,
  type RoleDto,
  type ServerDetail,
} from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { qk } from '../../../lib/queryClient';
import { byPositionDesc, canEditRole, fromHex, hex, myTopPosition } from '../../../lib/roles';
import { useAuth } from '../../../stores/auth';
import { Toggle } from './SettingsShell';

export function RolesTab({ server }: { server: ServerDetail }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user?.id);
  const roles = useMemo(() => [...server.roles].sort(byPositionDesc), [server.roles]);
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? server.id);
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const top = myTopPosition(server, me);
  const myPerms = BigInt(server.myPermissions);
  const isOwner = server.ownerId === me;
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const refresh = () => qc.invalidateQueries({ queryKey: qk.server(server.id) });

  async function createRole() {
    setError(null);
    try {
      const role = await api<RoleDto>(`/servers/${server.id}/roles`, { method: 'POST', body: { name: 'nuevo rol' } });
      await refresh();
      setSelectedId(role.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  /** Drag & drop: soltar sobre otro rol lo coloca en su lugar. Envía el orden completo. */
  async function onDrop(target: RoleDto) {
    const dragged = roles.find((r) => r.id === dragId);
    setDragId(null);
    if (!dragged || dragged.id === target.id || target.id === server.id) return;
    const order = roles.filter((r) => r.id !== server.id && r.id !== dragged.id);
    order.splice(order.indexOf(target), 0, dragged);
    setError(null);
    // Optimista
    qc.setQueryData<ServerDetail>(qk.server(server.id), (d) =>
      d ? { ...d, roles: d.roles.map((r) => (r.id === server.id ? r : { ...r, position: order.length - order.findIndex((o) => o.id === r.id) })) } : d,
    );
    try {
      await api(`/servers/${server.id}/roles/positions`, { method: 'PATCH', body: order.map((r) => r.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      void refresh();
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Roles</h1>
          <p className="text-sm text-fg-muted">Arrastra para cambiar la jerarquía. Los roles más altos mandan sobre los de abajo.</p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => void createRole()}>
          Crear rol
        </button>
      </div>
      {error && <p className="mb-4 rounded bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-6 md:flex-row">
        <ul className="flex shrink-0 flex-col gap-0.5 md:w-52" aria-label="Lista de roles">
          {roles.map((r) => {
            const movable = r.id !== server.id && canEditRole(r, server, top);
            return (
              <li
                key={r.id}
                draggable={movable}
                onDragStart={() => setDragId(r.id)}
                onDragOver={(e) => dragId && r.id !== server.id && e.preventDefault()}
                onDrop={() => void onDrop(r)}
                className={dragId === r.id ? 'opacity-40' : ''}
              >
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    selected?.id === r.id ? 'bg-surface-3' : 'hover:bg-surface-3/60'
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color ? hex(r.color) : 'var(--fg-subtle)' }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  {!canEditRole(r, server, top) && <span title="Por encima de tu rol">🔒</span>}
                  {movable && <span className="cursor-grab text-fg-subtle" aria-hidden>⋮⋮</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {selected && (
          <RoleEditor
            key={selected.id}
            role={selected}
            server={server}
            editable={canEditRole(selected, server, top)}
            canGrant={(bit) => isOwner || hasPermission(myPerms, bit)}
            onSaved={refresh}
            onDeleted={() => {
              setSelectedId(server.id);
              void refresh();
            }}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}

function RoleEditor({
  role,
  server,
  editable,
  canGrant,
  onSaved,
  onDeleted,
  onError,
}: {
  role: RoleDto;
  server: ServerDetail;
  editable: boolean;
  canGrant: (bit: bigint) => boolean;
  onSaved: () => Promise<unknown>;
  onDeleted: () => void;
  onError: (msg: string | null) => void;
}) {
  const isEveryone = role.id === server.id;
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [hoist, setHoist] = useState(role.hoist);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [perms, setPerms] = useState(BigInt(role.permissions));
  const [saving, setSaving] = useState(false);

  // Si otro admin cambia el rol mientras lo miras, se recarga el formulario.
  useEffect(() => setPerms(BigInt(role.permissions)), [role.permissions]);

  const dirty =
    name !== role.name || color !== role.color || hoist !== role.hoist || mentionable !== role.mentionable || perms.toString() !== role.permissions;

  async function save() {
    setSaving(true);
    onError(null);
    try {
      await api(`/servers/${server.id}/roles/${role.id}`, {
        method: 'PATCH',
        body: isEveryone ? { permissions: perms.toString() } : { name, color, hoist, mentionable, permissions: perms.toString() },
      });
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`¿Borrar el rol "${role.name}"?`)) return;
    try {
      await api(`/servers/${server.id}/roles/${role.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error');
    }
  }

  const toggle = (bit: bigint, on: boolean) => setPerms((p) => (on ? p | bit : p & ~bit));

  return (
    <section className="min-w-0 flex-1">
      {!editable && (
        <p className="mb-4 rounded bg-warn/15 px-3 py-2 text-sm text-warn">Este rol está por encima o al nivel del tuyo: solo lectura.</p>
      )}
      {!isEveryone && (
        <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Nombre</span>
            <input className="input" value={name} maxLength={100} disabled={!editable} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Color</span>
            <input
              type="color"
              value={color ? hex(color) : '#99aab5'}
              disabled={!editable}
              onChange={(e) => setColor(fromHex(e.target.value))}
              className="h-9 w-16 cursor-pointer rounded bg-transparent"
            />
          </label>
          <Row label="Mostrar por separado" hint="Agrupa a sus miembros en la lista de miembros.">
            <Toggle checked={hoist} onChange={setHoist} disabled={!editable} />
          </Row>
          <Row label="Mencionable" hint="Cualquiera puede @mencionar este rol.">
            <Toggle checked={mentionable} onChange={setMentionable} disabled={!editable} />
          </Row>
        </div>
      )}
      {isEveryone && <p className="mb-6 text-sm text-fg-muted">Permisos por defecto de todos los miembros del servidor.</p>}

      {PERMISSION_GROUPS.map((g) => (
        <div key={g.title} className="mb-6">
          <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-subtle uppercase">{g.title}</h3>
          <div className="divide-y divide-surface-3">
            {g.items.map((it) => {
              const bit = Permission[it.key];
              const on = (perms & bit) === bit;
              // Puedes quitar cualquier permiso del rol, pero solo añadir los que tienes.
              const locked = !editable || (!on && !canGrant(bit));
              return (
                <Row key={it.key} label={it.label} hint={it.description} danger={it.key === 'ADMINISTRATOR'}>
                  <Toggle checked={on} onChange={(v) => toggle(bit, v)} disabled={locked} />
                </Row>
              );
            })}
          </div>
        </div>
      ))}

      {editable && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-surface-3 bg-surface-2 py-3">
          {!isEveryone ? (
            <button className="btn-ghost text-danger" onClick={() => void remove()}>
              Borrar rol
            </button>
          ) : (
            <span />
          )}
          <button className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </section>
  );
}

function Row({ label, hint, danger, children }: { label: string; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className={`text-sm font-medium ${danger ? 'text-danger' : ''}`}>{label}</div>
        {hint && <div className="text-xs text-fg-subtle">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
