import { type ReactNode, useEffect } from 'react';

export interface Tab<T extends string> {
  id: T;
  label: string;
}

/** Pantalla completa de ajustes con navegación lateral (Esc para cerrar). */
export function SettingsShell<T extends string>({
  title,
  tabs,
  active,
  onTab,
  onClose,
  children,
}: {
  title: string;
  tabs: Tab<T>[];
  active: T;
  onTab: (t: T) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface-2 md:flex-row" role="dialog" aria-modal="true" aria-label={title}>
      <nav className="flex shrink-0 gap-1 overflow-x-auto bg-surface-1 p-3 md:w-56 md:flex-col md:py-10">
        <h2 className="hidden px-2 pb-2 text-xs font-bold tracking-wide text-fg-subtle uppercase md:block">{title}</h2>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`rounded px-3 py-1.5 text-left text-sm whitespace-nowrap ${
              active === t.id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-3/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="relative min-h-0 flex-1 overflow-y-auto p-4 md:p-10">
        <button
          onClick={onClose}
          aria-label="Cerrar ajustes"
          className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full border border-fg-subtle text-fg-muted hover:text-fg md:top-8 md:right-8"
        >
          ✕
        </button>
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-ok' : 'bg-fg-subtle'}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-5' : 'left-1'}`} />
    </button>
  );
}
