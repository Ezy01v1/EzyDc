import { CreateServerInput, type ServerSummary } from '@ezydc/shared';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '../../../components/Modal';
import { api } from '../../../lib/api';
import { queryClient, qk } from '../../../lib/queryClient';

/** Crear servidor o unirse con un código/enlace de invitación. */
export function AddServerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let server: ServerSummary;
      if (mode === 'create') {
        const parsed = CreateServerInput.safeParse({ name: value });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
        server = await api<ServerSummary>('/servers', { method: 'POST', body: parsed.data });
      } else {
        const code = value.trim().split('/').pop() ?? '';
        if (!/^[A-Za-z0-9]{4,16}$/.test(code)) throw new Error('Código de invitación inválido');
        server = await api<ServerSummary>(`/invites/${code}`, { method: 'POST' });
      }
      await queryClient.invalidateQueries({ queryKey: qk.servers });
      onClose();
      navigate(`/channels/${server.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'create' ? 'Crea tu servidor' : 'Únete a un servidor'} onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-md bg-surface-0 p-1 text-sm">
        {(['create', 'join'] as const).map((m) => (
          <button
            key={m}
            onClick={() => (setMode(m), setError(null), setValue(''))}
            className={`flex-1 rounded px-3 py-1.5 ${mode === m ? 'bg-surface-3 text-fg' : 'text-fg-muted'}`}
          >
            {m === 'create' ? 'Crear' : 'Unirme'}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <input
          autoFocus
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={mode === 'create' ? 'Nombre del servidor' : 'https://…/invite/AbCd1234 o AbCd1234'}
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={busy || !value.trim()}>
            {mode === 'create' ? 'Crear' : 'Unirme'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
