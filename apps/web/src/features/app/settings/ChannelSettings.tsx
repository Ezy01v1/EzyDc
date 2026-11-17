import {
  type ChannelDto,
  hasPermission,
  type MemberDto,
  type OverwriteDto,
  type Page,
  Permission,
  PERMISSION_GROUPS,
  type ServerDetail,
} from '@ezydc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../../lib/api';
import { displayName } from '../../../lib/format';
import { qk } from '../../../lib/queryClient';
import { byPositionDesc, hex } from '../../../lib/roles';
import { useAuth } from '../../../stores/auth';
import { SettingsShell } from './SettingsShell';

type TabId = 'general' | 'permissions';

export default function ChannelSettings({
  server,
  channel,
  onClose,
}: {
  server: ServerDetail;
  channel: ChannelDto;
  onClose: () => void;
}) {
  const perms = BigInt(server.channelPermissions[channel.id] ?? '0');
  const canManageChannel = hasPermission(perms, Permission.MANAGE_CHANNELS);
  const canManageRoles = hasPermission(perms, Permission.MANAGE_ROLES);
  const tabs = [
    ...(canManageChannel ? [{ id: 'general' as const, label: 'General' }] : []),
    ...(canManageRoles ? [{ id: 'permissions' as const, label: 'Permisos' }] : []),
  ];
  const [tab, setTab] = useState<TabId>(tabs[0]?.id ?? 'general');

  return (
    <SettingsShell title={`# ${channel.name ?? ''}`} tabs={tabs} active={tab} onTab={setTab} onClose={onClose}>
      {tab === 'general' ? (
        <GeneralTab server={server} channel={channel} onClose={onClose} />
      ) : (
        <PermissionsTab server={server} channel={channel} />
      )}
    </SettingsShell>
  );
}

function GeneralTab({ server, channel, onClose }: { server: ServerDetail; channel: ChannelDto; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(channel.name ?? '');
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [slowmode, setSlowmode] = useState(channel.slowmodeSeconds);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isText = channel.type === 'TEXT' || channel.type === 'ANNOUNCEMENT';

  async function save() {
    try {
      await api(`/channels/${channel.id}`, {
        method: 'PATCH',
        body: { name, ...(isText ? { topic: topic || null, slowmodeSeconds: slowmode } : {}) },
      });
      await qc.invalidateQueries({ queryKey: qk.server(server.id) });
      setMsg({ ok: true, text: 'Guardado' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Error' });
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar #${channel.name}? Se borrarán todos sus mensajes.`)) return;
    await api(`/channels/${channel.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: qk.server(server.id) });
    onClose();
    navigate(`/channels/${server.id}`, { replace: true });
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">General</h1>
      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Nombre</span>
        <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
      {isText && (
        <>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Tema</span>
            <textarea className="input resize-none" rows={3} maxLength={1024} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">Modo lento</span>
            <select className="input" value={slowmode} onChange={(e) => setSlowmode(Number(e.target.value))}>
              {[0, 5, 10, 30, 60, 300, 900, 3600].map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? 'Desactivado' : s < 60 ? `${s} s` : `${s / 60} min`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-fg-subtle">Se aplicará en la Fase 5 (moderación).</span>
          </label>
        </>
      )}
      {msg && <p className={`mb-3 text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
      <div className="flex justify-between gap-2 border-t border-surface-3 pt-4">
        <button className="btn-ghost text-danger" onClick={() => void remove()}>
          Eliminar canal
        </button>
        <button className="btn-primary" onClick={() => void save()}>
          Guardar
        </button>
      </div>
    </div>
  );
}

type Tri = 'allow' | 'inherit' | 'deny';

function PermissionsTab({ server, channel }: { server: ServerDetail; channel: ChannelDto }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user?.id);
  const [selected, setSelected] = useState<string>(server.id);
  const [error, setError] = useState<string | null>(null);
  const key = ['overwrites', channel.id];
  const { data: overwrites = [] } = useQuery({
    queryKey: key,
    queryFn: () => api<OverwriteDto[]>(`/channels/${channel.id}/overwrites`),
  });
  const { data: members } = useQuery({
    queryKey: qk.members(server.id),
    queryFn: () => api<Page<MemberDto>>(`/servers/${server.id}/members?limit=1000`),
  });

  const roles = useMemo(() => [...server.roles].sort(byPositionDesc), [server.roles]);
  const memberName = (id: string) => {
    const m = members?.items.find((x) => x.user.id === id);
    return m ? (m.nickname ?? displayName(m.user)) : 'Miembro';
  };
  // @everyone siempre aparece, aunque no tenga override.
  const targets: { id: string; type: 'ROLE' | 'MEMBER' }[] = [
    { id: server.id, type: 'ROLE' },
    ...overwrites.filter((o) => o.targetId !== server.id).map((o) => ({ id: o.targetId, type: o.type })),
  ];
  const addable = [
    ...roles.filter((r) => !targets.some((t) => t.id === r.id)).map((r) => ({ id: r.id, type: 'ROLE' as const, label: `Rol: ${r.name}` })),
    ...(members?.items ?? [])
      .filter((m) => !targets.some((t) => t.id === m.user.id))
      .map((m) => ({ id: m.user.id, type: 'MEMBER' as const, label: `Miembro: ${m.nickname ?? displayName(m.user)}` })),
  ];
  const current = targets.find((t) => t.id === selected) ?? targets[0]!;
  const ow = overwrites.find((o) => o.targetId === current.id);
  const allow = BigInt(ow?.allow ?? '0');
  const deny = BigInt(ow?.deny ?? '0');
  const myPerms = BigInt(server.channelPermissions[channel.id] ?? '0');
  const isOwner = server.ownerId === me;

  async function write(next: { allow: bigint; deny: bigint }, type: 'ROLE' | 'MEMBER', targetId: string) {
    setError(null);
    const body = { type, allow: next.allow.toString(), deny: next.deny.toString() };
    qc.setQueryData<OverwriteDto[]>(key, (d = []) => [...d.filter((o) => o.targetId !== targetId), { targetId, ...body }]);
    try {
      await api(`/channels/${channel.id}/overwrites/${targetId}`, { method: 'PUT', body });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
    void qc.invalidateQueries({ queryKey: key });
  }

  function setTri(bit: bigint, v: Tri) {
    const next = {
      allow: v === 'allow' ? allow | bit : allow & ~bit,
      deny: v === 'deny' ? deny | bit : deny & ~bit,
    };
    void write(next, current.type, current.id);
  }

  async function removeTarget(id: string) {
    setError(null);
    try {
      await api(`/channels/${channel.id}/overwrites/${id}`, { method: 'DELETE' });
      setSelected(server.id);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  const label = (t: { id: string; type: 'ROLE' | 'MEMBER' }) =>
    t.type === 'ROLE' ? (roles.find((r) => r.id === t.id)?.name ?? 'Rol') : memberName(t.id);
  const roleColor = (id: string) => {
    const c = roles.find((r) => r.id === id)?.color;
    return c ? hex(c) : 'var(--fg-subtle)';
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Permisos del canal</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Los overrides se aplican sobre los permisos del servidor: primero @everyone, luego los roles y por último el miembro. Para hacer el
        canal privado, deniega <strong>Ver canal</strong> a @everyone y permítelo a un rol.
      </p>
      {error && <p className="mb-4 rounded bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="shrink-0 md:w-52">
          <ul className="mb-3 flex flex-col gap-0.5">
            {targets.map((t) => (
              <li key={t.id} className="flex items-center">
                <button
                  onClick={() => setSelected(t.id)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    current.id === t.id ? 'bg-surface-3' : 'hover:bg-surface-3/60'
                  }`}
                >
                  {t.type === 'ROLE' ? (
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: roleColor(t.id) }} />
                  ) : (
                    <span aria-hidden>👤</span>
                  )}
                  <span className="truncate">{label(t)}</span>
                </button>
                {t.id !== server.id && (
                  <button aria-label={`Quitar override de ${label(t)}`} className="px-1.5 text-fg-subtle hover:text-danger" onClick={() => void removeTarget(t.id)}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          {addable.length > 0 && (
            <select
              aria-label="Añadir rol o miembro"
              className="input"
              value=""
              onChange={(e) => {
                const t = addable.find((a) => a.id === e.target.value);
                if (!t) return;
                setSelected(t.id);
                void write({ allow: 0n, deny: 0n }, t.type, t.id);
              }}
            >
              <option value="">+ Añadir rol o miembro</option>
              {addable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <section className="min-w-0 flex-1">
          {PERMISSION_GROUPS.filter((g) => g.channel || g.title === 'General').map((g) => (
            <div key={g.title} className="mb-6">
              <h3 className="mb-2 text-xs font-bold tracking-wide text-fg-subtle uppercase">{g.title}</h3>
              <div className="divide-y divide-surface-3">
                {g.items
                  .filter((it) => g.channel || it.key === 'MANAGE_CHANNELS' || it.key === 'MANAGE_ROLES' || it.key === 'CREATE_INVITE')
                  .map((it) => {
                    const bit = Permission[it.key];
                    const value: Tri = (allow & bit) === bit ? 'allow' : (deny & bit) === bit ? 'deny' : 'inherit';
                    const locked = !isOwner && !hasPermission(myPerms, bit);
                    return (
                      <div key={it.key} className="flex items-center justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{it.label}</div>
                          <div className="text-xs text-fg-subtle">{it.description}</div>
                        </div>
                        <TriState value={value} onChange={(v) => setTri(bit, v)} disabled={locked} />
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function TriState({ value, onChange, disabled }: { value: Tri; onChange: (v: Tri) => void; disabled: boolean }) {
  const opts: { v: Tri; label: string; cls: string }[] = [
    { v: 'deny', label: '✕', cls: 'bg-danger text-white' },
    { v: 'inherit', label: '/', cls: 'bg-surface-3 text-fg' },
    { v: 'allow', label: '✓', cls: 'bg-ok text-white' },
  ];
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-surface-3" role="radiogroup">
      {opts.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.v === 'deny' ? 'Denegar' : o.v === 'allow' ? 'Permitir' : 'Heredar'}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={`h-7 w-8 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${value === o.v ? o.cls : 'text-fg-subtle hover:bg-surface-3/60'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
