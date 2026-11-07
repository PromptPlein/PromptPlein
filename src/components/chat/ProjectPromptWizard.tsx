import { useState } from 'react';
import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  Loader2,
  Mail,
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
  type ProjectPromptDraft,
} from '@/services/projectPromptService';
import type { ChatSettings } from '@/services/settingsService';
import {
  InterviewQuestion,
  WizardError,
  WizardSteps,
  WizardWaiting,
} from './PromptInterviewParts';
import { submitOnEnter, usePromptInterview } from './usePromptInterview';

type Step = 'keuze' | 'taak' | 'vragen' | 'voorstel';

const STAPPEN: Step[] = ['taak', 'vragen', 'voorstel'];
const STAP_LABELS = ['Taak', 'Vragen', 'Prompt'];

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
  const [draft, setDraft] = useState<ProjectPromptDraft | null>(null);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState(projectName);
  const [feedback, setFeedback] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const interview = usePromptInterview({
    ask: (turns, signal) => nextProjectQuestion({ goal: goal.trim(), turns, settings, signal }),
    write: async (turns, soort, signal) => {
      const result = await writeProjectPrompt({
        goal: goal.trim(),
        turns,
        soort,
        techniques,
        settings,
        signal,
      });
      setDraft(result);
      setPrompt(result.prompt);
      if (isNewProject && result.titel) setName(result.titel.slice(0, MAX_PROJECT_NAME_CHARS));
    },
    onPhase: (phase) => setStep(phase === 'schrijven' ? 'voorstel' : 'vragen'),
  });
  const { answered, question, picked, answer, busy, error, run } = interview;

  const goBack = () => {
    setDraft(null);
    if (!interview.back()) setStep('taak');
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

  const stepIndex = STAPPEN.indexOf(step);
  const backButton = (
    <button type="button" className="opl-btn-ghost" onClick={goBack}>
      <ArrowLeft size={16} /> Terug
    </button>
  );
  const errorBox = error && <WizardError message={error} onRetry={interview.retry} />;

  return (
    <Modal open onClose={requestClose} title={isNewProject ? 'Nieuw project' : 'Prompt maken'}>
      {stepIndex >= 0 && <WizardSteps labels={STAP_LABELS} current={stepIndex} />}

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
              onKeyDown={submitOnEnter(() => goal.trim() && interview.start())}
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
          {busy && <WizardWaiting label="Ik denk na over je taak" />}
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
                    <Sparkles size={16} /> Maak de prompt
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

      {step === 'voorstel' && (
        <div className="space-y-4">
          {errorBox}
          {busy && !draft && <WizardWaiting label="Ik kies een aanpak en schrijf je prompt" />}
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
