import type { UserSelf } from '@ezydc/shared';
import { lazy, type ReactNode, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router';
import { Splash } from './components/Splash';
import { api } from './lib/api';
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

export function App() {
  const status = useAuth((s) => s.status);
  const setUser = useAuth((s) => s.setUser);

  useEffect(() => {
    api<UserSelf>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, [setUser]);

  if (status === 'loading') return <Splash />;
  return <RouterProvider router={router} />;
}
