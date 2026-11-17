import { type BackupCodes, type TwoFactorSetup, UpdateProfileInput, type UserSelf } from '@ezydc/shared';
import { type FormEvent, useState } from 'react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../stores/auth';
import { SettingsShell } from './SettingsShell';

type TabId = 'profile' | 'security';

export default function UserSettings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('profile');
  return (
    <SettingsShell
      title="Ajustes de usuario"
      tabs={[
        { id: 'profile', label: 'Perfil' },
        { id: 'security', label: 'Seguridad' },
      ]}
      active={tab}
      onTab={setTab}
      onClose={onClose}
    >
      {tab === 'profile' ? <ProfileTab /> : <SecurityTab />}
    </SettingsShell>
  );
}

const STATUSES = [
  { v: 'ONLINE', label: '🟢 En línea' },
  { v: 'IDLE', label: '🌙 Ausente' },
  { v: 'DND', label: '⛔ No molestar' },
  { v: 'INVISIBLE', label: '⚪ Invisible' },
] as const;

function ProfileTab() {
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = UpdateProfileInput.safeParse({
      displayName: String(f.get('displayName') ?? '').trim() || null,
      bio: String(f.get('bio') ?? '') || null,
      customStatus: String(f.get('customStatus') ?? '') || null,
      status: f.get('status'),
    });
    if (!parsed.success) return setMsg({ ok: false, text: parsed.error.issues[0]?.message ?? 'Datos inválidos' });
    try {
      setUser(await api<UserSelf>('/users/me', { method: 'PATCH', body: parsed.data }));
      setMsg({ ok: true, text: 'Perfil guardado' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Error' });
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h1 className="mb-6 text-xl font-bold">Perfil</h1>
      <Label text="Nombre visible">
        <input name="displayName" className="input" maxLength={32} defaultValue={user.displayName ?? ''} placeholder={user.username} />
      </Label>
      <Label text="Estado">
        <select name="status" className="input" defaultValue={user.status}>
          {STATUSES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </Label>
      <Label text="Estado personalizado">
        <input name="customStatus" className="input" maxLength={128} defaultValue={user.customStatus ?? ''} placeholder="¿Qué estás haciendo?" />
      </Label>
      <Label text="Sobre mí">
        <textarea name="bio" className="input resize-none" rows={4} maxLength={190} defaultValue={user.bio ?? ''} />
      </Label>
      {msg && <p className={`mb-3 text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
      <button className="btn-primary">Guardar</button>
    </form>
  );
}

type Step =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; setup: TwoFactorSetup }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'disable' }
  | { kind: 'regenerate' };

function SecurityTab() {
  const user = useAuth((s) => s.user)!;
  const setUser = useAuth((s) => s.setUser);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }
  const field = (e: FormEvent<HTMLFormElement>, name: string) => String(new FormData(e.currentTarget).get(name) ?? '');

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Autenticación en dos pasos</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Además de tu contraseña, se te pedirá un código de una app de autenticación (Google Authenticator, Aegis, 1Password…).
      </p>
      <div className="mb-6 flex items-center gap-2 text-sm">
        Estado:
        {user.totpEnabled ? (
          <span className="rounded bg-ok/15 px-2 py-0.5 font-semibold text-ok">Activado</span>
        ) : (
          <span className="rounded bg-surface-3 px-2 py-0.5 text-fg-muted">Desactivado</span>
        )}
      </div>
      {error && <p className="mb-4 rounded bg-danger/15 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {step.kind === 'idle' &&
        (user.totpEnabled ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border border-surface-3" onClick={() => setStep({ kind: 'regenerate' })}>
              Nuevos códigos de respaldo
            </button>
            <button className="btn-danger" onClick={() => setStep({ kind: 'disable' })}>
              Desactivar 2FA
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setStep({ kind: 'password' })}>
            Activar 2FA
          </button>
        ))}

      {step.kind === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const password = field(e, 'password');
            void run(async () => {
              const setup = await api<TwoFactorSetup>('/auth/2fa/setup', { method: 'POST', body: { password } });
              setStep({ kind: 'scan', setup });
            });
          }}
        >
          <Label text="Confirma tu contraseña">
            <input name="password" type="password" autoComplete="current-password" autoFocus required className="input" />
          </Label>
          <Actions busy={busy} label="Continuar" onCancel={() => setStep({ kind: 'idle' })} />
        </form>
      )}

      {step.kind === 'scan' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const code = field(e, 'code');
            void run(async () => {
              const { codes } = await api<BackupCodes>('/auth/2fa/enable', { method: 'POST', body: { code } });
              setUser({ ...user, totpEnabled: true });
              setStep({ kind: 'codes', codes });
            });
          }}
        >
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>Escanea el código QR con tu app de autenticación.</li>
            <li>Escribe el código de 6 dígitos que te muestra.</li>
          </ol>
          <div className="mb-4 flex flex-col items-start gap-4 sm:flex-row">
            {/* SVG generado por el servidor; se usa como imagen (no se inyecta en el DOM). */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(step.setup.qrSvg)}`}
              alt="Código QR para tu app de autenticación"
              width={176}
              height={176}
              className="rounded-lg bg-white p-2"
            />
            <div className="min-w-0 text-sm">
              <p className="mb-1 text-fg-muted">¿No puedes escanear? Introduce esta clave a mano:</p>
              <code className="block rounded bg-surface-0 px-2 py-1.5 font-mono text-xs break-all select-all">
                {step.setup.secret.match(/.{1,4}/g)?.join(' ')}
              </code>
            </div>
          </div>
          <Label text="Código de verificación">
            <CodeInput />
          </Label>
          <Actions busy={busy} label="Activar" onCancel={() => setStep({ kind: 'idle' })} />
        </form>
      )}

      {step.kind === 'codes' && <BackupCodesView codes={step.codes} onDone={() => setStep({ kind: 'idle' })} />}

      {step.kind === 'regenerate' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const code = field(e, 'code');
            void run(async () => {
              const { codes } = await api<BackupCodes>('/auth/2fa/backup-codes', { method: 'POST', body: { code } });
              setStep({ kind: 'codes', codes });
            });
          }}
        >
          <p className="mb-4 text-sm text-fg-muted">Los códigos anteriores dejarán de funcionar.</p>
          <Label text="Código de tu app">
            <CodeInput />
          </Label>
          <Actions busy={busy} label="Generar" onCancel={() => setStep({ kind: 'idle' })} />
        </form>
      )}

      {step.kind === 'disable' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const password = field(e, 'password');
            const code = field(e, 'code');
            void run(async () => {
              await api('/auth/2fa/disable', { method: 'POST', body: { password, code } });
              setUser({ ...user, totpEnabled: false });
              setStep({ kind: 'idle' });
            });
          }}
        >
          <Label text="Contraseña">
            <input name="password" type="password" autoComplete="current-password" autoFocus required className="input" />
          </Label>
          <Label text="Código de tu app o de respaldo">
            <CodeInput allowBackup />
          </Label>
          <Actions busy={busy} label="Desactivar" danger onCancel={() => setStep({ kind: 'idle' })} />
        </form>
      )}
    </div>
  );
}

function BackupCodesView({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Códigos de respaldo de ezyDC (cada uno sirve una vez)\n\n${text}\n`], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'ezydc-codigos-respaldo.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <p className="mb-3 rounded bg-warn/15 px-3 py-2 text-sm text-warn">
        Guárdalos en un lugar seguro: <strong>no volverás a verlos</strong>. Cada código sirve una sola vez si pierdes el móvil.
      </p>
      <ul className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-surface-0 p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost border border-surface-3" onClick={() => void navigator.clipboard.writeText(text)}>
          Copiar
        </button>
        <button className="btn-ghost border border-surface-3" onClick={download}>
          Descargar .txt
        </button>
        <button className="btn-primary" onClick={onDone}>
          Ya los guardé
        </button>
      </div>
    </div>
  );
}

function CodeInput({ allowBackup }: { allowBackup?: boolean }) {
  return (
    <input
      name="code"
      required
      autoComplete="one-time-code"
      inputMode={allowBackup ? 'text' : 'numeric'}
      maxLength={allowBackup ? 24 : 6}
      placeholder={allowBackup ? '123456 o abcde-12345' : '123456'}
      className="input max-w-56 font-mono tracking-widest"
    />
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">{text}</span>
      {children}
    </label>
  );
}

function Actions({ busy, label, danger, onCancel }: { busy: boolean; label: string; danger?: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy}>
        {busy ? '…' : label}
      </button>
      <button type="button" className="btn-ghost" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
