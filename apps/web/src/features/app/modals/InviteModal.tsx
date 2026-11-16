import type { InviteDto } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { api } from '../../../lib/api';

export function InviteModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const invite = useQuery({
    queryKey: ['invite-create', serverId],
    queryFn: () => api<InviteDto>(`/servers/${serverId}/invites`, { method: 'POST', body: { maxAgeSeconds: 7 * 86400 } }),
    staleTime: Infinity,
    gcTime: 0,
  });
  const url = invite.data ? `${window.location.origin}/invite/${invite.data.code}` : '';

  return (
    <Modal title="Invitar amigos" onClose={onClose}>
      <p className="mb-2 text-sm text-fg-muted">Comparte este enlace (caduca en 7 días):</p>
      <div className="flex gap-2">
        <input readOnly className="input" value={invite.isPending ? 'Generando…' : url} onFocus={(e) => e.target.select()} />
        <button
          className="btn-primary"
          disabled={!url}
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      {invite.isError && <p className="mt-2 text-sm text-danger">{invite.error.message}</p>}
    </Modal>
  );
}
