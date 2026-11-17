import { type ChannelDto, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, type MessageDto, type UploadTicket } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../../components/Avatar';
import { api } from '../../../lib/api';
import { encodeEmojis, useMyEmojis } from '../../../lib/emoji';
import { displayName } from '../../../lib/format';
import { encodeMentions, roleCandidates, userCandidates } from '../../../lib/mentions';
import { hex } from '../../../lib/roles';
import { getSocket } from '../../../lib/socket';
import { formatBytes, prepareFile, putToR2 } from '../../../lib/upload';
import { useAuth } from '../../../stores/auth';
import { useLive } from '../../../stores/live';
import { patchMessage, upsertMessage } from '../messageCache';
import { useChatContext } from './chatContext';

const EmojiPicker = lazy(() => import('./EmojiPicker'));

const TYPING_EVERY_MS = 3_000;
const MAX_SUGGESTIONS = 8;

type Suggestion =
  | { kind: 'user'; id: string; insert: string; label: string; sub: string; user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } }
  | { kind: 'role'; id: string; insert: string; label: string; color?: string }
  | { kind: 'everyone'; id: 'everyone'; insert: string; label: string };

interface PendingFile {
  localId: string;
  name: string;
  size: number;
  type: string;
  preview?: string;
  progress: number;
  status: 'preparing' | 'uploading' | 'done' | 'error';
  error?: string;
  uploadId?: string;
  width?: number;
  height?: number;
  abort: AbortController;
}

export function Composer({ channel, placeholderName, disabled }: { channel: ChannelDto; placeholderName: string; disabled: boolean }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const replyTo = useLive((s) => s.replyTo);
  const ctx = useChatContext();
  const { data: emojis = [] } = useMyEmojis();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [picker, setPicker] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const lastTyping = useRef(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Al salir del canal: cancelar subidas y liberar previsualizaciones.
  useEffect(
    () => () =>
      filesRef.current.forEach((f) => {
        f.abort.abort();
        if (f.preview) URL.revokeObjectURL(f.preview);
      }),
    [],
  );

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
    insertAt(before, text.slice(caret));
    setActive(0);
  }

  function insertAt(before: string, after: string) {
    setText(before + after);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  }

  const update = (localId: string, patch: Partial<PendingFile>) =>
    setFiles((l) => l.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));

  async function addFiles(list: File[]) {
    if (!ctx.canAttach || list.length === 0) return;
    setNotice(null);
    const room = MAX_ATTACHMENTS - filesRef.current.length;
    if (list.length > room) setNotice(`Máximo ${MAX_ATTACHMENTS} archivos por mensaje`);
    const accepted = list.slice(0, Math.max(0, room));
    const entries: PendingFile[] = accepted.map((f) => ({
      localId: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      progress: 0,
      status: 'preparing',
      abort: new AbortController(),
    }));
    if (!entries.length) return;
    setFiles((l) => [...l, ...entries]);

    // 1) medir / comprimir  2) pedir URLs firmadas (1 request para todos)  3) subir en paralelo directo a R2.
    const prepared = await Promise.all(accepted.map(prepareFile));
    const ok = prepared
      .map((p, i) => ({ p, e: entries[i]! }))
      .filter(({ p, e }) => {
        if (p.file.size > MAX_ATTACHMENT_BYTES) {
          update(e.localId, { status: 'error', error: 'Supera 25 MB' });
          return false;
        }
        update(e.localId, { size: p.file.size, width: p.width, height: p.height, status: 'uploading' });
        return true;
      });
    if (!ok.length) return;
    let tickets: UploadTicket[];
    try {
      tickets = await api<UploadTicket[]>(`/channels/${channel.id}/attachments`, {
        method: 'POST',
        body: { files: ok.map(({ p }) => ({ filename: p.file.name, size: p.file.size, contentType: p.file.type || 'application/octet-stream' })) },
      });
    } catch (err) {
      ok.forEach(({ e }) => update(e.localId, { status: 'error', error: err instanceof Error ? err.message : 'Error' }));
      return;
    }
    await Promise.all(
      ok.map(async ({ p, e }, i) => {
        const t = tickets[i]!;
        try {
          await putToR2(t, p.file, (progress) => update(e.localId, { progress }), e.abort.signal);
          update(e.localId, { status: 'done', progress: 100, uploadId: t.uploadId });
        } catch (err) {
          if (!e.abort.signal.aborted) update(e.localId, { status: 'error', error: err instanceof Error ? err.message : 'Error' });
        }
      }),
    );
  }

  function removeFile(f: PendingFile) {
    f.abort.abort();
    if (f.preview) URL.revokeObjectURL(f.preview);
    setFiles((l) => l.filter((x) => x.localId !== f.localId));
  }

  const busy = files.some((f) => f.status === 'preparing' || f.status === 'uploading');
  const ready = files.filter((f) => f.status === 'done');

  async function send() {
    const raw = text.trim();
    if ((!raw && ready.length === 0) || !me) return;
    if (busy) {
      setNotice('Espera a que terminen de subirse los archivos');
      return;
    }
    // "@ana" → "<@id>" y ":emoji:" → "<:emoji:id>": se guarda el id (estable aunque cambie el nombre).
    const content = encodeEmojis(
      encodeMentions(raw, [...userCandidates(ctx.people), ...roleCandidates(mentionableRoles)]),
      emojis,
      ctx.serverId,
    );
    const sent = ready;
    setText('');
    setFiles((l) => l.filter((f) => f.status === 'error')); // los fallidos se quedan para reintentar/quitar
    setNotice(null);
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
      attachments: sent.map((f) => ({
        id: f.localId,
        url: f.preview ?? '',
        filename: f.name,
        contentType: f.type,
        size: f.size,
        width: f.width ?? null,
        height: f.height ?? null,
      })),
      reactions: [],
      nonce,
      pending: true,
    };
    upsertMessage(qc, optimistic);
    try {
      const saved = await api<MessageDto>(`/channels/${channel.id}/messages`, {
        method: 'POST',
        body: {
          content,
          nonce,
          ...(replyTo ? { replyToId: replyTo.id } : {}),
          attachments: sent.map((f) => ({ uploadId: f.uploadId, width: f.width, height: f.height })),
        },
      });
      upsertMessage(qc, { ...saved, nonce });
    } catch {
      patchMessage(qc, channel.id, optimistic.id, { failed: true });
    } finally {
      // La imagen real ya viene del CDN: liberar las previsualizaciones locales tras un momento.
      setTimeout(() => sent.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), 10_000);
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

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = [...e.clipboardData.files];
    if (pasted.length && ctx.canAttach) {
      e.preventDefault();
      void addFiles(pasted);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) void addFiles([...e.dataTransfer.files]);
  }

  return (
    <div
      className={`relative rounded-lg bg-surface-3 ${dragging ? 'ring-2 ring-accent' : ''}`}
      onDragOver={(e) => {
        if (ctx.canAttach && !disabled && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={onDrop}
    >
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
      {picker && (
        <div className="absolute right-0 bottom-full z-20 mb-2">
          <Suspense fallback={<div className="h-[22rem] w-[22rem] rounded-lg bg-surface-1 shadow-2xl" />}>
            <EmojiPicker
              serverId={ctx.serverId}
              onClose={() => setPicker(false)}
              onPick={(em) => {
                setPicker(false);
                const before = text.slice(0, caret);
                const pad = before && !/\s$/.test(before) && em.name ? ' ' : '';
                insertAt(`${before}${pad}${em.text}${em.name ? ' ' : ''}`, text.slice(caret));
              }}
            />
          </Suspense>
        </div>
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
      {files.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto border-b border-surface-0/60 p-3" aria-label="Archivos adjuntos">
          {files.map((f) => (
            <li key={f.localId} className="relative w-28 shrink-0 rounded-md bg-surface-1 p-1.5" title={f.error ?? f.name}>
              <button
                type="button"
                aria-label={`Quitar ${f.name}`}
                onClick={() => removeFile(f)}
                className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-danger text-xs text-white"
              >
                ✕
              </button>
              <div className="grid h-20 place-items-center overflow-hidden rounded bg-surface-0">
                {f.preview ? <img src={f.preview} alt="" className="h-full w-full object-cover" /> : <span className="text-3xl">📄</span>}
              </div>
              <div className="mt-1 truncate text-xs">{f.name}</div>
              <div className={`text-[0.65rem] ${f.status === 'error' ? 'text-danger' : 'text-fg-subtle'}`}>
                {f.status === 'error' ? f.error : f.status === 'done' ? formatBytes(f.size) : f.status === 'preparing' ? 'Preparando…' : `${f.progress}%`}
              </div>
              {f.status === 'uploading' && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-surface-0">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${f.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {notice && <p className="px-4 pt-2 text-xs text-warn">{notice}</p>}
      <div className="flex items-end">
        {ctx.canAttach && !disabled && (
          <>
            <button
              type="button"
              title="Adjuntar archivos"
              aria-label="Adjuntar archivos"
              onClick={() => fileInput.current?.click()}
              className="grid h-12 w-11 shrink-0 place-items-center text-xl text-fg-muted hover:text-fg"
            >
              ⊕
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void addFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </>
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
          onPaste={onPaste}
          disabled={disabled}
          rows={Math.min(10, text.split('\n').length)}
          maxLength={4000}
          placeholder={disabled ? 'No tienes permiso para enviar mensajes aquí' : `Enviar mensaje a ${placeholderName}`}
          aria-label="Mensaje"
          aria-autocomplete="list"
          className={`block max-h-60 w-full resize-none bg-transparent py-3 pr-2 text-[0.95rem] outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed ${
            ctx.canAttach && !disabled ? '' : 'pl-4'
          }`}
        />
        {!disabled && (
          <button
            type="button"
            title="Emojis"
            aria-label="Emojis"
            aria-expanded={picker}
            // stopPropagation: si no, el "clic fuera" del selector lo cerraría y este clic lo reabriría.
            onMouseDown={(e) => (e.preventDefault(), e.stopPropagation())}
            onClick={() => setPicker((p) => !p)}
            className="grid h-12 w-11 shrink-0 place-items-center text-xl grayscale hover:grayscale-0"
          >
            😀
          </button>
        )}
      </div>
    </div>
  );
}
