import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_INTAKE_QUESTIONS } from '@/lib/chatIntake';
import {
  adjustContextPrompt,
  checkContextPrompt,
  judgeFirstMessage,
  nextContextQuestion,
  writeContextPrompt,
  type ProjectPromptDraft,
  type ProjectTurn,
  type PromptCheck,
} from '@/services/projectPromptService';
import type { ChatSettings } from '@/services/settingsService';
import type { Technique } from '@/types';

export type IntakePhase = 'analyse' | 'vragen' | 'voorstel' | 'klaar';

export interface IntakeState {
  /** Het eerste bericht, zoals de medewerker het verstuurde. */
  goal: string;
  phase: IntakePhase;
  /** "Je wilt ..." uit de eerste beoordeling. */
  begrip: string;
  soort?: string;
  turns: ProjectTurn[];
  question: { vraag: string; opties: string[] } | null;
  draft: (ProjectPromptDraft & { kopjes: string[] }) | null;
  check: PromptCheck | null;
  /** De beoordeling loopt: het voorstel staat er al wel. */
  checking: boolean;
  /** Waar de AI nu mee bezig is; null als er niets loopt. */
  loading: string | null;
  error: string | null;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

const message = (err: unknown) =>
  err instanceof Error ? err.message : 'Dat lukte niet. Probeer het opnieuw.';

/**
 * Doorvragen bij het eerste bericht van een nieuwe chat. Eerst een oordeel: is het
 * bericht genoeg, dan gaat het gewoon door (`onPassThrough`). Mist er iets, dan
 * kiest de AI een framework en schrijft de prompt; bij een heel summier bericht
 * stelt hij eerst hoogstens drie vragen. Daarna een beoordeling per kopje, en pas
 * met "Gebruik deze prompt" komt hij in het tekstvak (`onUse`). Versturen blijft
 * een eigen handeling.
 *
 * Dezelfde vragenronde en schrijfstap als de context prompt (modes
 * `context-interview` en `context-prompt`); alleen het eerste oordeel en de
 * beoordeling zijn eigen modes.
 */
export default function useChatIntake({
  settings,
  techniques,
  getMaterial,
  onPassThrough,
  onUse,
}: {
  settings: ChatSettings | null;
  techniques: Technique[];
  /** De bijlagen van deze chat, als bronmateriaal voor de AI. */
  getMaterial: () => string;
  onPassThrough: (goal: string) => void;
  onUse: (draft: ProjectPromptDraft) => void;
}) {
  const [state, setState] = useState<IntakeState | null>(null);
  const stateRef = useRef<IntakeState | null>(null);
  stateRef.current = state;
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const handlers = useRef({ settings, techniques, getMaterial, onPassThrough, onUse });
  handlers.current = { settings, techniques, getMaterial, onPassThrough, onUse };

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((next: Partial<IntakeState>) => {
    setState((cur) => (cur ? { ...cur, ...next } : cur));
  }, []);

  /** Eén stap met wachtstand, fout en "Opnieuw". */
  const run = useCallback(
    async (label: string, action: (signal: AbortSignal) => Promise<void>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      retryRef.current = () => void run(label, action);
      patch({ loading: label, error: null });
      try {
        await action(controller.signal);
        if (abortRef.current === controller) patch({ loading: null });
      } catch (err) {
        if (isAbort(err)) return;
        patch({ loading: null, error: message(err) });
      }
    },
    [patch],
  );

  /** De beoordeling hoort bij het voorstel, maar mag het nooit tegenhouden. */
  const runCheck = useCallback(
    async (draft: ProjectPromptDraft & { kopjes: string[] }, signal: AbortSignal) => {
      const cur = stateRef.current;
      if (!cur || draft.kopjes.length === 0) return;
      patch({ checking: true, check: null });
      try {
        const check = await checkContextPrompt({
          prompt: draft.prompt,
          kopjes: draft.kopjes,
          goal: cur.goal,
          turns: cur.turns,
          settings: handlers.current.settings,
          signal,
        });
        patch({ check, checking: false });
      } catch (err) {
        if (isAbort(err)) return;
        patch({ checking: false });
      }
    },
    [patch],
  );

  const write = useCallback(
    (goal: string, turns: ProjectTurn[], soort: string | undefined) => {
      void run('Ik kies een aanpak en schrijf je prompt', async (signal) => {
        const result = await writeContextPrompt({
          goal,
          turns,
          soort,
          material: handlers.current.getMaterial(),
          techniques: handlers.current.techniques,
          settings: handlers.current.settings,
          signal,
        });
        const draft = { ...result, kopjes: result.kopjes ?? [] };
        patch({ phase: 'voorstel', question: null, draft, check: null, loading: null });
        await runCheck(draft, signal);
      });
    },
    [run, patch, runCheck],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(null);
  }, []);

  /** Het eerste bericht: beoordelen, dan gewoon door, een voorstel of een vraag. */
  const start = useCallback(
    (goal: string) => {
      setState({
        goal,
        phase: 'analyse',
        begrip: '',
        turns: [],
        question: null,
        draft: null,
        check: null,
        checking: false,
        loading: null,
        error: null,
      });
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState((cur) => (cur ? { ...cur, loading: 'Ik kijk wat je nodig hebt' } : cur));
      void (async () => {
        try {
          const verdict = await judgeFirstMessage({
            goal,
            material: handlers.current.getMaterial(),
            settings: handlers.current.settings,
            signal: controller.signal,
          });
          if (abortRef.current !== controller) return;
          if (verdict.oordeel === 'genoeg') {
            setState(null);
            handlers.current.onPassThrough(goal);
            return;
          }
          patch({ begrip: verdict.begrip ?? '', soort: verdict.soort, loading: null });
          if (verdict.oordeel === 'summier' && verdict.vraag) {
            patch({
              phase: 'vragen',
              question: { vraag: verdict.vraag, opties: verdict.opties ?? [] },
            });
          } else {
            write(goal, [], verdict.soort);
          }
        } catch (err) {
          if (isAbort(err) || abortRef.current !== controller) return;
          // Kan het niet beoordeeld worden, dan gewoon chatten: deze stap is hulp, geen poort.
          setState(null);
          handlers.current.onPassThrough(goal);
        }
      })();
    },
    [patch, write],
  );

  /** Een antwoord op de vraag, aangeklikt of getypt. */
  const answer = useCallback(
    (text: string) => {
      const cur = stateRef.current;
      const value = text.trim();
      if (!cur?.question || !value || cur.loading) return;
      const turns = [...cur.turns, { question: cur.question.vraag, answer: value }];
      patch({ turns, question: null });
      if (turns.length >= MAX_INTAKE_QUESTIONS) {
        write(cur.goal, turns, cur.soort);
        return;
      }
      void run('Ik denk na over je antwoord', async (signal) => {
        const next = await nextContextQuestion({
          goal: cur.goal,
          turns,
          material: handlers.current.getMaterial(),
          settings: handlers.current.settings,
          signal,
        });
        const soort = next.soort || cur.soort;
        if (next.klaar || !next.vraag) {
          patch({ soort });
          write(cur.goal, turns, soort);
          return;
        }
        patch({ soort, question: { vraag: next.vraag, opties: next.opties ?? [] } });
      });
    },
    [patch, run, write],
  );

  /** Niet verder vragen: maak het voorstel met wat er nu bekend is. */
  const finishQuestions = useCallback(() => {
    const cur = stateRef.current;
    if (!cur || cur.loading) return;
    write(cur.goal, cur.turns, cur.soort);
  }, [write]);

  /** Een verzoek of een gekozen verbeterpunt verwerken in het voorstel. */
  const improve = useCallback(
    (feedback: string) => {
      const cur = stateRef.current;
      const value = feedback.trim();
      if (!cur?.draft || !value || cur.loading) return;
      const base = cur.draft;
      void run('Ik pas de prompt aan', async (signal) => {
        const result = await adjustContextPrompt({
          prompt: base.prompt,
          feedback: value,
          settings: handlers.current.settings,
          signal,
        });
        const draft = { ...base, prompt: result.prompt };
        patch({ draft, check: null, loading: null });
        await runCheck(draft, signal);
      });
    },
    [patch, run, runCheck],
  );

  const use = useCallback(() => {
    const cur = stateRef.current;
    if (!cur?.draft) return;
    abortRef.current?.abort();
    patch({ phase: 'klaar', checking: false, loading: null });
    handlers.current.onUse(cur.draft);
  }, [patch]);

  /** Terug naar het voorstel, bijvoorbeeld om het verbeterpunt alsnog te kiezen. */
  const reopen = useCallback(() => patch({ phase: 'voorstel' }), [patch]);

  /** Het eigen bericht toch zo versturen. */
  const skip = useCallback(() => {
    const cur = stateRef.current;
    reset();
    if (cur) handlers.current.onPassThrough(cur.goal);
  }, [reset]);

  /**
   * De stopknop. Tijdens het eerste oordeel stopt de hele hulp en geeft hij het
   * bericht terug; daarna stopt alleen de stap die loopt.
   */
  const stop = useCallback((): string | null => {
    const cur = stateRef.current;
    if (!cur) return null;
    if (cur.phase === 'analyse') {
      reset();
      return cur.goal;
    }
    abortRef.current?.abort();
    patch({ loading: null, checking: false, error: 'Gestopt.' });
    return null;
  }, [patch, reset]);

  return {
    state,
    busy: Boolean(state?.loading),
    start,
    answer,
    finishQuestions,
    improve,
    use,
    reopen,
    skip,
    stop,
    reset,
    retry: () => retryRef.current?.(),
  };
}
