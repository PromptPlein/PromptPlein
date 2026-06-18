import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { AppRole } from '@/types';

/** Eenvoudige laad-indicator terwijl de sessie wordt gecontroleerd. */
function AuthLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-slate-500">
      Bezig met laden…
    </div>
  );
}

/**
 * Routebeveiliging: vereist een ingelogde gebruiker en optioneel een minimale
 * rol. Gebruik als wrapper-route met <Outlet/>-kinderen.
 */
export default function RequireAuth({ role }: { role?: AppRole }) {
  const { loading, isAuthenticated, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }

  if (role && !hasRole(role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
