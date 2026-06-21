import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import * as authService from '@/services/authService';
import { fetchMyModeratorOrgIds } from '@/services/orgService';
import type { AppRole, Profile } from '@/types';

interface AuthContextValue {
  /** Is er een echte Auth-backend? Zo niet, dan is de app in mock-modus. */
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  /** Rang-gebaseerde check: 'admin' matcht ook 'super_admin'. */
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  /** Is de gebruiker moderator van ten minste één organisatie? */
  isModerator: boolean;
  /** De organisatie-id's waarvan de gebruiker moderator is. */
  moderatorOrgIds: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: {
    email: string;
    password: string;
    fullName?: string;
    organizationId?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ROLE_RANK: Record<AppRole, number> = { user: 0, admin: 1, super_admin: 2 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [moderatorOrgIds, setModeratorOrgIds] = useState<string[]>([]);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setModeratorOrgIds([]);
      return;
    }
    try {
      // Profiel en moderator-koppelingen parallel laden.
      const [prof, modOrgs] = await Promise.all([
        authService.fetchProfile(userId),
        fetchMyModeratorOrgIds(userId).catch(() => [] as string[]),
      ]);
      setProfile(prof);
      setModeratorOrgIds(modOrgs);
    } catch {
      setProfile(null);
      setModeratorOrgIds([]);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    await authService.signIn(email, password);
  }, []);

  const signUp = useCallback(
    async (params: {
      email: string;
      password: string;
      fullName?: string;
      organizationId?: string;
    }) => {
      await authService.signUp(params);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSession(null);
    setProfile(null);
    setModeratorOrgIds([]);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user.id);
  }, [loadProfile, session?.user.id]);

  const value = useMemo<AuthContextValue>(() => {
    const role = profile?.role ?? 'user';
    return {
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      isAuthenticated: Boolean(session),
      hasRole: (required: AppRole) => Boolean(session) && ROLE_RANK[role] >= ROLE_RANK[required],
      isAdmin: Boolean(session) && ROLE_RANK[role] >= ROLE_RANK.admin,
      isModerator: Boolean(session) && moderatorOrgIds.length > 0,
      moderatorOrgIds,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    };
  }, [loading, session, profile, moderatorOrgIds, signIn, signUp, signOut, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth moet binnen <AuthProvider> gebruikt worden.');
  return ctx;
}
