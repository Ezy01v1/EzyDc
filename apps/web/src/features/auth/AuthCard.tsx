import type { ReactNode } from 'react';

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-0 p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface-2 p-8 shadow-2xl">
        <h1 className="text-center text-2xl font-bold">{title}</h1>
        <p className="mt-1 mb-6 text-center text-sm text-fg-muted">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-fg-muted uppercase">{label}</span>
      {children}
    </label>
  );
}
