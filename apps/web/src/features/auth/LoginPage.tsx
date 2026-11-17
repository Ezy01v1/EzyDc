import { type AuthResponse, LoginInput, type LoginResponse, type UserSelf } from '@ezydc/shared';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { AuthCard, Field } from './AuthCard';

export default function LoginPage() {
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Ticket del primer paso cuando la cuenta tiene 2FA. */
  const [ticket, setTicket] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);

  function done(user: UserSelf) {
    setUser(user);
    navigate(safeNext(params.get('next')), { replace: true });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = LoginInput.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    setBusy(true);
    setError(null);
    try {
      const res = await api<LoginResponse>('/auth/login', { method: 'POST', body: parsed.data });
      if ('mfaRequired' in res) setTicket(res.ticket);
      else done(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<AuthResponse>('/auth/login/2fa', { method: 'POST', body: { ticket, code } });
      done(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      setError(msg);
      // Ticket caducado o agotado: vuelta al primer paso.
      if (/caduc|Demasiados/i.test(msg)) setTicket(null);
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <AuthCard
        title="Verificación en dos pasos"
        subtitle={useBackup ? 'Introduce uno de tus códigos de respaldo' : 'Introduce el código de 6 dígitos de tu app de autenticación'}
      >
        <form onSubmit={onSubmitCode} noValidate>
          <Field label={useBackup ? 'Código de respaldo' : 'Código'}>
            <input
              key={String(useBackup)}
              name="code"
              autoFocus
              required
              autoComplete="one-time-code"
              inputMode={useBackup ? 'text' : 'numeric'}
              pattern={useBackup ? undefined : '[0-9]*'}
              maxLength={useBackup ? 24 : 6}
              placeholder={useBackup ? 'abcde-12345' : '123456'}
              className="input text-center font-mono text-lg tracking-[0.3em]"
            />
          </Field>
          {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Verificando…' : 'Verificar'}
          </button>
          <div className="mt-4 flex justify-between text-sm">
            <button type="button" className="text-accent hover:underline" onClick={() => (setUseBackup((v) => !v), setError(null))}>
              {useBackup ? 'Usar la app de autenticación' : 'Usar un código de respaldo'}
            </button>
            <button type="button" className="text-fg-muted hover:underline" onClick={() => (setTicket(null), setError(null))}>
              Volver
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="¡Hola de nuevo!" subtitle="Inicia sesión para continuar">
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Contraseña">
          <input name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Iniciar sesión'}
        </button>
        <p className="mt-4 text-sm text-fg-muted">
          ¿No tienes cuenta?{' '}
          <Link to={`/register${params.size ? `?${params}` : ''}`} className="text-accent hover:underline">
            Regístrate
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

/** Evita open-redirects: solo rutas internas. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/channels';
}
