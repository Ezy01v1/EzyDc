import { useNavigate } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { api } from '../../lib/api';
import { displayName } from '../../lib/format';
import { queryClient } from '../../lib/queryClient';
import { disconnectSocket } from '../../lib/socket';
import { useAuth } from '../../stores/auth';
import { useLive } from '../../stores/live';

export function UserPanel() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const latency = useLive((s) => s.latencyMs);
  const connected = useLive((s) => s.connected);
  const navigate = useNavigate();

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    disconnectSocket();
    queryClient.clear();
    setUser(null);
    navigate('/login', { replace: true });
  }

  if (!user) return null;
  return (
    <div className="flex items-center gap-2 bg-surface-0/60 px-2 py-2">
      <Avatar user={user} size={32} presence={connected ? 'ONLINE' : 'OFFLINE'} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{displayName(user)}</div>
        <div className="truncate text-xs text-fg-subtle" title="Latencia del WebSocket">
          {connected ? (latency !== null ? `${latency} ms` : 'Conectado') : 'Reconectando…'}
        </div>
      </div>
      <button onClick={logout} className="btn-ghost px-2 py-1 text-xs" title="Cerrar sesión">
        Salir
      </button>
    </div>
  );
}
