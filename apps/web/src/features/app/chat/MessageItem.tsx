import { useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, memo, useMemo, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { api } from '../../../lib/api';
import { displayName, formatTime, shortTime } from '../../../lib/format';
import { renderMarkdown } from '../../../lib/markdown';
import { decodeMentions, encodeMentions, mentionsMe, roleCandidates, userCandidates } from '../../../lib/mentions';
import { hex } from '../../../lib/roles';
import { useAuth } from '../../../stores/auth';
import { useLive } from '../../../stores/live';
import { type ClientMessage, patchMessage, removeMessage } from '../messageCache';
import { useChatContext } from './chatContext';

/** memo: con virtualización + memo, un mensaje nuevo solo renderiza 1 fila. */
export const MessageItem = memo(function MessageItem({
  message: m,
  grouped,
  canManage,
}: {
  message: ClientMessage;
  grouped: boolean;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user?.id);
  const [editing, setEditing] = useState(false);
  const ctx = useChatContext();
  const [draft, setDraft] = useState(m.content);
  const body = useMemo(
    () =>
      renderMarkdown(m.content, {
        user: (id) => {
          const u = m.mentions.find((x) => x.id === id) ?? ctx.people.find((x) => x.id === id);
          return u ? (u.displayName ?? u.username) : undefined;
        },
        role: (id) => {
          const r = ctx.roles.find((x) => x.id === id);
          return r ? { name: r.name, color: r.color ? hex(r.color) : undefined } : undefined;
        },
      }),
    [m.content, m.mentions, ctx.people, ctx.roles],
  );
  const mine = m.author?.id === me;
  const highlighted = mentionsMe(m, me, ctx.myRoleIds);
  const startEdit = () => {
    setDraft(decodeMentions(m.content, [...m.mentions, ...ctx.people], ctx.roles));
    setEditing(true);
  };

  async function saveEdit() {
    const content = encodeMentions(draft.trim(), [...userCandidates([...m.mentions, ...ctx.people]), ...roleCandidates(ctx.roles)]);
    setEditing(false);
    if (!content || content === m.content) return;
    patchMessage(qc, m.channelId, m.id, { content }); // optimista
    try {
      await api(`/channels/${m.channelId}/messages/${m.id}`, { method: 'PATCH', body: { content } });
    } catch {
      patchMessage(qc, m.channelId, m.id, { content: m.content });
    }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar este mensaje?')) return;
    removeMessage(qc, m.channelId, m.id);
    await api(`/channels/${m.channelId}/messages/${m.id}`, { method: 'DELETE' }).catch(() => {});
  }

  function onEditKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void saveEdit();
    } else if (e.key === 'Escape') setEditing(false);
  }

  return (
    <article
      className={`group relative flex gap-4 px-4 ${
        highlighted ? 'border-l-2 border-warn bg-warn/10 hover:bg-warn/15' : 'hover:bg-surface-0/30'
      } ${grouped ? 'py-0.5' : 'mt-3 pt-1 pb-0.5'} ${m.pending ? 'opacity-60' : ''}`}
    >
      <div className="w-10 shrink-0">
        {grouped ? (
          <time className="invisible block pt-1 text-right text-[0.65rem] text-fg-subtle group-hover:visible">{shortTime(m.createdAt)}</time>
        ) : (
          <Avatar user={m.author} size={40} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {m.replyTo && (
          <div className="mb-0.5 flex items-center gap-1 truncate text-xs text-fg-subtle">
            <span aria-hidden>↱</span>
            <span className="font-semibold text-fg-muted">@{displayName(m.replyTo.author)}</span>
            <span className="truncate">{m.replyTo.content}</span>
          </div>
        )}
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{displayName(m.author)}</span>
            <time className="text-xs text-fg-subtle" dateTime={m.createdAt}>
              {formatTime(m.createdAt)}
            </time>
          </div>
        )}

        {editing ? (
          <div>
            <textarea
              autoFocus
              className="input mt-1 resize-none"
              rows={Math.min(8, draft.split('\n').length)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onEditKey}
              maxLength={4000}
            />
            <p className="mt-1 text-xs text-fg-subtle">Esc para cancelar · Enter para guardar</p>
          </div>
        ) : (
          <div className="leading-relaxed break-words whitespace-pre-wrap text-fg/95">
            {body}
            {m.editedAt && <span className="ml-1 text-[0.65rem] text-fg-subtle">(editado)</span>}
            {m.failed && <span className="ml-2 text-xs text-danger">No se pudo enviar</span>}
          </div>
        )}
      </div>

      {!m.pending && !editing && (
        <div className="absolute -top-3 right-4 hidden gap-0.5 rounded-md border border-surface-0 bg-surface-2 p-0.5 shadow group-hover:flex">
          <ToolButton label="Responder" onClick={() => useLive.getState().set({ replyTo: m })}>↩</ToolButton>
          {mine && (
            <ToolButton label="Editar" onClick={startEdit}>
              ✎
            </ToolButton>
          )}
          {(mine || canManage) && (
            <ToolButton label="Eliminar" onClick={() => void remove()} danger>
              🗑
            </ToolButton>
          )}
        </div>
      )}
    </article>
  );
});

function ToolButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded text-sm hover:bg-surface-3 ${danger ? 'text-danger' : 'text-fg-muted'}`}
    >
      {children}
    </button>
  );
}
