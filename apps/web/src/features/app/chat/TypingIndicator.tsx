import { useEffect, useState } from 'react';
import { useLive } from '../../../stores/live';

export function TypingIndicator({ channelId }: { channelId: string }) {
  const typing = useLive((s) => s.typing[channelId]);
  const [now, setNow] = useState(() => Date.now());

  // Solo hay temporizador mientras alguien escribe.
  const hasAny = !!typing && Object.keys(typing).length > 0;
  useEffect(() => {
    if (!hasAny) return;
    const t = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(t);
  }, [hasAny]);

  const names = typing ? Object.values(typing).filter((t) => t.until > now).map((t) => t.name) : [];
  if (names.length === 0) return <div className="h-5" />;
  const label =
    names.length === 1
      ? `${names[0]} está escribiendo…`
      : names.length <= 3
        ? `${names.join(', ')} están escribiendo…`
        : 'Varias personas están escribiendo…';
  return <div className="h-5 truncate text-xs text-fg-muted">{label}</div>;
}
