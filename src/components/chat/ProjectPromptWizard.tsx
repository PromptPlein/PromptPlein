import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InfoDot from '@/components/common/InfoDot';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
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
  useSubmitOnEnter,
  WizardError,
  WizardSteps,
  WizardWaiting,
} from './PromptInterviewParts';
import { usePromptInterview } from './usePromptInterview';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/page';
import '@nldd/design-system/sheet';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';
import '@nldd/design-system/toggle-button';
import '@nldd/design-system/top-title-bar';

type Step = 'keuze' | 'taak' | 'vragen' | 'voorstel';

const STAPPEN: Step[] = ['taak', 'vragen', 'voorstel'];
const STAP_LABELS = ['Taak', 'Vragen', 'Prompt'];

/** Vaste startpunten: één klik zet de richting, daarna kun je hem nog aanvullen. */
const RICHTINGEN = [
  {
    label: 'Memo in vaste vorm',
    tekst: 'Een memo schrijven dat er elke keer hetzelfde uitziet',
    icon: 'text-document',
  },
  {
    label: 'Mail op dyslexie',
    tekst: 'Mijn mail nakijken op dyslexie zonder dat mijn toon en stem verloren gaan',
    icon: 'email',
  },
  {
    label: 'Stuk samenvatten',
    tekst: 'Lange stukken samenvatten voor mijn leidinggevende',
    icon: 'file-text',
  },
  {
    label: 'Verslag maken',
    tekst: 'Aantekeningen van een overleg omzetten naar een vast verslag',
    icon: 'clipboard-bullet-list',
  },
];

/**
 * A toggle button whose selected state follows React. The button flips its own
 * state on a click, so the property is set back from the prop after every render.
 */
function ChoiceToggle({ selected, ...rest }: Omit<ComponentProps<'nldd-toggle-button'>, 'selected'> & { selected: boolean }) {
  const ref = useRef<HTMLElement & { selected?: boolean }>(null);
  useEffect(() => {
    if (ref.current) ref.current.selected = selected;
  });
  return <nldd-toggle-button ref={ref} selected={selected || undefined} {...rest}></nldd-toggle-button>;
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
  const [draft, setDraft] = useState<ProjectPromptDraft | null>(null);
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState(projectName);
  const [feedback, setFeedback] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);

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

  // The sheet closes itself (Escape, backdrop, Sluit); with work in it, the
  // confirmation decides, and cancelling it opens the sheet again.
  const sheetRef = useRef<HTMLElement>(null);
  useNlddEvent(sheetRef, 'close', () => {
    setSheetOpen(false);
    requestClose();
  });

  const taskRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(taskRef, goal, setGoal);
  useSubmitOnEnter(taskRef, () => {
    if (goal.trim()) interview.start();
  });
  const nameRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(nameRef, name, setName);
  const promptRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(promptRef, prompt, setPrompt);
  const feedbackRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(feedbackRef, feedback, setFeedback);
  useSubmitOnEnter(feedbackRef, applyFeedback);

  // The task field takes focus once the sheet has opened.
  useEffect(() => {
    if (step !== 'taak') return;
    const timer = window.setTimeout(() => taskRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [step]);

  const stepIndex = STAPPEN.indexOf(step);
  const backButton = (
    <nldd-button appearance="neutral-transparent" start-icon="arrow-left" text="Terug" onClick={goBack}></nldd-button>
  );
  const errorBox = error && (
    <>
      <WizardError message={error} onRetry={interview.retry} />
      <nldd-spacer size="16"></nldd-spacer>
    </>
  );
  const title = isNewProject ? 'Nieuw project' : 'Prompt maken';

  return createPortal(
    <>
      <nldd-sheet ref={sheetRef} open={sheetOpen || undefined} width="640px">
        <nldd-page>
          <nldd-top-title-bar slot="header" text={title} dismiss-text="Sluit"></nldd-top-title-bar>
          <nldd-simple-section>
            {stepIndex >= 0 && <WizardSteps labels={STAP_LABELS} current={stepIndex} />}

            {step === 'keuze' && (
              <nldd-container layout="grid" column-count={2} sm-column-count={1} gap="12">
                <nldd-card button background="accent-tinted" accessible-label="Prompt maken" onClick={() => setStep('taak')}>
                  <nldd-container padding="16" gap="8">
                    <nldd-icon icon="magic" size="28"></nldd-icon>
                    <nldd-title heading-level={2} size={5} text="Prompt maken" supporting-text="De AI stelt een paar vragen"></nldd-title>
                  </nldd-container>
                </nldd-card>
                <nldd-card button accessible-label="Zelf instellen" onClick={onManual}>
                  <nldd-container padding="16" gap="8">
                    <nldd-icon icon="settings" size="28"></nldd-icon>
                    <nldd-title heading-level={2} size={5} text="Zelf instellen" supporting-text="Eigen instructie en bestanden"></nldd-title>
                  </nldd-container>
                </nldd-card>
              </nldd-container>
            )}

            {step === 'taak' && (
              <nldd-container gap="16">
                <nldd-form-field label="Wat wil je vaker uitgevoerd hebben?">
                  <nldd-multi-line-text-field ref={taskRef} rows={3} maxlength="2000"></nldd-multi-line-text-field>
                </nldd-form-field>
                <nldd-container layout="wrap" gap="8">
                  {RICHTINGEN.map(({ label, tekst, icon }) => (
                    <ChoiceToggle
                      key={label}
                      icon={icon}
                      text={label}
                      selected={goal === tekst}
                      onClick={() => setGoal(tekst)}
                    />
                  ))}
                </nldd-container>
                <nldd-container horizontal-alignment="right">
                  <nldd-button
                    appearance="primary"
                    end-icon="arrow-right"
                    text="Verder"
                    disabled={!goal.trim() || undefined}
                    onClick={interview.start}
                  ></nldd-button>
                </nldd-container>
              </nldd-container>
            )}

            {step === 'vragen' && (
              <nldd-container gap="16">
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
                <nldd-container layout="wrap" gap="8" vertical-alignment="center">
                  {backButton}
                  <nldd-spacer size="flexible"></nldd-spacer>
                  {!busy && question?.vraag && answered.length > 0 && (
                    <nldd-button appearance="secondary" start-icon="sparkles" text="Maak de prompt" onClick={interview.finishEarly}></nldd-button>
                  )}
                  {!busy && question?.vraag && (
                    <nldd-button
                      appearance="primary"
                      end-icon="arrow-right"
                      text="Verder"
                      disabled={(picked.length === 0 && !answer.trim()) || undefined}
                      onClick={interview.submitAnswer}
                    ></nldd-button>
                  )}
                </nldd-container>
              </nldd-container>
            )}

            {step === 'voorstel' && (
              <nldd-container gap="16">
                {errorBox}
                {busy && !draft && <WizardWaiting label="Ik kies een aanpak en schrijf je prompt" />}
                {draft && (
                  <>
                    {draft.framework && (
                      <nldd-container layout="row" gap="4" vertical-alignment="center">
                        <nldd-text size="sm" weight="bold">Gebouwd met {draft.framework.name}</nldd-text>
                        {draft.reden && <InfoDot label="Waarom deze aanpak" text={draft.reden} />}
                      </nldd-container>
                    )}
                    {isNewProject && (
                      <nldd-form-field label="Projectnaam">
                        <nldd-text-field ref={nameRef} maxlength={String(MAX_PROJECT_NAME_CHARS)}></nldd-text-field>
                      </nldd-form-field>
                    )}
                    <nldd-form-field label="Je prompt">
                      <nldd-multi-line-text-field
                        ref={promptRef}
                        rows={12}
                        maxlength={String(MAX_PROJECT_INSTRUCTIONS_CHARS)}
                        disabled={busy || undefined}
                      ></nldd-multi-line-text-field>
                    </nldd-form-field>
                    <nldd-container layout="row" gap="8" vertical-alignment="bottom">
                      <nldd-multi-line-text-field
                        ref={feedbackRef}
                        rows={1}
                        accessible-label="Wat moet er anders?"
                        placeholder="Wat moet er anders?"
                        maxlength="2000"
                        disabled={busy || undefined}
                      ></nldd-multi-line-text-field>
                      <nldd-button
                        appearance="secondary"
                        start-icon="sparkles"
                        text="Aanpassen"
                        loading={busy || undefined}
                        disabled={(!busy && (!feedback.trim() || !prompt.trim())) || undefined}
                        onClick={applyFeedback}
                      ></nldd-button>
                    </nldd-container>
                    <nldd-container layout="row" gap="8" vertical-alignment="center">
                      {backButton}
                      <nldd-spacer size="flexible"></nldd-spacer>
                      <nldd-button
                        appearance="primary"
                        start-icon="check-mark"
                        text="Dit wil ik"
                        disabled={(busy || !prompt.trim()) || undefined}
                        onClick={save}
                      ></nldd-button>
                    </nldd-container>
                  </>
                )}
                {!draft && backButton}
              </nldd-container>
            )}
          </nldd-simple-section>
        </nldd-page>
      </nldd-sheet>

      <ConfirmDialog
        open={confirmClose}
        title="Stoppen?"
        message="Je antwoorden gaan verloren."
        confirmLabel="Stoppen"
        destructive
        onConfirm={onClose}
        onClose={() => {
          setConfirmClose(false);
          setSheetOpen(true);
        }}
      />
    </>,
    document.body,
  );
}
