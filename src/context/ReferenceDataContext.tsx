import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getCategories, getRoles, getTechniques } from '@/services/repository';
import type { Category, Role, Technique } from '@/types';

interface ReferenceData {
  roles: Role[];
  categories: Category[];
  techniques: Technique[];
  loading: boolean;
  refresh: () => Promise<void>;
  roleById: (id?: string | null) => Role | undefined;
  categoryById: (id?: string | null) => Category | undefined;
  techniqueById: (id?: string | null) => Technique | undefined;
}

const ReferenceDataContext = createContext<ReferenceData | null>(null);

export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [r, c, t] = await Promise.all([getRoles(), getCategories(), getTechniques()]);
    setRoles(r);
    setCategories(c);
    setTechniques(t);
  }, []);

  useEffect(() => {
    let active = true;
    refresh().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);

  const value = useMemo<ReferenceData>(
    () => ({
      roles,
      categories,
      techniques,
      loading,
      refresh,
      roleById: (id) => roles.find((r) => r.id === id),
      categoryById: (id) => categories.find((c) => c.id === id),
      techniqueById: (id) => techniques.find((t) => t.id === id),
    }),
    [roles, categories, techniques, loading, refresh],
  );

  return <ReferenceDataContext.Provider value={value}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceData(): ReferenceData {
  const ctx = useContext(ReferenceDataContext);
  if (!ctx) throw new Error('useReferenceData moet binnen ReferenceDataProvider gebruikt worden');
  return ctx;
}
