import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
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
  useSubmitOnEnter,
  WizardError,
  WizardSteps,
  WizardWaiting,
} from './PromptInterviewParts';
import { usePromptInterview } from './usePromptInterview';
import '@nldd/design-system/button';
import '@nldd/design-system/cell';
import '@nldd/design-system/checkbox';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/page';
import '@nldd/design-system/sheet';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';
import '@nldd/design-system/top-title-bar';

type Step = 'context' | 'taak' | 'vragen' | 'schrijven';

const STAPPEN: Step[] = ['taak', 'vragen', 'schrijven'];
const STAP_LABELS = ['Taak', 'Vragen', 'Prompt'];

/** Zoveel tekst uit de bijlagen van deze chat leest de vragenronde mee. */
const MAX_ATTACHMENT_EXCERPT = 6_000;

/** Eén klik zet de richting, daarna vul je hem zelf aan. */
const RICHTINGEN = [
  { label: 'Tekst schrijven', tekst: 'Ik wil een tekst laten schrijven over ', icon: 'edit-text-document' },
  { label: 'Tekst nakijken', tekst: 'Ik wil mijn tekst laten nakijken op ', icon: 'checked-text-document' },
  { label: 'Stuk samenvatten', tekst: 'Ik wil een lang stuk laten samenvatten voor ', icon: 'file-text' },
  { label: 'Iets uitzoeken', tekst: 'Ik wil laten uitzoeken ', icon: 'search' },
];

const bronnen = (n: number) => (n === 1 ? '1 bron' : `${n} bronnen`);

/** Wat er in het tekstvak komt als de context prompt klaar is. */
export interface ContextPrompt {
  draft: ProjectPromptDraft;
  projectId: string | null;
}

/** A project to link to the chat: a checkbox row, checked while it is the chat's project. */
function ProjectRow({ project, on, onToggle }: { project: ChatProject; on: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'change', () => onToggle());
  return (
    <nldd-list-item ref={ref} checkbox checked={on || undefined}>
      <nldd-icon-cell icon="folder" color="accent"></nldd-icon-cell>
      <nldd-spacer-cell size="12"></nldd-spacer-cell>
      <nldd-text-cell text={project.name} supporting-text={bronnen(project.fileCount ?? 0)}></nldd-text-cell>
      <nldd-cell>
        <nldd-checkbox decorative checked={on || undefined}></nldd-checkbox>
      </nldd-cell>
    </nldd-list-item>
  );
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

  const [sheetOpen, setSheetOpen] = useState(true);
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

  // The task field takes focus once the sheet has opened.
  useEffect(() => {
    if (step !== 'taak') return;
    const timer = window.setTimeout(() => taskRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [step]);

  const errorBox = error && (
    <>
      <WizardError message={error} onRetry={interview.retry} />
      <nldd-spacer size="16"></nldd-spacer>
    </>
  );
  const backButton = (
    <nldd-button appearance="neutral-transparent" start-icon="arrow-left" text="Terug" onClick={goBack}></nldd-button>
  );

  return createPortal(
    <>
      <nldd-sheet ref={sheetRef} open={sheetOpen || undefined} width="640px">
        <nldd-page>
          <nldd-top-title-bar
            slot="header"
            text={step === 'context' ? 'Projecten' : 'Context prompt'}
            dismiss-text="Sluit"
          ></nldd-top-title-bar>
          <nldd-simple-section>
            {step !== 'context' && <WizardSteps labels={STAP_LABELS} current={STAPPEN.indexOf(step)} />}

            {step === 'context' && (
              <nldd-container gap="16">
                <nldd-title heading-level={2} size={4} text="Welk project hoort bij deze chat?"></nldd-title>

                {isLoggedIn ? (
                  <nldd-list appearance="box-tinted" accessible-label="Projecten">
                    {projects.map((p) => {
                      const on = p.id === projectId;
                      return (
                        <ProjectRow
                          key={p.id}
                          project={p}
                          on={on}
                          onToggle={() => onApplyProject(on ? null : p.id)}
                        />
                      );
                    })}
                    <nldd-list-item button onClick={onNewProject}>
                      <nldd-icon-cell icon="add" color="accent"></nldd-icon-cell>
                      <nldd-spacer-cell size="12"></nldd-spacer-cell>
                      <nldd-text-cell text="Nieuw project" color="accent"></nldd-text-cell>
                    </nldd-list-item>
                  </nldd-list>
                ) : (
                  <nldd-button appearance="secondary" start-icon="login" text="Log in voor je projecten" onClick={onLogin}></nldd-button>
                )}

                {chatStarted && (
                  <nldd-text size="sm">Een ander project start een nieuwe chat; deze blijft bewaard.</nldd-text>
                )}

                {!project && (
                  <nldd-container horizontal-alignment="right">
                    <nldd-button appearance="primary" start-icon="magic" text="Context prompt" onClick={() => setStep('taak')}></nldd-button>
                  </nldd-container>
                )}
              </nldd-container>
            )}

            {step === 'taak' && (
              <nldd-container gap="16">
                {project && (
                  <nldd-container layout="row">
                    <nldd-tag icon="folder" color="accent" text={project.name}></nldd-tag>
                  </nldd-container>
                )}
                <nldd-form-field label="Wat wil je bereiken?">
                  <nldd-multi-line-text-field ref={taskRef} rows={3} maxlength="2000"></nldd-multi-line-text-field>
                </nldd-form-field>
                <nldd-container layout="wrap" gap="8">
                  {RICHTINGEN.map(({ label, tekst, icon }) => (
                    <nldd-button
                      key={label}
                      appearance="secondary"
                      start-icon={icon}
                      text={label}
                      onClick={() => {
                        setGoal(tekst);
                        taskRef.current?.focus();
                      }}
                    ></nldd-button>
                  ))}
                </nldd-container>
                <nldd-container layout="row" gap="8" vertical-alignment="center">
                  {startAt === 'context' && (
                    <nldd-button
                      appearance="neutral-transparent"
                      start-icon="arrow-left"
                      text="Terug"
                      onClick={() => setStep('context')}
                    ></nldd-button>
                  )}
                  <nldd-spacer size="flexible"></nldd-spacer>
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
                <nldd-container layout="wrap" gap="8" vertical-alignment="center">
                  {backButton}
                  <nldd-spacer size="flexible"></nldd-spacer>
                  {!busy && question?.vraag && answered.length > 0 && (
                    <nldd-button appearance="secondary" start-icon="magic" text="Maak de prompt" onClick={interview.finishEarly}></nldd-button>
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

            {step === 'schrijven' && (
              <nldd-container gap="16">
                {errorBox}
                {busy && <WizardWaiting label="Ik kies een aanpak en schrijf je prompt" />}
                {!busy && backButton}
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
