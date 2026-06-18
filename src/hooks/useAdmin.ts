import { useCallback, useState } from 'react';
import { adminLogin, adminLogout, isAdminAuthenticated } from '@/services/adminService';

/** Lichtgewicht admin-sessiebeheer (token-gebaseerd). */
export function useAdmin() {
  const [authenticated, setAuthenticated] = useState(isAdminAuthenticated());

  const login = useCallback((token: string): boolean => {
    const ok = adminLogin(token);
    setAuthenticated(ok || isAdminAuthenticated());
    return ok;
  }, []);

  const logout = useCallback(() => {
    adminLogout();
    setAuthenticated(false);
  }, []);

  return { authenticated, login, logout };
}
