import { useEffect, useRef, type RefObject } from 'react';
import type { ProjectInterviewStep } from '@/services/projectPromptService';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import '@nldd/design-system/banner';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/cell';
import '@nldd/design-system/checkbox';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/step-bar';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/**
 * Enter submits, Shift+Enter starts a new line. The keydown of the textarea inside
 * an nldd field is composed, so it reaches a listener on the field itself.
 */
export function useSubmitOnEnter(ref: RefObject<HTMLElement | null>, submit: () => void) {
  useNlddEvent<KeyboardEvent>(ref, 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
}

/** De balk met stappen boven in "Prompt maken" en het projectvenster. */
export function WizardSteps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <>
      <nldd-step-bar accessible-label="Stappen">
        {labels.map((label, i) => (
          <nldd-step-bar-item
            key={label}
            text={label}
            status={i === current ? 'current' : undefined}
          ></nldd-step-bar-item>
        ))}
      </nldd-step-bar>
      <nldd-spacer size="20"></nldd-spacer>
    </>
  );
}

export function WizardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <nldd-banner variant="critical" size="sm" text={message}>
      <nldd-button slot="actions" appearance="secondary" start-icon="refresh" text="Opnieuw" onClick={onRetry}></nldd-button>
    </nldd-banner>
  );
}

export function WizardWaiting({ label }: { label: string }) {
  return (
    <nldd-container padding-block="48">
      <nldd-inline-dialog variant="loading" text={label}></nldd-inline-dialog>
    </nldd-container>
  );
}

/** One answer option of the interview: a checkbox row, the whole row is the control. */
function OptionRow({ optie, on, onToggle }: { optie: string; on: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'change', () => onToggle());
  return (
    <nldd-list-item ref={ref} checkbox checked={on || undefined}>
      <nldd-cell>
        <nldd-checkbox decorative checked={on || undefined}></nldd-checkbox>
      </nldd-cell>
      <nldd-spacer-cell size="12"></nldd-spacer-cell>
      <nldd-text-cell text={optie}></nldd-text-cell>
    </nldd-list-item>
  );
}

/** Eén vraag van de vragenronde: wat de AI begrijpt, de vraag, opties en typen. */
export function InterviewQuestion({
  question,
  number,
  picked,
  answer,
  onTogglePick,
  onAnswer,
  onSubmit,
}: {
  question: ProjectInterviewStep;
  number: number;
  picked: string[];
  answer: string;
  onTogglePick: (optie: string) => void;
  onAnswer: (text: string) => void;
  onSubmit: () => void;
}) {
  const headingRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(fieldRef, answer, onAnswer);
  useSubmitOnEnter(fieldRef, onSubmit);

  // A new question takes focus, so a screen reader reads it out at once.
  useEffect(() => {
    headingRef.current?.focus();
  }, [question]);

  return (
    <nldd-container gap="16">
      {question.begrip && (
        <nldd-box background="accent-tinted">
          <nldd-container padding="12">
            <nldd-text size="sm">{question.begrip}</nldd-text>
          </nldd-container>
        </nldd-box>
      )}
      <nldd-title
        ref={headingRef}
        tabIndex={-1}
        heading-level={3}
        size={4}
        overline={`Vraag ${number}${question.max ? ` van ${question.max}` : ''}`}
        text={question.vraag}
      ></nldd-title>
      {(question.opties?.length ?? 0) > 0 && (
        <nldd-list appearance="box-tinted" accessible-label={question.vraag}>
          {question.opties?.map((optie) => (
            <OptionRow
              key={optie}
              optie={optie}
              on={picked.includes(optie)}
              onToggle={() => onTogglePick(optie)}
            />
          ))}
        </nldd-list>
      )}
      <nldd-multi-line-text-field
        ref={fieldRef}
        rows={2}
        accessible-label="Typ er iets bij"
        placeholder="Typ er iets bij"
        maxlength="2000"
      ></nldd-multi-line-text-field>
    </nldd-container>
  );
}
