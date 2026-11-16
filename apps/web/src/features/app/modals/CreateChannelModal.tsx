import { type ChannelDto, CreateChannelInput } from '@ezydc/shared';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '../../../components/Modal';
import { api } from '../../../lib/api';
import { queryClient, qk } from '../../../lib/queryClient';

const TYPES = [
  { value: 'TEXT', label: '# Texto' },
  { value: 'VOICE', label: '🔊 Voz' },
  { value: 'ANNOUNCEMENT', label: '📢 Anuncios' },
  { value: 'CATEGORY', label: '📁 Categoría' },
] as const;

export function CreateChannelModal({
  serverId,
  parentId,
  onClose,
}: {
  serverId: string;
  parentId: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('TEXT');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = CreateChannelInput.safeParse({ name, type, parentId });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    try {
      const ch = await api<ChannelDto>(`/servers/${serverId}/channels`, { method: 'POST', body: parsed.data });
      await queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
      onClose();
      if (ch.type === 'TEXT' || ch.type === 'ANNOUNCEMENT') navigate(`/channels/${serverId}/${ch.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Modal title="Crear canal" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-md px-3 py-2 text-left text-sm ${type === t.value ? 'bg-accent text-white' : 'bg-surface-0 text-fg-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="nuevo-canal" maxLength={100} />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={!name.trim()}>
            Crear
          </button>
        </div>
      </form>
    </Modal>
  );
}
