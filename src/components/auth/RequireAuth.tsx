import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { AppRole } from '@/types';

/** Eenvoudige laad-indicator terwijl de sessie wordt gecontroleerd. */
export function AuthLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-slate-500">
      Bezig met laden…
    </div>
  );
}

/**
 * Routebeveiliging: vereist een ingelogde gebruiker en optioneel een minimale
 * rol. Gebruik als wrapper-route met <Outlet/>-kinderen.
 *
 * `allowModerator`: sta de route ook toe voor moderatoren (gebruikers met een
 * koppeling in organization_moderators), ook al hebben zij niet de gevraagde
 * rol. Zo kan de goedkeuringswachtrij gedeeld worden door admins én moderatoren.
 */
export default function RequireAuth({
  role,
  allowModerator = false,
}: {
  role?: AppRole;
  allowModerator?: boolean;
}) {
  const { loading, isAuthenticated, hasRole, isModerator } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  }

  if (role && !hasRole(role)) {
    // Moderatoren mogen erin als de route dat expliciet toestaat.
    if (allowModerator && isModerator) return <Outlet />;
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
