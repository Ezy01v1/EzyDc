import { type AuthResponse, RegisterInput } from '@ezydc/shared';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { AuthCard, Field } from './AuthCard';
import { safeNext } from './LoginPage';

export default function RegisterPage() {
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = RegisterInput.safeParse({
      email: form.get('email'),
      username: form.get('username'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return setError(issue ? `${String(issue.path[0])}: ${issue.message}` : 'Datos inválidos');
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<AuthResponse>('/auth/register', { method: 'POST', body: parsed.data });
      setUser(user);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Crea tu cuenta" subtitle="Tarda menos de un minuto">
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Nombre de usuario">
          <input name="username" autoComplete="username" required minLength={2} maxLength={32} className="input" />
        </Field>
        <Field label="Contraseña">
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className="input" />
        </Field>
        {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creando…' : 'Continuar'}
        </button>
        <p className="mt-4 text-sm text-fg-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to={`/login${params.size ? `?${params}` : ''}`} className="text-accent hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
