import type { ChannelDto, MessageDto } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { api } from '../../../lib/api';
import { displayName } from '../../../lib/format';
import { encodeMentions, roleCandidates, userCandidates } from '../../../lib/mentions';
import { hex } from '../../../lib/roles';
import { getSocket } from '../../../lib/socket';
import { useAuth } from '../../../stores/auth';
import { useLive } from '../../../stores/live';
import { patchMessage, upsertMessage } from '../messageCache';
import { useChatContext } from './chatContext';

const TYPING_EVERY_MS = 3_000;
const MAX_SUGGESTIONS = 8;

type Suggestion =
  | { kind: 'user'; id: string; insert: string; label: string; sub: string; user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } }
  | { kind: 'role'; id: string; insert: string; label: string; color?: string }
  | { kind: 'everyone'; id: 'everyone'; insert: string; label: string };

export function Composer({ channel, placeholderName, disabled }: { channel: ChannelDto; placeholderName: string; disabled: boolean }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const replyTo = useLive((s) => s.replyTo);
  const ctx = useChatContext();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const lastTyping = useRef(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  // "@algo" justo antes del cursor → abre el autocompletado.
  const query = useMemo(() => /(?:^|\s)@([^\s@]{0,32})$/.exec(text.slice(0, caret))?.[1], [text, caret]);

  const mentionableRoles = useMemo(
    () => ctx.roles.filter((r) => r.id !== ctx.serverId && (r.mentionable || ctx.canMentionEveryone)),
    [ctx.roles, ctx.serverId, ctx.canMentionEveryone],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    if (query === undefined || dismissed) return [];
    const q = query.toLowerCase();
    const users: Suggestion[] = ctx.people
      .filter((u) => u.id !== me?.id && (u.username.toLowerCase().includes(q) || (u.displayName ?? '').toLowerCase().includes(q)))
      .slice(0, MAX_SUGGESTIONS)
      .map((u) => ({ kind: 'user', id: u.id, insert: u.username, label: displayName(u), sub: u.username, user: u }));
    const roles: Suggestion[] = mentionableRoles
      .filter((r) => r.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((r) => ({ kind: 'role', id: r.id, insert: r.name, label: r.name, color: r.color ? hex(r.color) : undefined }));
    const everyone: Suggestion[] =
      ctx.serverId && ctx.canMentionEveryone && 'everyone'.startsWith(q)
        ? [{ kind: 'everyone', id: 'everyone', insert: 'everyone', label: '@everyone' }]
        : [];
    return [...users, ...roles, ...everyone].slice(0, MAX_SUGGESTIONS);
  }, [query, dismissed, ctx.people, ctx.serverId, ctx.canMentionEveryone, mentionableRoles, me?.id]);

  function pick(s: Suggestion) {
    const before = text.slice(0, caret).replace(/@[^\s@]*$/, `@${s.insert} `);
    const next = before + text.slice(caret);
    setText(next);
    setActive(0);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  }

  async function send() {
    const raw = text.trim();
    if (!raw || !me) return;
    // "@ana" → "<@id>": lo que viaja y se guarda es el id (estable aunque cambie el nombre).
    const content = encodeMentions(raw, [...userCandidates(ctx.people), ...roleCandidates(mentionableRoles)]);
    setText('');
    useLive.getState().set({ replyTo: null });

    // Envío optimista: aparece al instante; el nonce lo reconcilia con el eco del servidor.
    const nonce = crypto.randomUUID();
    const optimistic = {
      id: `pending-${nonce}`,
      channelId: channel.id,
      author: { id: me.id, username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl },
      content,
      type: replyTo ? 'REPLY' : 'DEFAULT',
      createdAt: new Date().toISOString(),
      editedAt: null,
      replyTo: replyTo ? { id: replyTo.id, author: replyTo.author, content: replyTo.content.slice(0, 200) } : null,
      mentions: [],
      mentionRoleIds: [],
      mentionEveryone: false,
      nonce,
      pending: true,
    };
    upsertMessage(qc, optimistic);
    try {
      const saved = await api<MessageDto>(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: { content, nonce, ...(replyTo ? { replyToId: replyTo.id } : {}) },
      });
      upsertMessage(qc, { ...saved, nonce });
    } catch {
      patchMessage(qc, channel.id, optimistic.id, { failed: true });
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + d + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[Math.min(active, suggestions.length - 1)]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
      return;
    }
    if (e.key === 'Escape') useLive.getState().set({ replyTo: null });
    const now = Date.now();
    if (now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      getSocket().emit('typing:start', { channelId: channel.id });
    }
  }

  return (
    <div className="relative rounded-lg bg-surface-3">
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Sugerencias de mención"
          className="absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-lg border border-surface-0 bg-surface-1 py-1 shadow-xl"
        >
          <li className="px-3 py-1 text-[0.65rem] font-bold tracking-wide text-fg-subtle uppercase">Mencionar</li>
          {suggestions.map((s, i) => (
            <li key={`${s.kind}-${s.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => (e.preventDefault(), pick(s))}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-surface-3' : ''}`}
              >
                {s.kind === 'user' && <Avatar user={s.user} size={22} />}
                {s.kind === 'role' && <span className="h-3 w-3 rounded-full" style={{ background: s.color ?? 'var(--fg-subtle)' }} />}
                {s.kind === 'everyone' && <span aria-hidden>📣</span>}
                <span className="truncate font-medium" style={s.kind === 'role' ? { color: s.color } : undefined}>
                  {s.kind === 'role' ? `@${s.label}` : s.label}
                </span>
                {s.kind === 'user' && <span className="truncate text-xs text-fg-subtle">{s.sub}</span>}
                {s.kind === 'everyone' && <span className="text-xs text-fg-subtle">notifica a todos</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {replyTo && (
        <div className="flex items-center justify-between rounded-t-lg bg-surface-0/50 px-4 py-1.5 text-xs text-fg-muted">
          <span>
            Respondiendo a <strong>{displayName(replyTo.author)}</strong>
          </span>
          <button aria-label="Cancelar respuesta" onClick={() => useLive.getState().set({ replyTo: null })}>
            ✕
          </button>
        </div>
      )}
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCaret(e.target.selectionStart);
          setDismissed(false);
          setActive(0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={Math.min(10, text.split('\n').length)}
        maxLength={4000}
        placeholder={disabled ? 'No tienes permiso para enviar mensajes aquí' : `Enviar mensaje a ${placeholderName}`}
        aria-label="Mensaje"
        aria-autocomplete="list"
        className="block max-h-60 w-full resize-none bg-transparent px-4 py-3 text-[0.95rem] outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
      />
    </div>
  );
}
