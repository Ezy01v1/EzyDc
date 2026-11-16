const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `Hoy a las ${timeFmt.format(d)}` : dateFmt.format(d);
}

export function shortTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function initials(name: string): string {
  return name
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Color estable por id (avatares sin imagen). */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

export const displayName = (u: { displayName: string | null; username: string } | null): string =>
  u ? (u.displayName ?? u.username) : 'Usuario eliminado';
