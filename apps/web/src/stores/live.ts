import type { MessageDto, PresenceStatus } from '@ezydc/shared';
import { create } from 'zustand';

/** Estado efímero de tiempo real (no viene de REST, no se cachea). */
interface LiveState {
  /** channelId → userId → { nombre, caduca } */
  typing: Record<string, Record<string, { name: string; until: number }>>;
  presence: Record<string, PresenceStatus>;
  latencyMs: number | null;
  connected: boolean;
  replyTo: MessageDto | null;
  mobileSidebar: boolean;

  setTyping: (channelId: string, userId: string, name: string) => void;
  clearTyping: (channelId: string, userId: string) => void;
  setPresence: (userId: string, s: PresenceStatus) => void;
  set: (p: Partial<Pick<LiveState, 'latencyMs' | 'connected' | 'replyTo' | 'mobileSidebar'>>) => void;
}

export const useLive = create<LiveState>((set) => ({
  typing: {},
  presence: {},
  latencyMs: null,
  connected: false,
  replyTo: null,
  mobileSidebar: false,

  setTyping: (channelId, userId, name) =>
    set((s) => ({
      typing: { ...s.typing, [channelId]: { ...s.typing[channelId], [userId]: { name, until: Date.now() + 8_000 } } },
    })),
  clearTyping: (channelId, userId) =>
    set((s) => {
      const ch = s.typing[channelId];
      if (!ch?.[userId]) return s;
      const { [userId]: _, ...rest } = ch;
      return { typing: { ...s.typing, [channelId]: rest } };
    }),
  setPresence: (userId, status) => set((s) => ({ presence: { ...s.presence, [userId]: status } })),
  set: (p) => set(p),
}));
