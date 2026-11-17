const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  return document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1] ?? '';
}

/** Un único refresh en vuelo aunque fallen varias peticiones a la vez. */
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-csrf-token': csrfToken() },
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_RETRY = new Set(['/auth/login', '/auth/login/2fa', '/auth/register', '/auth/refresh', '/auth/logout']);

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** fetch tipado: cookies + CSRF + refresh transparente ante 401. */
export async function api<T>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    signal: opts.signal,
    headers: {
      'x-csrf-token': csrfToken(),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && retry && !NO_RETRY.has(path) && (await refreshSession())) {
    return api<T>(path, opts, false);
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      /* sin cuerpo */
    }
    const msg = (body as { message?: unknown } | undefined)?.message;
    throw new ApiError(res.status, typeof msg === 'string' ? msg : res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
