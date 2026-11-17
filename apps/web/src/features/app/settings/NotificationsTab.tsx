import { useEffect, useState } from 'react';
import { disablePush, enablePush, getPushState, type PushState } from '../../../lib/push';

const TEXT: Record<PushState, string> = {
  on: 'Activadas en este navegador. Te avisaremos de menciones y mensajes directos cuando no tengas ezyDC abierto.',
  off: 'Desactivadas en este navegador.',
  denied: 'El navegador tiene bloqueadas las notificaciones de este sitio. Actívalas desde el candado de la barra de direcciones y vuelve aquí.',
  unsupported: 'Este navegador no admite notificaciones push. En iPhone/iPad, primero añade ezyDC a la pantalla de inicio.',
  unconfigured: 'El servidor no tiene configuradas las notificaciones push (faltan las claves VAPID).',
};

export function NotificationsTab() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setState, () => setState('unsupported'));
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Notificaciones</h1>
      <section className="rounded-lg bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Notificaciones push</h2>
            <p className="mt-1 text-sm text-fg-muted">{state ? TEXT[state] : 'Comprobando…'}</p>
          </div>
          {(state === 'on' || state === 'off') && (
            <button className={state === 'on' ? 'btn-ghost shrink-0' : 'btn-primary shrink-0'} disabled={busy} onClick={() => void toggle()}>
              {busy ? '…' : state === 'on' ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>
      <p className="mt-4 text-sm text-fg-subtle">
        Los canales y servidores silenciados no envían avisos. Si tienes ezyDC abierto en alguna pestaña, el aviso llega solo dentro de la app.
      </p>
    </div>
  );
}
