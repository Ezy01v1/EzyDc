import type { ChannelDto, MessageDto } from '@ezydc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type KeyboardEvent, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { displayName } from '../../../lib/format';
import { getSocket } from '../../../lib/socket';
import { useAuth } from '../../../stores/auth';
import { useLive } from '../../../stores/live';
import { patchMessage, upsertMessage } from '../messageCache';

const TYPING_EVERY_MS = 3_000;

export function Composer({ channel, disabled }: { channel: ChannelDto; disabled: boolean }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const replyTo = useLive((s) => s.replyTo);
  const [text, setText] = useState('');
  const lastTyping = useRef(0);

  async function send() {
    const content = text.trim();
    if (!content || !me) return;
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
    <div className="rounded-lg bg-surface-3">
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
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={Math.min(10, text.split('\n').length)}
        maxLength={4000}
        placeholder={disabled ? 'No tienes permiso para enviar mensajes aquí' : `Enviar mensaje a #${channel.name}`}
        aria-label="Mensaje"
        className="block max-h-60 w-full resize-none bg-transparent px-4 py-3 text-[0.95rem] outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
      />
    </div>
  );
}
