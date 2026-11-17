import type { EmojiDto, PublicConfig } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Base pública de R2 (se rellena al cargar /config). Emoji personalizado = `${cdn}/emojis/<id>`. */
let cdnBase: string | null = null;
export const customEmojiUrl = (id: string) => (cdnBase ? `${cdnBase}/emojis/${id}` : null);

export function usePublicConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const c = await api<PublicConfig>('/config');
      cdnBase = c.cdnUrl;
      return c;
    },
    staleTime: Infinity,
  });
}

export const emojisKey = ['emojis'] as const;

/** Emojis personalizados de todos mis servidores (un solo request, cacheado). */
export function useMyEmojis() {
  return useQuery({ queryKey: emojisKey, queryFn: () => api<EmojiDto[]>('/users/me/emojis'), staleTime: 5 * 60_000 });
}

/** ":nombre:" → "<:nombre:id>" (el id es lo que se guarda: estable aunque se renombre). */
export function encodeEmojis(text: string, emojis: EmojiDto[], preferServer: string | null): string {
  if (!emojis.length) return text;
  return text.replace(/(^|[^<\w]):(\w{2,32}):/g, (all, pre: string, name: string) => {
    const e = emojis.find((x) => x.name === name && x.serverId === preferServer) ?? emojis.find((x) => x.name === name);
    return e ? `${pre}<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : all;
  });
}

/** Inverso para editar: "<:nombre:id>" → ":nombre:". */
export const decodeEmojis = (text: string) => text.replace(/<a?:(\w{2,32}):[0-9a-f-]{36}>/g, ':$1:');
