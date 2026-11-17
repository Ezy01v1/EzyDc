import type { MessageDto } from '@ezydc/shared';
import { type InfiniteData, type QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';

export const PAGE_SIZE = 50;

/** Mensaje local aún no confirmado por el servidor. */
export type ClientMessage = MessageDto & { pending?: boolean; failed?: boolean };
/** pages[0] = página más reciente; pages[n] = más antiguas. Cada página en orden ascendente. */
export type MessagePages = InfiniteData<ClientMessage[], string | undefined>;

export function useMessages(channelId: string) {
  return useInfiniteQuery({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam, signal }) =>
      api<ClientMessage[]>(
        `/channels/${channelId}/messages?limit=${PAGE_SIZE}${pageParam ? `&before=${pageParam}` : ''}`,
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[0]?.id : undefined),
    staleTime: Infinity, // el socket y la sincronización incremental lo mantienen al día
    gcTime: 5 * 60_000,
  });
}

/** Inserta o reemplaza (por id o por nonce del envío optimista). */
export function upsertMessage(qc: QueryClient, m: ClientMessage): void {
  qc.setQueryData<MessagePages>(qk.messages(m.channelId), (d) => {
    if (!d) return d;
    let found = false;
    const pages = d.pages.map((p) =>
      p.map((x) => {
        if (x.id === m.id || (m.nonce && x.nonce === m.nonce)) {
          found = true;
          return { ...m, nonce: x.nonce ?? m.nonce, pending: false };
        }
        return x;
      }),
    );
    if (!found) pages[0] = [...(pages[0] ?? []), m];
    return { ...d, pages };
  });
}

export function patchMessage(qc: QueryClient, channelId: string, id: string, patch: Partial<ClientMessage>): void {
  qc.setQueryData<MessagePages>(qk.messages(channelId), (d) =>
    d ? { ...d, pages: d.pages.map((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))) } : d,
  );
}

export function removeMessage(qc: QueryClient, channelId: string, id: string): void {
  qc.setQueryData<MessagePages>(qk.messages(channelId), (d) =>
    d ? { ...d, pages: d.pages.map((p) => p.filter((x) => x.id !== id)) } : d,
  );
}

export function lastConfirmedId(qc: QueryClient, channelId: string): string | undefined {
  const d = qc.getQueryData<MessagePages>(qk.messages(channelId));
  const latest = d?.pages[0]?.filter((m) => !m.pending);
  return latest?.[latest.length - 1]?.id;
}

/**
 * Suma/resta una reacción de forma idempotente: la versión optimista y el eco del socket
 * (que también llega a mis otras pestañas) no cuentan dos veces.
 */
export function applyReaction(
  qc: QueryClient,
  channelId: string,
  messageId: string,
  emoji: string,
  add: boolean,
  isMe: boolean,
  extra: { url?: string; name?: string } = {},
): void {
  qc.setQueryData<MessagePages>(qk.messages(channelId), (d) => {
    if (!d) return d;
    return {
      ...d,
      pages: d.pages.map((p) =>
        p.map((m) => {
          if (m.id !== messageId) return m;
          const list = m.reactions ?? [];
          const r = list.find((x) => x.emoji === emoji);
          if (add) {
            if (r && isMe && r.me) return m;
            const reactions = r
              ? list.map((x) => (x === r ? { ...x, count: x.count + 1, me: x.me || isMe } : x))
              : [...list, { emoji, count: 1, me: isMe, ...extra }];
            return { ...m, reactions };
          }
          if (!r || (isMe && !r.me)) return m;
          const reactions = list
            .map((x) => (x === r ? { ...x, count: x.count - 1, me: isMe ? false : x.me } : x))
            .filter((x) => x.count > 0);
          return { ...m, reactions };
        }),
      ),
    };
  });
}
