import { type AuthResponse, LoginInput } from '@ezydc/shared';
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = LoginInput.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<AuthResponse>('/auth/login', { method: 'POST', body: parsed.data });
      setUser(user);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setBusy(false);
    }
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
