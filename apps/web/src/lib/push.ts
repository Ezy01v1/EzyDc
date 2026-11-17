import type { PublicConfig } from '@ezydc/shared';
import { api } from './api';

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Registra el service worker (caché offline + push). En Safari iOS solo funciona instalada en inicio. */
export function registerServiceWorker(onNavigate: (url: string) => void): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
  // Pulsar una notificación con la app abierta: el SW pide navegar sin recargar.
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; url?: string }>) => {
    if (e.data?.type === 'navigate' && e.data.url) {
      const u = new URL(e.data.url);
      if (u.origin === location.origin) onNavigate(u.pathname + u.search);
    }
  });
}

function keyToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function vapidKey(): Promise<string | null> {
  return (await api<PublicConfig>('/config')).vapidPublicKey;
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (!(await vapidKey())) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const toBody = (sub: PushSubscription) => {
  const j = sub.toJSON();
  return { endpoint: j.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } };
};

/** Pide permiso (debe llamarse desde un clic) y registra este navegador en la API. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const key = await vapidKey();
  if (!key) return 'unconfigured';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  // register() falla rápido si el navegador no admite SW (en vez de esperar para siempre a `.ready`).
  await navigator.serviceWorker.register('/sw.js').catch(() => {
    throw new Error('Este navegador no permite el service worker necesario para las notificaciones.');
  });
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('El service worker no se activó a tiempo; recarga e inténtalo de nuevo.')), 10_000)),
  ]);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
  await api('/users/me/push-subscriptions', { method: 'POST', body: toBody(sub) });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/users/me/push-subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return 'off';
}

/**
 * Al arrancar sesión: si este navegador ya estaba suscrito, se vuelve a enlazar con el usuario
 * actual (por si cambió de cuenta o la API perdió la suscripción).
 */
export async function syncPush(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api('/users/me/push-subscriptions', { method: 'POST', body: toBody(sub) }).catch(() => {});
}

/** Al cerrar sesión: que este navegador deje de recibir avisos de esa cuenta. */
export async function dropPushOnLogout(): Promise<void> {
  await disablePush().catch(() => {});
}
