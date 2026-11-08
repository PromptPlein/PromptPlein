// De projectenlijst van de chatpagina: laden, aanmaken, bijwerken, verwijderen.
//
// Bewust een dunne hook rond {@link chatProjectService} en niet nóg een
// cachelaag: de zijbalk moet direct kloppen na een wijziging, dus elke actie
// werkt de lijst in state bij met wat de database teruggaf.

import { useCallback, useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import {
  createProject,
  deleteProject,
  invalidateProjectContext,
  listProjects,
  updateProject,
} from '@/services/chatProjectService';
import type { ChatProject } from '@/types';

export interface ChatProjectsController {
  projects: ChatProject[];
  loading: boolean;
  /** Maak een project en geef het terug (null bij een fout). */
  create: (name: string) => Promise<ChatProject | null>;
  /** Werk naam en/of projectinstructie bij. */
  update: (id: string, patch: { name?: string; instructions?: string }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  /** Herlaad de lijst, bijv. nadat er een bestand bij is gekomen. */
  refresh: () => void;
}

export default function useChatProjects(): ChatProjectsController {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    // Uitgelogd: alles weg. De contextcache mee, anders zou een volgende
    // gebruiker op dit apparaat de bronnen van de vorige in zijn gesprek kunnen
    // krijgen.
    if (!userId) {
      setProjects([]);
      invalidateProjectContext();
      return;
    }
    let active = true;
    setLoading(true);
    listProjects()
      .then((list) => {
        if (active) setProjects(list);
      })
      .catch(() => {
        if (active) notify.error('De projecten konden niet worden geladen.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, tick]);

  const create = useCallback(
    async (name: string): Promise<ChatProject | null> => {
      if (!userId) return null;
      try {
        const project = await createProject({ userId, name });
        setProjects((cur) => [project, ...cur]);
        return project;
      } catch {
        notify.error('Het project kon niet worden aangemaakt.');
        return null;
      }
    },
    [userId],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; instructions?: string }): Promise<boolean> => {
      try {
        const project = await updateProject(id, patch);
        // fileCount komt niet mee uit de update-query; behoud wat we al wisten,
        // anders springt de telling in de zijbalk naar 0 tot de volgende load.
        setProjects((cur) =>
          cur.map((p) => (p.id === id ? { ...project, fileCount: p.fileCount } : p)),
        );
        return true;
      } catch {
        notify.error('Het project kon niet worden opgeslagen.');
        return false;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteProject(id);
      setProjects((cur) => cur.filter((p) => p.id !== id));
      return true;
    } catch {
      notify.error('Het project kon niet worden verwijderd.');
      return false;
    }
  }, []);

  return { projects, loading, create, update, remove, refresh };
}
