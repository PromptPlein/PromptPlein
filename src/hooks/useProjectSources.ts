import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Projectcontext voor de bouwstappen, met de passages uit de bronbestanden die
 * bij de opdracht passen.
 *
 * `projectContext` is de vaste analyse van het project. `projectSources` zoekt
 * daar per opdracht de passende passages bij (zie `withGeneratorSources` in
 * chatProjectService). `resolve` wacht op dat zoeken, zodat de eerste stap de
 * passages al heeft; `current` is wat de laatste stap kreeg, voor de
 * onderdelen die zelf aanroepen doen (de vragenronde, "Vul verder aan").
 *
 * Wisselt het project of de bronkeuze, dan vervalt `current`: de passages bij de
 * oude keuze horen niet bij de nieuwe.
 */
export function useProjectSources(
  projectContext: string | undefined,
  projectSources: ((task: string) => Promise<string | undefined>) | undefined,
) {
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const latest = useRef(projectContext);

  useEffect(() => {
    latest.current = projectContext;
    setCurrent(undefined);
  }, [projectContext]);

  const resolve = useCallback(
    async (task: string): Promise<string | undefined> => {
      const base = latest.current;
      if (!base || !projectSources) return base;
      const sourced = await projectSources(task);
      // Is het project intussen losgekoppeld of gewisseld, dan geldt het nieuwe.
      if (latest.current !== base) return latest.current;
      setCurrent(sourced);
      return sourced;
    },
    [projectSources],
  );

  return { resolve, current: projectContext ? (current ?? projectContext) : undefined };
}
