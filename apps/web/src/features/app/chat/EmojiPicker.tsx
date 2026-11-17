import type { EmojiDto } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { qk } from '../../../lib/queryClient';
import { useMyEmojis } from '../../../lib/emoji';
import { EMOJI_CATEGORIES } from './emojiData';

export interface PickedEmoji {
  /** Para reacciones: unicode o "c:<id>". */
  key: string;
  /** Para el compositor: unicode o ":nombre:". */
  text: string;
  url?: string;
  name?: string;
}

const RECENT_KEY = 'ezydc:recent-emojis';
const MAX_RECENT = 16;

function loadRecent(): PickedEmoji[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as PickedEmoji[]).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function pushRecent(e: PickedEmoji): void {
  try {
    const list = [e, ...loadRecent().filter((x) => x.key !== e.key)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* modo privado: sin recientes */
  }
}

/**
 * Selector de emojis. Este módulo (y su catálogo) se carga con import() solo al abrirlo.
 * Incluye los emojis personalizados de todos tus servidores, primero los del actual.
 */
export default function EmojiPicker({
  onPick,
  onClose,
  serverId,
}: {
  onPick: (e: PickedEmoji) => void;
  onClose: () => void;
  serverId: string | null;
}) {
  const qc = useQueryClient();
  const { data: custom = [] } = useMyEmojis();
  const [q, setQ] = useState('');
  const [recent] = useState(loadRecent);
  const root = useRef<HTMLDivElement>(null);
  const sections = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  const serverNames = useMemo(() => {
    const list = qc.getQueryData<{ id: string; name: string }[]>(qk.servers) ?? [];
    return new Map(list.map((s) => [s.id, s.name]));
  }, [qc]);

  const customGroups = useMemo(() => {
    const groups = new Map<string, EmojiDto[]>();
    for (const e of custom) groups.set(e.serverId, [...(groups.get(e.serverId) ?? []), e]);
    return [...groups.entries()].sort(([a], [b]) => (a === serverId ? -1 : b === serverId ? 1 : 0));
  }, [custom, serverId]);

  const pick = (e: PickedEmoji) => {
    pushRecent(e);
    onPick(e);
  };
  const fromCustom = (e: EmojiDto): PickedEmoji => ({ key: `c:${e.id}`, text: `:${e.name}:`, url: e.url, name: e.name });

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query) return null;
    const uni = EMOJI_CATEGORIES.flatMap((c) => c.items)
      .filter(([, kw]) => kw.includes(query))
      .map(([e]): PickedEmoji => ({ key: e, text: e }));
    const cus = custom.filter((e) => e.name.toLowerCase().includes(query)).map(fromCustom);
    return [...cus, ...uni].slice(0, 80);
  }, [query, custom]);

  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Selector de emojis"
      className="flex h-[22rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-surface-0 bg-surface-1 shadow-2xl"
    >
      <div className="p-2">
        <input className="input py-1.5 text-sm" placeholder="Buscar emoji" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {!results && (
        <nav className="flex gap-0.5 border-b border-surface-0 px-2 pb-1" aria-label="Categorías">
          {customGroups.length > 0 && <CatButton label="Del servidor" onClick={() => sections.current.custom?.scrollIntoView()}>⭐</CatButton>}
          {EMOJI_CATEGORIES.map((c) => (
            <CatButton key={c.id} label={c.label} onClick={() => sections.current[c.id]?.scrollIntoView()}>
              {c.icon}
            </CatButton>
          ))}
        </nav>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {results ? (
          results.length ? (
            <Grid items={results} onPick={pick} />
          ) : (
            <p className="p-4 text-center text-sm text-fg-subtle">Sin resultados</p>
          )
        ) : (
          <>
            {recent.length > 0 && <Section title="Recientes"><Grid items={recent} onPick={pick} /></Section>}
            <div ref={(el) => void (sections.current.custom = el)}>
              {customGroups.map(([sid, list]) => (
                <Section key={sid} title={serverNames.get(sid) ?? 'Servidor'}>
                  <Grid items={list.map(fromCustom)} onPick={pick} />
                </Section>
              ))}
            </div>
            {EMOJI_CATEGORIES.map((c) => (
              <div key={c.id} ref={(el) => void (sections.current[c.id] = el)}>
                <Section title={c.label}>
                  <Grid items={c.items.map(([e]) => ({ key: e, text: e }))} onPick={pick} />
                </Section>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="sticky top-0 bg-surface-1 py-1.5 text-[0.65rem] font-bold tracking-wide text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Grid({ items, onPick }: { items: PickedEmoji[]; onPick: (e: PickedEmoji) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((e) => (
        <button
          key={e.key}
          type="button"
          title={e.name ? `:${e.name}:` : e.text}
          aria-label={e.name ?? e.text}
          onClick={() => onPick(e)}
          className="grid aspect-square place-items-center rounded text-2xl hover:bg-surface-3"
        >
          {e.url ? <img src={e.url} alt={e.name} loading="lazy" className="h-7 w-7 object-contain" /> : e.text}
        </button>
      ))}
    </div>
  );
}

function CatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="grid h-7 w-7 place-items-center rounded hover:bg-surface-3">
      {children}
    </button>
  );
}
