import type { DmChannelDto, ServerListItem } from '@ezydc/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { mentionCount, useReadIndex } from '../../lib/unread';

/** "(3) ezyDC": menciones pendientes en la pestaña del navegador. */
export function useUnreadTitle(servers: ServerListItem[] | undefined): void {
  const idx = useReadIndex();
  const { data: dms = [] } = useQuery({ queryKey: qk.dms, queryFn: () => api<DmChannelDto[]>('/users/me/channels') });
  const total = (servers ?? []).reduce((n, s) => n + s.mentions, 0) + dms.reduce((n, d) => n + mentionCount(idx, d.id), 0);
  useEffect(() => {
    document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ezyDC` : 'ezyDC';
  }, [total]);
}
