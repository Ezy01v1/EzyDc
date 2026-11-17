import type { UserSelf } from '@ezydc/shared';
import { lazy, type ReactNode, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';
import { Splash } from './components/Splash';
import { api, ApiError } from './lib/api';
import { lastUser, rememberUser, startOfflineCache } from './lib/offline';
import { registerServiceWorker, syncPush } from './lib/push';
import { queryClient } from './lib/queryClient';
import { useAuth } from './stores/auth';

// Code splitting por ruta: el login no descarga la app y viceversa.
const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/RegisterPage'));
const AppLayout = lazy(() => import('./features/app/AppLayout'));
const InvitePage = lazy(() => import('./features/invite/InvitePage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const loc = useLocation();
  if (status === 'anon') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  if (status === 'authed') return <Navigate to="/channels" replace />;
  return <>{children}</>;
}

const withSuspense = (node: ReactNode) => <Suspense fallback={<Splash />}>{node}</Suspense>;

const router = createBrowserRouter([
  { path: '/login', element: withSuspense(<GuestOnly><LoginPage /></GuestOnly>) },
  { path: '/register', element: withSuspense(<GuestOnly><RegisterPage /></GuestOnly>) },
  { path: '/invite/:code', element: withSuspense(<RequireAuth><InvitePage /></RequireAuth>) },
  { path: '/channels/:serverId?/:channelId?', element: withSuspense(<RequireAuth><AppLayout /></RequireAuth>) },
  { path: '*', element: <Navigate to="/channels" replace /> },
]);

registerServiceWorker((url) => void router.navigate(url));

// Al iniciar sesión (o arrancar con sesión): caché local de esta cuenta + reenganche de push.
// (Desde el login la caché arranca aquí; al abrir la app con sesión ya viene arrancada: es idempotente.)
let sessionFor: string | null = null;
useAuth.subscribe((s) => {
  rememberUser(s.user);
  if (s.user && s.user.id !== sessionFor) {
    sessionFor = s.user.id;
    void startOfflineCache(queryClient, s.user.id);
    void syncPush();
  }
  if (!s.user) sessionFor = null;
});

export function App() {
  const status = useAuth((s) => s.status);
  const setUser = useAuth((s) => s.setUser);

  useEffect(() => {
    // Con un tope de 1 s la caché local nunca retrasa el arranque de forma apreciable.
    const withCache = (u: UserSelf) =>
      Promise.race([startOfflineCache(queryClient, u.id), new Promise((r) => setTimeout(r, 1000))]).then(() => setUser(u));
    api<UserSelf>('/auth/me')
      .then(withCache)
      .catch((e) => {
        // Sin red (no un 401): abrir con lo guardado de la última cuenta; el socket reconectará.
        const cached = lastUser();
        if (!(e instanceof ApiError) && cached) void withCache(cached);
        else setUser(null);
      });
  }, [setUser]);

  if (status === 'loading') return <Splash />;
  return <RouterProvider router={router} />;
}
