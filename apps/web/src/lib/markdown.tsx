import type { ReactNode } from 'react';
import { customEmojiUrl } from './emoji';

/**
 * Markdown mínimo y SEGURO: genera nodos React (texto escapado por React), nunca innerHTML.
 * Soporta: ```bloques```, `código`, **negrita**, *cursiva* / _cursiva_, ~~tachado~~,
 * > citas y enlaces http(s) (otros esquemas como javascript: nunca se convierten en enlace).
 * Menciones <@id>, <@&id> y @everyone como "pastillas" (nombre resuelto vía MentionRender).
 * Resaltado de sintaxis: Fase 3c, cargado con import() solo si hay bloques de código.
 */

/** Cómo pintar menciones (<@id>, <@&id>, @everyone). */
export interface MentionRender {
  user: (id: string) => string | undefined;
  role: (id: string) => { name: string; color?: string } | undefined;
}

let mentionCtx: MentionRender | undefined;

export function renderMarkdown(src: string, mentions?: MentionRender): ReactNode[] {
  mentionCtx = mentions;
  const out: ReactNode[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src))) {
    if (m.index > last) out.push(...renderLines(src.slice(last, m.index), () => key++));
    out.push(
      <pre key={`pre${key++}`} className="my-1 overflow-x-auto rounded-md bg-surface-0 p-3 text-[0.85em] leading-relaxed">
        <code data-lang={m[1] || undefined}>{m[2]?.replace(/\n$/, '')}</code>
      </pre>,
    );
    last = fence.lastIndex;
  }
  if (last < src.length) out.push(...renderLines(src.slice(last), () => key++));
  return out;
}

function renderLines(text: string, nextKey: () => number): ReactNode[] {
  return text.split('\n').map((line, i, arr) => {
    const k = nextKey();
    const isQuote = line.startsWith('> ');
    const content = renderInline(isQuote ? line.slice(2) : line, k);
    if (isQuote) {
      return (
        <blockquote key={k} className="border-l-4 border-surface-3 pl-3 text-fg-muted">
          {content}
        </blockquote>
      );
    }
    return (
      <span key={k}>
        {content}
        {i < arr.length - 1 ? <br /> : null}
      </span>
    );
  });
}

const INLINE =
  /(<@&?[0-9a-f-]{36}>|@everyone(?!\w))|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\*[^*\n]+\*|_[^_\n]+_)|(https?:\/\/[^\s<>]+[^\s<>.,:;"')\]!?])|(<a?:\w{2,32}:[0-9a-f-]{36}>)/g;

function renderInline(text: string, seed: number): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${seed}-${i++}`;
    const [tok] = m;
    if (m[1]) out.push(mentionPill(tok, k));
    else if (m[2]) out.push(<code key={k} className="rounded bg-surface-0 px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (m[3]) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (m[4]) out.push(<s key={k}>{tok.slice(2, -2)}</s>);
    else if (m[5]) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (m[7]) out.push(customEmoji(tok, k));
    else if (m[6])
      out.push(
        <a key={k} href={tok} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
          {tok}
        </a>,
      );
    last = INLINE.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** <:nombre:id> → imagen del CDN (si no hay CDN configurado, se deja el texto ":nombre:"). */
function customEmoji(tok: string, key: string): ReactNode {
  const [, name = '', id = ''] = /^<a?:(\w+):([0-9a-f-]{36})>$/.exec(tok) ?? [];
  const url = customEmojiUrl(id);
  if (!url) return `:${name}:`;
  return <img key={key} src={url} alt={`:${name}:`} title={`:${name}:`} loading="lazy" className="inline-block h-[1.375em] w-[1.375em] object-contain align-[-0.3em]" />;
}

function mentionPill(tok: string, key: string): ReactNode {
  const cls = 'rounded px-0.5 font-medium';
  if (tok.startsWith('@everyone')) {
    return <span key={key} className={`${cls} bg-accent/25 text-accent`}>@everyone</span>;
  }
  const id = tok.replace(/[<>@&]/g, '');
  if (tok.startsWith('<@&')) {
    const r = mentionCtx?.role(id);
    return (
      <span key={key} className={`${cls} bg-accent/25 text-accent`} style={r?.color ? { color: r.color, background: `${r.color}33` } : undefined}>
        @{r?.name ?? 'rol-eliminado'}
      </span>
    );
  }
  return (
    <span key={key} className={`${cls} bg-accent/25 text-accent`}>
      @{mentionCtx?.user(id) ?? 'usuario-desconocido'}
    </span>
  );
}
