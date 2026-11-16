import type { UserSelf } from '@ezydc/shared';
import { create } from 'zustand';

interface AuthState {
  user: UserSelf | null;
  status: 'loading' | 'authed' | 'anon';
  setUser: (user: UserSelf | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: user ? 'authed' : 'anon' }),
}));
