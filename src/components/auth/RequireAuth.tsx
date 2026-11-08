import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import type { AppRole } from '@/types';

/** Loading indicator while the session is being checked. */
export function AuthLoading() {
  return (
    <nldd-simple-section>
      <nldd-container min-height="12rem">
        <nldd-activity-indicator show-text text="Bezig met laden"></nldd-activity-indicator>
      </nldd-container>
    </nldd-simple-section>
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
