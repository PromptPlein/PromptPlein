// Handoffs tussen de chat en de generator, via sessionStorage. Zelfde patroon
// als de chat-handoff in chatService.ts: sessionStorage in plaats van
// router-state overleeft de login-roundtrip van RequireAuth in dezelfde tab en
// lekt niet naar andere tabs. clearChatHandoffs wist deze keys bij uitloggen.

import { CHAT_PREFIX } from '@/lib/chatStorage';
import { PROMPT_KINDS, type PromptKind } from '@/lib/techniques';
import type { OptimizeResult } from '@/types';

const TTL_MS = 15 * 60 * 1000;

// --- Handoff naar de generator: vanuit de chat ("Verbeter in generator") en
// vanaf de startpagina ("Wat wil je maken?", met de gekozen soort erbij) ---

const GENERATOR_HANDOFF_KEY = `${CHAT_PREFIX}generator-handoff`;

export interface GeneratorHandoff {
  /** De tekst voor het invoerveld; leeg als alleen een soort is gekozen. */
  prompt: string;
  /** De gekozen soort bij "Wat wordt het?"; null = de AI kiest. */
  kind: PromptKind | null;
}

/** Zet een tekst (en eventueel een soort) klaar als startpunt voor de eigen-prompt-flow. */
export function writeGeneratorHandoff(prompt: string, kind: PromptKind | null = null): void {
  try {
    sessionStorage.setItem(
      GENERATOR_HANDOFF_KEY,
      JSON.stringify({ prompt, kind, createdAt: Date.now() }),
    );
  } catch {
    /* sessieopslag niet beschikbaar — de generator opent dan gewoon leeg */
  }
}

/** Lees en verwijder het klaargezette startpunt; verlopen of ongeldig -> null. */
export function consumeGeneratorHandoff(): GeneratorHandoff | null {
  try {
    const raw = sessionStorage.getItem(GENERATOR_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(GENERATOR_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { prompt?: unknown; kind?: unknown; createdAt?: unknown };
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
    const kind = PROMPT_KINDS.find((k) => k === parsed.kind) ?? null;
    if (!prompt && !kind) return null;
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > TTL_MS) return null;
    return { prompt, kind };
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

// --- Generator → chat ("Project maken") ---
// Projecten wonen op de chatpagina, dus wie er in de bouwer een wil maken, moet
// daarheen. Zonder signaal komt hij daar op een pagina aan waar hij de knop
// opnieuw moet zoeken — precies de handeling die hij net al deed. Deze vlag
// zegt de chatpagina: maak meteen een project en zet de instellingen open. Geen
// id, want het project bestaat nog niet; alleen "de gebruiker kwam hiervoor".

const NEW_PROJECT_HANDOFF_KEY = `${CHAT_PREFIX}new-project-handoff`;

/** Vraag de chatpagina om bij aankomst een nieuw project te openen. */
export function writeNewProjectHandoff(): void {
  try {
    sessionStorage.setItem(NEW_PROJECT_HANDOFF_KEY, JSON.stringify({ createdAt: Date.now() }));
  } catch {
    /* sessieopslag niet beschikbaar — de chatpagina opent dan gewoon normaal */
  }
}

/** Lees en verwijder de vlag; verlopen of ongeldig -> false. */
export function consumeNewProjectHandoff(): boolean {
  try {
    const raw = sessionStorage.getItem(NEW_PROJECT_HANDOFF_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(NEW_PROJECT_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { createdAt?: unknown };
    if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > TTL_MS) return false;
    return true;
  } catch {
    return false;
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
