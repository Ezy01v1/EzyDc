import type { DmChannelDto, UserPublic } from '@ezydc/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { Modal } from '../../../components/Modal';
import { api } from '../../../lib/api';
import { displayName } from '../../../lib/format';
import { qk } from '../../../lib/queryClient';

const MAX_RECIPIENTS = 9;

/** Abre (o reutiliza) un DM, o crea un grupo si eliges a varias personas. */
export async function openDm(recipientIds: string[], name?: string): Promise<DmChannelDto> {
  return api<DmChannelDto>('/users/me/channels', { method: 'POST', body: { recipientIds, ...(name ? { name } : {}) } });
}

export function NewDmModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: contacts = [], isPending } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api<UserPublic[]>('/users/me/contacts'),
  });
  const visible = contacts.filter((u) => `${u.username} ${u.displayName ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const isGroup = selected.length > 1;

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_RECIPIENTS ? [...s, id] : s));
  }

  async function create() {
    setError(null);
    try {
      const dm = await openDm(selected, isGroup ? name.trim() || undefined : undefined);
      await qc.invalidateQueries({ queryKey: qk.dms });
      onClose();
      navigate(`/channels/@me/${dm.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <Modal title="Nuevo mensaje" onClose={onClose}>
      <p className="mb-3 text-sm text-fg-muted">
        Elige a una persona para un mensaje directo, o a varias (máx. {MAX_RECIPIENTS}) para un grupo privado. Solo aparecen personas con las que compartes servidor.
      </p>
      <input className="input mb-3" placeholder="Buscar" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      <ul className="mb-3 max-h-64 overflow-y-auto rounded-md bg-surface-0 p-1">
        {isPending && <li className="p-2 text-sm text-fg-subtle">Cargando…</li>}
        {!isPending && visible.length === 0 && <li className="p-2 text-sm text-fg-subtle">Nadie por aquí todavía. Únete a un servidor.</li>}
        {visible.map((u) => (
          <li key={u.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-surface-3/60">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} className="accent-[var(--accent)]" />
              <Avatar user={u} size={28} />
              <span className="truncate text-sm">{displayName(u)}</span>
              <span className="truncate text-xs text-fg-subtle">{u.username}</span>
            </label>
          </li>
        ))}
      </ul>
      {isGroup && (
        <input className="input mb-3" placeholder="Nombre del grupo (opcional)" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" disabled={selected.length === 0} onClick={() => void create()}>
          {isGroup ? 'Crear grupo' : 'Abrir mensaje'}
        </button>
      </div>
    </Modal>
  );
}
