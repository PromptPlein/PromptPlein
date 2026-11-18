import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { trackVisit } from '@/services/analyticsService';

/**
 * Meldt één bezoek per dag per browser, en nog een keer als iemand die dag
 * inlogt. Wacht tot de sessie bekend is, anders telt elke ingelogde gebruiker
 * eerst als anoniem.
 */
export default function VisitTracker() {
  const { user, loading } = useAuth();
  const ingelogd = Boolean(user);
  useEffect(() => {
    if (!loading) trackVisit(ingelogd);
  }, [loading, ingelogd]);
  return null;
}
