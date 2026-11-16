import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // El socket mantiene los datos frescos: no refetch al enfocar la ventana.
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

export const qk = {
  servers: ['servers'] as const,
  server: (id: string) => ['server', id] as const,
  members: (id: string) => ['members', id] as const,
  messages: (channelId: string) => ['messages', channelId] as const,
};
