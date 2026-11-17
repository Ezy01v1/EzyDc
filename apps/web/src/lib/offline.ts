import type { UserSelf } from '@ezydc/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Caché local en IndexedDB (una base por usuario) para que la app abra al instante y siga
 * mostrando lo último visto sin red. La red siempre manda: lo guardado se marca como viejo y
 * se refresca en cuanto hay conexión. Se borra al cerrar sesión.
 */

const STORE = 'q';
const MAX_CHANNELS = 30; // canales con mensajes guardados (los más recientes)
const MAX_MESSAGES = 50;
const LAST_USER = 'ezydc:last-user';

interface Row {
  key: string;
  data: unknown;
  savedAt: number;
}

const dbName = (userId: string) => `ezydc-cache-${userId}`;

function open(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(userId), 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/** Qué consultas merece la pena guardar, y con qué clave. */
function storageKey(qk: QueryKey): string | null {
  const [a, b] = qk as [string, string | undefined];
  if (a === 'servers' || a === 'dms' || a === 'readStates' || a === 'emojis') return b === undefined ? a : null;
  if ((a === 'server' || a === 'members' || a === 'messages') && typeof b === 'string') return `${a}:${b}`;
  return null;
}

/** Mensajes guardados por canal: se usan como placeholderData (se ven al instante, se refrescan detrás). */
const messageSeed = new Map<string, unknown[]>();
export const seededMessages = (channelId: string) => messageSeed.get(channelId);

let db: IDBDatabase | null = null;
let unsubscribe: (() => void) | null = null;
let started: { userId: string; ready: Promise<void> } | null = null;

/** Carga lo guardado en la caché de TanStack Query y empieza a persistir los cambios (idempotente). */
export function startOfflineCache(qc: QueryClient, userId: string): Promise<void> {
  if (!('indexedDB' in window)) return Promise.resolve();
  if (started?.userId === userId) return started.ready;
  started = { userId, ready: start(qc, userId) };
  return started.ready;
}

async function start(qc: QueryClient, userId: string): Promise<void> {
  try {
    db = await open(userId);
    const tx = db.transaction(STORE, 'readonly');
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result as Row[]);
      r.onerror = () => reject(r.error);
    });
    const msgRows = rows.filter((r) => r.key.startsWith('messages:')).sort((x, y) => y.savedAt - x.savedAt);
    for (const r of msgRows.slice(0, MAX_CHANNELS)) messageSeed.set(r.key.slice(9), r.data as unknown[]);
    const stale = msgRows.slice(MAX_CHANNELS).map((r) => r.key);
    if (stale.length) {
      const del = db.transaction(STORE, 'readwrite');
      stale.forEach((k) => del.objectStore(STORE).delete(k));
    }
    for (const r of rows) {
      if (r.key.startsWith('messages:')) continue;
      const [a, b] = r.key.split(':');
      // updatedAt: 1 → dato "viejo": se muestra ya y TanStack lo refetch-ea al montar.
      qc.setQueryData(b ? [a, b] : [a], r.data, { updatedAt: 1 });
    }
  } catch {
    db = null; // modo privado / cuota: la app funciona igual sin caché local
    return;
  }

  const timers = new Map<string, number>();
  unsubscribe = qc.getQueryCache().subscribe((ev) => {
    if (ev.type !== 'updated' || ev.action.type !== 'success') return;
    const key = storageKey(ev.query.queryKey);
    if (!key || !db) return;
    window.clearTimeout(timers.get(key));
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key);
        let data = ev.query.state.data;
        if (key.startsWith('messages:')) {
          // Solo la página más reciente, sin mensajes optimistas pendientes.
          const pages = (data as { pages?: { pending?: boolean }[][] } | undefined)?.pages;
          data = (pages?.[0] ?? []).filter((m) => !m.pending).slice(-MAX_MESSAGES);
        }
        try {
          db?.transaction(STORE, 'readwrite').objectStore(STORE).put({ key, data, savedAt: Date.now() } satisfies Row);
        } catch {
          /* base cerrada (logout) */
        }
      }, 800),
    );
  });
}

/** Usuario recordado para poder abrir la app sin red (solo su perfil público y email propio). */
export function rememberUser(u: UserSelf | null): void {
  try {
    if (u) localStorage.setItem(LAST_USER, JSON.stringify(u));
    else localStorage.removeItem(LAST_USER);
  } catch {
    /* sin almacenamiento */
  }
}

export function lastUser(): UserSelf | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    return raw ? (JSON.parse(raw) as UserSelf) : null;
  } catch {
    return null;
  }
}

/** Cerrar sesión: borra todo lo guardado de esta cuenta en el navegador. */
export async function clearOfflineCache(userId: string): Promise<void> {
  unsubscribe?.();
  unsubscribe = null;
  started = null;
  db?.close();
  db = null;
  messageSeed.clear();
  rememberUser(null);
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(dbName(userId));
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
