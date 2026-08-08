// Handoffs tussen de chat en de generator, via sessionStorage. Zelfde patroon
// als de chat-handoff in chatService.ts: sessionStorage in plaats van
// router-state overleeft de login-roundtrip van RequireAuth in dezelfde tab en
// lekt niet naar andere tabs. wipeAllChatStorage wist deze keys bij uitloggen.

import { CHAT_PREFIX } from '@/lib/chatStorage';
import type { OptimizeResult } from '@/types';

const TTL_MS = 15 * 60 * 1000;

// --- Omgekeerde handoff: chat → generator ("Verbeter in generator") ---

const GENERATOR_HANDOFF_KEY = `${CHAT_PREFIX}generator-handoff`;

/** Zet een chatbericht klaar als startpunt voor de eigen-prompt-flow. */
export function writeGeneratorHandoff(prompt: string): void {
  try {
    sessionStorage.setItem(GENERATOR_HANDOFF_KEY, JSON.stringify({ prompt, createdAt: Date.now() }));
  } catch {
    /* sessieopslag niet beschikbaar — de generator opent dan gewoon leeg */
  }
}

/** Lees en verwijder het klaargezette startpunt; verlopen of ongeldig -> null. */
export function consumeGeneratorHandoff(): string | null {
  try {
    const raw = sessionStorage.getItem(GENERATOR_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GENERATOR_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { prompt?: unknown; createdAt?: unknown };
    if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > TTL_MS) return null;
    return parsed.prompt;
  } catch {
    return null;
  }
}

// --- Project → generator ("Genereer prompt" op de projectpagina) ---
// De gebruiker heeft in de chat een project met een projectinstructie (bijv. de
// beschrijving van zijn WordPress-plugin) en wil daar een prompt over bouwen. Het
// project reist mee als id — niet als tekst: de context kan tienduizenden tekens
// zijn en die horen niet in sessionStorage. De bouwer laadt hem zelf op met
// buildGeneratorContext.

const PROJECT_HANDOFF_KEY = `${CHAT_PREFIX}project-handoff`;

export interface ProjectHandoff {
  projectId: string;
  /** Gaan de bronbestanden ook mee, of alleen de projectinstructie? */
  includeFiles: boolean;
}

/** Zet een project klaar om in de promptbouwer als context te gebruiken. */
export function writeProjectHandoff(projectId: string, includeFiles = false): void {
  try {
    sessionStorage.setItem(
      PROJECT_HANDOFF_KEY,
      JSON.stringify({ projectId, includeFiles, createdAt: Date.now() }),
    );
  } catch {
    /* sessieopslag niet beschikbaar — de bouwer opent dan zonder project */
  }
}

/** Lees en verwijder het klaargezette project; verlopen of ongeldig -> null. */
export function consumeProjectHandoff(): ProjectHandoff | null {
  try {
    const raw = sessionStorage.getItem(PROJECT_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PROJECT_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as {
      projectId?: unknown;
      includeFiles?: unknown;
      createdAt?: unknown;
    };
    if (typeof parsed.projectId !== 'string' || !parsed.projectId) return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > TTL_MS) return null;
    return { projectId: parsed.projectId, includeFiles: parsed.includeFiles === true };
  } catch {
    return null;
  }
}

// --- Resultaat-snapshot: gegenereerd resultaat over de login-roundtrip heen ---
// De Testkamer vereist een ingelogde gebruiker terwijl de generator publiek is.
// Wie vanuit de Testkamer-CTA gaat inloggen, krijgt via dit snapshot zijn
// gegenereerde prompt terug in plaats van een lege generator.

const RESULT_SNAPSHOT_KEY = 'opl.gen.result';

export interface ResultSnapshot {
  result: OptimizeResult;
  techniqueId: string | null;
}

/** Bewaar het generatorresultaat vlak voor een navigatie naar de loginpagina. */
export function writeResultSnapshot(result: OptimizeResult, techniqueId: string | null): void {
  try {
    sessionStorage.setItem(
      RESULT_SNAPSHOT_KEY,
      JSON.stringify({ result, techniqueId, createdAt: Date.now() }),
    );
  } catch {
    /* sessieopslag niet beschikbaar — de gebruiker begint dan opnieuw */
  }
}

/** Lees en verwijder het snapshot; verlopen of ongeldig -> null. */
export function consumeResultSnapshot(): ResultSnapshot | null {
  try {
    const raw = sessionStorage.getItem(RESULT_SNAPSHOT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESULT_SNAPSHOT_KEY);
    const parsed = JSON.parse(raw) as {
      result?: OptimizeResult;
      techniqueId?: unknown;
      createdAt?: unknown;
    };
    if (!parsed.result || typeof parsed.result.optimized_content !== 'string') return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > TTL_MS) return null;
    return {
      result: parsed.result,
      techniqueId: typeof parsed.techniqueId === 'string' ? parsed.techniqueId : null,
    };
  } catch {
    return null;
  }
}
