import type { InvitePreview, ServerSummary } from '@ezydc/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../lib/api';
import { queryClient, qk } from '../../lib/queryClient';

export default function InvitePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ['invite', code],
    queryFn: () => api<InvitePreview>(`/invites/${encodeURIComponent(code)}`),
  });
  const join = useMutation({
    mutationFn: () => api<ServerSummary>(`/invites/${encodeURIComponent(code)}`, { method: 'POST' }),
    onSuccess: async (s) => {
      await queryClient.invalidateQueries({ queryKey: qk.servers });
      navigate(`/channels/${s.id}`, { replace: true });
    },
  });

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-0 p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface-2 p-8 text-center shadow-2xl">
        {preview.isPending && <p className="text-fg-muted">Cargando invitación…</p>}
        {preview.isError && (
          <>
            <h1 className="text-xl font-bold">Invitación no válida</h1>
            <p className="mt-2 text-sm text-fg-muted">Puede que haya caducado.</p>
            <Link to="/channels" className="btn-primary mt-6 w-full">Ir a la app</Link>
          </>
        )}
        {preview.data && (
          <>
            <p className="text-sm text-fg-muted">Te han invitado a unirte a</p>
            <h1 className="mt-1 text-2xl font-bold">{preview.data.server.name}</h1>
            <p className="mt-1 text-sm text-fg-muted">{preview.data.server.memberCount} miembros</p>
            {join.isError && <p className="mt-3 text-sm text-danger">{join.error.message}</p>}
            <button className="btn-primary mt-6 w-full" disabled={join.isPending} onClick={() => join.mutate()}>
              {join.isPending ? 'Uniéndote…' : 'Aceptar invitación'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
