import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';

/**
 * Geeft een functie terug die controleert of de gebruiker is ingelogd.
 * Zo niet (en er is een echte backend), dan toont hij een melding en stuurt
 * door naar de inlogpagina — zodat schrijfacties niet stil falen op RLS.
 * Retourneert `true` als de actie door mag, anders `false`.
 */
export function useAuthGuard() {
  const { isAuthenticated, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (message = 'Log in om deze actie uit te voeren.'): boolean => {
      // Mock-modus (geen Supabase) → niets blokkeren.
      if (!configured) return true;
      if (isAuthenticated) return true;
      notify.error(message);
      navigate('/auth/login', { state: { from: location.pathname } });
      return false;
    },
    [configured, isAuthenticated, navigate, location.pathname],
  );
}
