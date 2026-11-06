import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  Loader2,
  Mail,
  RotateCcw,
  Settings2,
  Sparkles,
  Wand2,
} from '@/components/common/icons';
import clsx from 'clsx';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InfoDot from '@/components/common/InfoDot';
import Modal from '@/components/common/Modal';
import { TILE, TILE_PRIMARY, TILE_SOFT } from '@/components/chat/projectTiles';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  MAX_PROJECT_INSTRUCTIONS_CHARS,
  MAX_PROJECT_NAME_CHARS,
} from '@/services/chatProjectService';
import {
  adjustProjectPrompt,
  nextProjectQuestion,
  writeProjectPrompt,
  type ProjectInterviewStep,
  type ProjectPromptDraft,
  type ProjectTurn,
} from '@/services/projectPromptService';
import type { ChatSettings } from '@/services/settingsService';

type Step = 'keuze' | 'taak' | 'vragen' | 'voorstel';

/** Een beantwoorde vraag, met wat erbij stond zodat "Terug" hem kan herstellen. */
type AnsweredStep = ProjectInterviewStep & ProjectTurn & { gekozen: string[]; extra: string };

const STAPPEN: { id: Step; label: string }[] = [
  { id: 'taak', label: 'Taak' },
  { id: 'vragen', label: 'Vragen' },
  { id: 'voorstel', label: 'Prompt' },
];

/** Vaste startpunten: één klik zet de richting, daarna kun je hem nog aanvullen. */
const RICHTINGEN = [
  {
    label: 'Memo in vaste vorm',
    tekst: 'Een memo schrijven dat er elke keer hetzelfde uitziet',
    icon: FileText,
  },
  {
    label: 'Mail op dyslexie',
    tekst: 'Mijn mail nakijken op dyslexie zonder dat mijn toon en stem verloren gaan',
    icon: Mail,
  },
  {
    label: 'Stuk samenvatten',
    tekst: 'Lange stukken samenvatten voor mijn leidinggevende',
    icon: AlignLeft,
  },
  {
    label: 'Verslag maken',
    tekst: 'Aantekeningen van een overleg omzetten naar een vast verslag',
    icon: ClipboardList,
  },
];

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Enter verstuurt, Shift+Enter geeft een nieuwe regel. */
function submitOnEnter(submit: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
}

/**
 * "Prompt maken" in een project: taak, vragen, voorstel. De AI analyseert de taak
 * en stelt per beurt één vraag met antwoordopties, kiest daarna zelf het framework
 * en laat het resultaat zien. Pas bij "Dit wil ik" wordt het de projectinstructie.
 */
export default function ProjectPromptWizard({
  projectName,
  isNewProject,
  settings,
  onManual,
  onClose,
  onSave,
}: {
  projectName: string;
  /** Nieuw project: eerst de keuze, en de AI mag de naam voorstellen. */
  isNewProject: boolean;
  settings: ChatSettings | null;
  /** Zelf instellen: door naar de projectinstellingen. */
  onManual: () => void;
  onClose: () => void;
  onSave: (patch: { name: string; instructions: string }) => Promise<boolean>;
}) {
  const { techniques } = useReferenceData();
  const [step, setStep] = useState<Step>(isNewProject ? 'keuze' : 'taak');
  const [goal, setGoal] = useState('');
  const [answered, setAnswered] = useState<AnsweredStep[]>([]);
  const [question, setQuestion] = useState<ProjectInterviewStep | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [draft, setDraft] = useState<ProjectPromptDraft | null>(null);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState(projectName);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Een nieuwe vraag krijgt de focus, zodat een schermlezer hem meteen voorleest.
  useEffect(() => {
    if (!busy && question) questionRef.current?.focus();
  }, [busy, question]);

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
    (turns: AnsweredStep[], soort?: string) => {
      setStep('voorstel');
      void run(async (signal) => {
        const result = await writeProjectPrompt({
          goal: goal.trim(),
          turns: turns.map(({ question: q, answer: a }) => ({ question: q, answer: a })),
          soort,
          techniques,
          settings,
          signal,
        });
        setDraft(result);
        setPrompt(result.prompt);
        if (isNewProject && result.titel) setName(result.titel.slice(0, MAX_PROJECT_NAME_CHARS));
      });
    },
    [goal, isNewProject, run, settings, techniques],
  );

  const askNext = useCallback(
    (turns: AnsweredStep[]) => {
      setStep('vragen');
      void run(async (signal) => {
        const next = await nextProjectQuestion({
          goal: goal.trim(),
          turns: turns.map(({ question: q, answer: a }) => ({ question: q, answer: a })),
          settings,
          signal,
        });
        if (next.klaar) {
          makePrompt(turns, next.soort || turns[turns.length - 1]?.soort);
          return;
        }
        setQuestion(next);
        setPicked([]);
        setAnswer('');
      });
    },
    [goal, makePrompt, run, settings],
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

  /** Eén stap terug: de vorige vraag komt terug met het antwoord dat er stond. */
  const goBack = () => {
    abortRef.current?.abort();
    setBusy(false);
    setError(null);
    const last = answered[answered.length - 1];
    if (!last) {
      setQuestion(null);
      setDraft(null);
      setStep('taak');
      return;
    }
    setAnswered(answered.slice(0, -1));
    setQuestion(last);
    setPicked(last.gekozen);
    setAnswer(last.extra);
    setDraft(null);
    setStep('vragen');
  };

  const applyFeedback = () => {
    const wish = feedback.trim();
    if (!wish || !prompt.trim() || busy) return;
    void run(async (signal) => {
      const result = await adjustProjectPrompt({ prompt, feedback: wish, settings, signal });
      setPrompt(result.prompt);
      setFeedback('');
    });
  };

  const save = () => {
    if (!prompt.trim() || busy) return;
    void run(async () => {
      const ok = await onSave({ name: name.trim() || projectName, instructions: prompt.trim() });
      if (!ok) throw new Error('Je prompt kon niet worden opgeslagen. Probeer het opnieuw.');
    });
  };

  const requestClose = () => {
    if (goal.trim() || answered.length > 0) setConfirmClose(true);
    else onClose();
  };

  const stepIndex = STAPPEN.findIndex((s) => s.id === step);
  const backButton = (
    <button type="button" className="opl-btn-ghost" onClick={goBack}>
      <ArrowLeft size={16} /> Terug
    </button>
  );
  const errorBox = error && (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
    >
      {error}
      <button
        type="button"
        className="opl-btn-secondary !px-3 !py-1.5"
        onClick={() => retryRef.current?.()}
      >
        <RotateCcw size={14} /> Opnieuw
      </button>
    </div>
  );
  const waiting = (label: string) => (
    <p
      role="status"
      className="flex items-center justify-center gap-2 py-14 text-base font-semibold text-rijksblauw-700 dark:text-rijksblauw-200"
    >
      <Loader2 size={20} className="animate-spin" /> {label}
    </p>
  );

  return (
    <Modal open onClose={requestClose} title={isNewProject ? 'Nieuw project' : 'Prompt maken'}>
      {stepIndex >= 0 && (
        <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="Stappen">
          {STAPPEN.map((s, i) => (
            <li
              key={s.id}
              aria-current={i === stepIndex ? 'step' : undefined}
              className={clsx(
                'border-t-4 pt-1 text-sm font-semibold',
                i <= stepIndex
                  ? 'border-rijksblauw-700 text-rijksblauw-700 dark:border-rijksblauw-400 dark:text-rijksblauw-200'
                  : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400',
              )}
            >
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {step === 'keuze' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            className={`${TILE} ${TILE_PRIMARY}`}
            onClick={() => setStep('taak')}
          >
            <Wand2 size={28} strokeWidth={1.5} />
            <span>
              <span className="block text-base font-bold leading-tight">Prompt maken</span>
              <span className="mt-1 block text-sm">De AI stelt een paar vragen</span>
            </span>
          </button>
          <button type="button" className={`${TILE} ${TILE_SOFT}`} onClick={onManual}>
            <Settings2 size={28} />
            <span>
              <span className="block text-base font-bold leading-tight">Zelf instellen</span>
              <span className="mt-1 block text-sm">Eigen instructie en bestanden</span>
            </span>
          </button>
        </div>
      )}

      {step === 'taak' && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="project-task"
              className="mb-2 block text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
            >
              Wat wil je vaker uitgevoerd hebben?
            </label>
            <textarea
              id="project-task"
              autoFocus
              rows={3}
              maxLength={2000}
              className="opl-input resize-y"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={submitOnEnter(() => goal.trim() && askNext(answered))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {RICHTINGEN.map(({ label, tekst, icon: Icon }) => (
              <button
                key={label}
                type="button"
                aria-pressed={goal === tekst}
                onClick={() => setGoal(tekst)}
                className={clsx(
                  'flex min-h-[3rem] items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                  goal === tekst
                    ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-600'
                    : 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/20 dark:text-white dark:hover:bg-rijksblauw-500/30',
                )}
              >
                <Icon size={18} className="shrink-0" /> {label}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className="opl-btn-primary"
              disabled={!goal.trim()}
              onClick={() => askNext(answered)}
            >
              Verder <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 'vragen' && (
        <div className="space-y-4">
          {errorBox}
          {busy && waiting('Ik denk na over je taak')}
          {!busy && question?.vraag && (
            <>
              {question.begrip && (
                <p className="rounded-lg bg-rijksblauw-50 px-3 py-2 text-sm text-slate-800 dark:bg-rijksblauw-500/15 dark:text-slate-100">
                  {question.begrip}
                </p>
              )}
              <div>
                <p className="mb-1 text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Vraag {answered.length + 1}
                  {question.max ? ` van ${question.max}` : ''}
                </p>
                <h3
                  ref={questionRef}
                  tabIndex={-1}
                  className="text-lg font-bold text-rijksblauw-700 focus:outline-none dark:text-rijksblauw-200"
                >
                  {question.vraag}
                </h3>
              </div>
              {(question.opties?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  {question.opties?.map((optie) => {
                    const on = picked.includes(optie);
                    return (
                      <button
                        key={optie}
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePick(optie)}
                        className={clsx(
                          'flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                          on
                            ? 'border-rijksblauw-700 bg-rijksblauw-50 text-slate-900 dark:border-rijksblauw-300 dark:bg-rijksblauw-500/20 dark:text-white'
                            : 'border-slate-200 text-slate-800 hover:border-rijksblauw-500 hover:bg-rijksblauw-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-rijksblauw-500/15',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={clsx(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                            on
                              ? 'border-rijksblauw-700 bg-rijksblauw-700 text-white dark:border-rijksblauw-300 dark:bg-rijksblauw-500'
                              : 'border-slate-400 dark:border-slate-500',
                          )}
                        >
                          {on && <Check size={14} />}
                        </span>
                        {optie}
                      </button>
                    );
                  })}
                </div>
              )}
              <textarea
                rows={2}
                aria-label="Typ er iets bij"
                placeholder="Typ er iets bij"
                maxLength={2000}
                className="opl-input resize-y"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={submitOnEnter(submitAnswer)}
              />
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {backButton}
            {!busy && question?.vraag && (
              <div className="flex flex-wrap items-center gap-2">
                {answered.length > 0 && (
                  <button type="button" className="opl-btn-secondary" onClick={finishEarly}>
                    <Sparkles size={16} /> Maak de prompt
                  </button>
                )}
                <button
                  type="button"
                  className="opl-btn-primary"
                  disabled={picked.length === 0 && !answer.trim()}
                  onClick={submitAnswer}
                >
                  Verder <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'voorstel' && (
        <div className="space-y-4">
          {errorBox}
          {busy && !draft && waiting('Ik kies een aanpak en schrijf je prompt')}
          {draft && (
            <>
              {draft.framework && (
                <p className="flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Gebouwd met {draft.framework.name}
                  {draft.reden && (
                    <InfoDot label="Waarom deze aanpak" text={draft.reden} />
                  )}
                </p>
              )}
              {isNewProject && (
                <div>
                  <label htmlFor="project-prompt-name" className="opl-label">
                    Projectnaam
                  </label>
                  <input
                    id="project-prompt-name"
                    className="opl-input"
                    value={name}
                    maxLength={MAX_PROJECT_NAME_CHARS}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label htmlFor="project-prompt-text" className="opl-label">
                  Je prompt
                </label>
                <textarea
                  id="project-prompt-text"
                  className="opl-input min-h-[18rem] resize-y"
                  value={prompt}
                  maxLength={MAX_PROJECT_INSTRUCTIONS_CHARS}
                  disabled={busy}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  aria-label="Wat moet er anders?"
                  placeholder="Wat moet er anders?"
                  maxLength={2000}
                  className="opl-input resize-y"
                  value={feedback}
                  disabled={busy}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={submitOnEnter(applyFeedback)}
                />
                <button
                  type="button"
                  className="opl-btn-secondary shrink-0"
                  disabled={busy || !feedback.trim() || !prompt.trim()}
                  onClick={applyFeedback}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Aanpassen
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                {backButton}
                <button
                  type="button"
                  className="opl-btn-primary"
                  disabled={busy || !prompt.trim()}
                  onClick={save}
                >
                  <Check size={16} /> Dit wil ik
                </button>
              </div>
            </>
          )}
          {!draft && <div>{backButton}</div>}
        </div>
      )}

      <ConfirmDialog
        open={confirmClose}
        title="Stoppen?"
        message="Je antwoorden gaan verloren."
        confirmLabel="Stoppen"
        destructive
        onConfirm={onClose}
        onClose={() => setConfirmClose(false)}
      />
    </Modal>
  );
}
