import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ProjectInterviewStep, ProjectTurn } from '@/services/projectPromptService';

/** Een beantwoorde vraag, met wat erbij stond zodat "Terug" hem kan herstellen. */
export type AnsweredStep = ProjectInterviewStep & ProjectTurn & { gekozen: string[]; extra: string };

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Enter verstuurt, Shift+Enter geeft een nieuwe regel. */
export function submitOnEnter(submit: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
}

const toTurns = (steps: AnsweredStep[]): ProjectTurn[] =>
  steps.map(({ question, answer }) => ({ question, answer }));

/**
 * De vragenronde van "Prompt maken" en van de context prompt: één vraag per beurt
 * met antwoordopties, tot de AI genoeg weet. Wat er daarna met de prompt gebeurt,
 * bepaalt de aanroeper in `write`.
 */
export function usePromptInterview({
  ask,
  write,
  onPhase,
}: {
  ask: (turns: ProjectTurn[], signal: AbortSignal) => Promise<ProjectInterviewStep>;
  write: (turns: ProjectTurn[], soort: string | undefined, signal: AbortSignal) => Promise<void>;
  /** Welk scherm hoort bij wat er nu loopt. */
  onPhase: (phase: 'vragen' | 'schrijven') => void;
}) {
  const [answered, setAnswered] = useState<AnsweredStep[]>([]);
  const [question, setQuestion] = useState<ProjectInterviewStep | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  // Altijd de laatste versie: een vraag loopt langer dan één render.
  const handlers = useRef({ ask, write, onPhase });
  handlers.current = { ask, write, onPhase };

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Eén plek voor de wachtstand, de fout en "opnieuw proberen". */
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    retryRef.current = () => void run(action);
    setBusy(true);
    setError(null);
    try {
      await action(controller.signal);
    } catch (err) {
      if (isAbort(err)) return;
      setError(err instanceof Error ? err.message : 'Dat lukte niet. Probeer het opnieuw.');
    }
    // De vragenronde kan zelf de volgende stap starten; dan loopt die nog.
    if (abortRef.current === controller) setBusy(false);
  }, []);

  const makePrompt = useCallback(
    (steps: AnsweredStep[], soort?: string) => {
      handlers.current.onPhase('schrijven');
      void run((signal) => handlers.current.write(toTurns(steps), soort, signal));
    },
    [run],
  );

  const askNext = useCallback(
    (steps: AnsweredStep[]) => {
      handlers.current.onPhase('vragen');
      void run(async (signal) => {
        const next = await handlers.current.ask(toTurns(steps), signal);
        if (next.klaar) {
          makePrompt(steps, next.soort || steps[steps.length - 1]?.soort);
          return;
        }
        setQuestion(next);
        setPicked([]);
        setAnswer('');
      });
    },
    [makePrompt, run],
  );

  /** Alle gekozen opties plus wat er getypt is, als één antwoord op de vraag. */
  const currentAnswer = (): AnsweredStep | null => {
    const extra = answer.trim();
    const text = [...picked, extra].filter(Boolean).join('; ');
    if (!text || !question?.vraag) return null;
    return { ...question, question: question.vraag, answer: text, gekozen: picked, extra };
  };

  const togglePick = (optie: string) =>
    setPicked((cur) => (cur.includes(optie) ? cur.filter((o) => o !== optie) : [...cur, optie]));

  const start = () => askNext(answered);

  const submitAnswer = () => {
    const current = currentAnswer();
    if (!current || busy) return;
    const next = [...answered, current];
    setAnswered(next);
    setQuestion(null);
    askNext(next);
  };

  /** "Maak de prompt" neemt een al gegeven antwoord op deze vraag mee. */
  const finishEarly = () => {
    const current = currentAnswer();
    const next = current ? [...answered, current] : answered;
    setAnswered(next);
    makePrompt(next, question?.soort);
  };

  /**
   * Eén stap terug: de vorige vraag komt terug met het antwoord dat er stond.
   * Geeft false als er geen vorige vraag is en de aanroeper zelf terug moet.
   */
  const back = (): boolean => {
    abortRef.current?.abort();
    setBusy(false);
    setError(null);
    const last = answered[answered.length - 1];
    if (!last) {
      setQuestion(null);
      return false;
    }
    setAnswered(answered.slice(0, -1));
    setQuestion(last);
    setPicked(last.gekozen);
    setAnswer(last.extra);
    handlers.current.onPhase('vragen');
    return true;
  };

  return {
    answered,
    question,
    picked,
    answer,
    setAnswer,
    busy,
    error,
    run,
    retry: () => retryRef.current?.(),
    togglePick,
    start,
    submitAnswer,
    finishEarly,
    back,
  };
}
