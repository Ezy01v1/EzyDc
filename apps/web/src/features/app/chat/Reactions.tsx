import type { ReactionDto } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../lib/api';
import { applyReaction } from '../messageCache';
import type { PickedEmoji } from './EmojiPicker';

const EmojiPicker = lazy(() => import('./EmojiPicker'));

/** Alterna mi reacción: optimista, y se revierte si la API la rechaza. */
export async function toggleReaction(
  qc: ReturnType<typeof useQueryClient>,
  channelId: string,
  messageId: string,
  emoji: string,
  add: boolean,
  extra: { url?: string; name?: string } = {},
): Promise<void> {
  applyReaction(qc, channelId, messageId, emoji, add, true, extra);
  try {
    await api(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, { method: add ? 'PUT' : 'DELETE' });
  } catch {
    applyReaction(qc, channelId, messageId, emoji, !add, true, extra);
  }
}

export function ReactionBar({
  channelId,
  messageId,
  reactions,
  canReact,
  serverId,
}: {
  channelId: string;
  messageId: string;
  reactions: ReactionDto[];
  canReact: boolean;
  serverId: string | null;
}) {
  const qc = useQueryClient();
  if (!reactions.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-pressed={r.me}
          title={r.name ? `:${r.name}:` : r.emoji}
          onClick={() => void toggleReaction(qc, channelId, messageId, r.emoji, !r.me, { url: r.url, name: r.name })}
          className={`flex h-6 items-center gap-1 rounded-md border px-1.5 text-sm ${
            r.me ? 'border-accent bg-accent/20' : 'border-transparent bg-surface-1 hover:border-surface-3'
          }`}
        >
          {r.url ? <img src={r.url} alt={r.name} className="h-4 w-4 object-contain" /> : <span>{r.emoji}</span>}
          <span className="text-xs font-semibold text-fg-muted tabular-nums">{r.count}</span>
        </button>
      ))}
      {canReact && <AddReactionButton channelId={channelId} messageId={messageId} serverId={serverId} small />}
    </div>
  );
}

/** Botón que abre el selector (lazy) en un portal: las filas virtualizadas usan transform y lo recortarían. */
export function AddReactionButton({
  channelId,
  messageId,
  serverId,
  small,
}: {
  channelId: string;
  messageId: string;
  serverId: string | null;
  small?: boolean;
}) {
  const qc = useQueryClient();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function open(e: React.MouseEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const h = 352;
    const w = Math.min(352, window.innerWidth - 32);
    setPos({
      top: r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
    });
  }

  const pick = (em: PickedEmoji) => {
    setPos(null);
    void toggleReaction(qc, channelId, messageId, em.key, true, { url: em.url, name: em.name });
  };

  return (
    <>
      <button
        type="button"
        title="Añadir reacción"
        aria-label="Añadir reacción"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => (pos ? setPos(null) : open(e))}
        className={
          small
            ? 'flex h-6 items-center rounded-md bg-surface-1 px-1.5 text-sm text-fg-muted hover:text-fg'
            : 'grid h-7 w-7 place-items-center rounded text-sm text-fg-muted hover:bg-surface-3'
        }
      >
        {small ? '＋' : '😀'}
      </button>
      {pos &&
        createPortal(
          <div className="fixed z-50" style={pos}>
            <Suspense fallback={<div className="h-[22rem] w-[22rem] rounded-lg bg-surface-1 shadow-2xl" />}>
              <EmojiPicker serverId={serverId} onClose={() => setPos(null)} onPick={pick} />
            </Suspense>
          </div>,
          document.body,
        )}
    </>
  );
}
