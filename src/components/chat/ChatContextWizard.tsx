import { useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  LogIn,
  PenLine,
  Plus,
  Search,
  SpellCheck,
  Wand2,
} from '@/components/common/icons';
import clsx from 'clsx';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Modal from '@/components/common/Modal';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { buildGeneratorContext } from '@/services/chatProjectService';
import {
  nextContextQuestion,
  writeContextPrompt,
  type ProjectPromptDraft,
} from '@/services/projectPromptService';
import type { ChatSettings } from '@/services/settingsService';
import type { ChatAttachment, ChatProject } from '@/types';
import {
  InterviewQuestion,
  WizardError,
  WizardSteps,
  WizardWaiting,
} from './PromptInterviewParts';
import { submitOnEnter, usePromptInterview } from './usePromptInterview';

type Step = 'context' | 'taak' | 'vragen' | 'schrijven';

const STAPPEN: Step[] = ['taak', 'vragen', 'schrijven'];
const STAP_LABELS = ['Taak', 'Vragen', 'Prompt'];

/** Zoveel tekst uit de bijlagen van deze chat leest de vragenronde mee. */
const MAX_ATTACHMENT_EXCERPT = 6_000;

/** Eén klik zet de richting, daarna vul je hem zelf aan. */
const RICHTINGEN = [
  { label: 'Tekst schrijven', tekst: 'Ik wil een tekst laten schrijven over ', icon: PenLine },
  { label: 'Tekst nakijken', tekst: 'Ik wil mijn tekst laten nakijken op ', icon: SpellCheck },
  { label: 'Stuk samenvatten', tekst: 'Ik wil een lang stuk laten samenvatten voor ', icon: AlignLeft },
  { label: 'Iets uitzoeken', tekst: 'Ik wil laten uitzoeken ', icon: Search },
];

const PILL =
  'flex min-h-[3rem] items-center gap-2 rounded-xl bg-rijksblauw-50 px-3 py-2 text-left text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:bg-rijksblauw-500/20 dark:text-white dark:hover:bg-rijksblauw-500/30';

const bronnen = (n: number) => (n === 1 ? '1 bron' : `${n} bronnen`);

/** Wat er in het tekstvak komt als de context prompt klaar is. */
export interface ContextPrompt {
  draft: ProjectPromptDraft;
  projectId: string | null;
}

/**
 * De knop Projecten in de chat. Een project kiezen koppelt het meteen aan de chat,
 * er hoeft niets meer bevestigd te worden. De context prompt leest het project van
 * de chat mee: de AI vraagt door tot duidelijk is wat de medewerker wil bereiken,
 * kiest zelf een framework en zet de prompt in het tekstvak van de chat.
 *
 * Er is bewust geen voorstelscherm zoals bij "Prompt maken" in een project: het
 * tekstvak ís het voorstel. Daar lees en wijzig je hem, en versturen blijft een
 * eigen handeling, inclusief de controle op persoonsgegevens.
 */
export default function ChatContextWizard({
  startAt,
  initialGoal,
  projects,
  activeProjectId,
  chatStarted,
  attachments,
  settings,
  isLoggedIn,
  onLogin,
  onNewProject,
  onApplyProject,
  onPrompt,
  onClose,
}: {
  startAt: 'context' | 'taak';
  /** Wat er al in het tekstvak stond: dat is het begin van de taak. */
  initialGoal: string;
  projects: ChatProject[];
  activeProjectId: string | null;
  /** Er staan al berichten in deze chat: een ander project wordt een nieuwe chat. */
  chatStarted: boolean;
  attachments: ChatAttachment[];
  settings: ChatSettings | null;
  isLoggedIn: boolean;
  onLogin: () => void;
  onNewProject: () => void;
  onApplyProject: (projectId: string | null) => void;
  onPrompt: (result: ContextPrompt) => void;
  onClose: () => void;
}) {
  const { techniques } = useReferenceData();
  const [step, setStep] = useState<Step>(startAt);
  const [goal, setGoal] = useState(initialGoal);
  const [reading, setReading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Eén keer per project ophalen: de analyse kan even duren en Terug mag niet opnieuw wachten.
  const material = useRef<{ projectId: string | null; text: string } | null>(null);

  const projectId = activeProjectId;
  const project = projects.find((p) => p.id === projectId) ?? null;

  /** De analyse van het project plus een stuk uit de bijlagen van deze chat. */
  async function loadMaterial(): Promise<string> {
    if (material.current?.projectId === projectId) return material.current.text;
    const parts: string[] = [];
    if (projectId) {
      setReading(true);
      try {
        const context = await buildGeneratorContext(projectId, 'all', {
          provider: settings?.provider,
          model: settings?.model,
        });
        if (context) {
          const names = context.files.map((file) => `"${file.name}"`).join(', ');
          parts.push(`Project "${context.name}":\n${context.text}`);
          if (names) parts.push(`Bronbestanden bij deze chat: ${names}`);
        }
      } catch {
        // Zonder analyse kan de vragenronde ook: de AI vraagt dan meer na.
      }
      setReading(false);
    }
    for (const a of attachments) {
      parts.push(`Bijlage "${a.name}":\n${a.text.slice(0, MAX_ATTACHMENT_EXCERPT)}`);
    }
    const text = parts.join('\n\n');
    material.current = { projectId, text };
    return text;
  }

  const interview = usePromptInterview({
    ask: async (turns, signal) =>
      nextContextQuestion({
        goal: goal.trim(),
        turns,
        material: await loadMaterial(),
        settings,
        signal,
      }),
    write: async (turns, soort, signal) => {
      const draft = await writeContextPrompt({
        goal: goal.trim(),
        turns,
        soort,
        material: await loadMaterial(),
        techniques,
        settings,
        signal,
      });
      onPrompt({ draft, projectId });
    },
    onPhase: (phase) => setStep(phase),
  });
  const { answered, question, picked, answer, busy, error } = interview;

  const goBack = () => {
    if (!interview.back()) setStep('taak');
  };

  const requestClose = () => {
    if (answered.length > 0 || (step !== 'context' && goal.trim() !== initialGoal.trim())) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  };

  const errorBox = error && <WizardError message={error} onRetry={interview.retry} />;
  const backButton = (
    <button type="button" className="opl-btn-ghost" onClick={goBack}>
      <ArrowLeft size={16} /> Terug
    </button>
  );

  return (
    <Modal open onClose={requestClose} title={step === 'context' ? 'Projecten' : 'Context prompt'}>
      {step !== 'context' && <WizardSteps labels={STAP_LABELS} current={STAPPEN.indexOf(step)} />}

      {step === 'context' && (
        <div className="animate-fade-in space-y-4">
          <h3 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            Welk project hoort bij deze chat?
          </h3>

          {isLoggedIn ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {projects.map((p) => {
                const on = p.id === projectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onApplyProject(on ? null : p.id)}
                    className={clsx(
                      'flex min-h-[4rem] items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800',
                      on
                        ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-600'
                        : 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/20 dark:text-white dark:hover:bg-rijksblauw-500/30',
                    )}
                  >
                    <FolderOpen size={22} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{p.name}</span>
                      <span className="block text-xs">{bronnen(p.fileCount ?? 0)}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={onNewProject}
                className="flex min-h-[4rem] items-center gap-3 rounded-xl border-2 border-dashed border-rijksblauw-300 px-3 py-2 text-left text-sm font-bold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:border-rijksblauw-500/50 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/15"
              >
                <Plus size={22} className="shrink-0" /> Nieuw project
              </button>
            </div>
          ) : (
            <button type="button" className="opl-btn-secondary" onClick={onLogin}>
              <LogIn size={16} /> Log in voor je projecten
            </button>
          )}

          {chatStarted && (
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Een ander project start een nieuwe chat; deze blijft bewaard.
            </p>
          )}

          {!project && (
            <div className="flex justify-end">
              <button type="button" className="opl-btn-primary" onClick={() => setStep('taak')}>
                <Wand2 size={16} /> Context prompt
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'taak' && (
        <div className="animate-fade-in space-y-4">
          {project && (
            <p className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-rijksblauw-50 px-3 py-1 text-sm font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-white">
              <FolderOpen size={14} className="shrink-0" />
              <span className="truncate">{project.name}</span>
            </p>
          )}
          <div>
            <label
              htmlFor="context-task"
              className="mb-2 block text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
            >
              Wat wil je bereiken?
            </label>
            <textarea
              id="context-task"
              autoFocus
              rows={3}
              maxLength={2000}
              className="opl-input resize-y"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={submitOnEnter(() => goal.trim() && interview.start())}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {RICHTINGEN.map(({ label, tekst, icon: Icon }) => (
              <button
                key={label}
                type="button"
                className={PILL}
                onClick={() => {
                  setGoal(tekst);
                  document.getElementById('context-task')?.focus();
                }}
              >
                <Icon size={18} className="shrink-0" /> {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            {startAt === 'context' ? (
              <button type="button" className="opl-btn-ghost" onClick={() => setStep('context')}>
                <ArrowLeft size={16} /> Terug
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="opl-btn-primary"
              disabled={!goal.trim()}
              onClick={interview.start}
            >
              Verder <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 'vragen' && (
        <div className="space-y-4">
          {errorBox}
          {busy && <WizardWaiting label={reading ? 'Ik lees je project' : 'Ik denk na over je taak'} />}
          {!busy && question?.vraag && (
            <InterviewQuestion
              question={question}
              number={answered.length + 1}
              picked={picked}
              answer={answer}
              onTogglePick={interview.togglePick}
              onAnswer={interview.setAnswer}
              onSubmit={interview.submitAnswer}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {backButton}
            {!busy && question?.vraag && (
              <div className="flex flex-wrap items-center gap-2">
                {answered.length > 0 && (
                  <button type="button" className="opl-btn-secondary" onClick={interview.finishEarly}>
                    <Wand2 size={16} /> Maak de prompt
                  </button>
                )}
                <button
                  type="button"
                  className="opl-btn-primary"
                  disabled={picked.length === 0 && !answer.trim()}
                  onClick={interview.submitAnswer}
                >
                  Verder <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'schrijven' && (
        <div className="space-y-4">
          {errorBox}
          {busy && <WizardWaiting label="Ik kies een aanpak en schrijf je prompt" />}
          {!busy && <div>{backButton}</div>}
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
