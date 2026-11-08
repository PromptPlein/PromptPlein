import { useEffect, useRef, useState } from 'react';
import { useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import { runPlanStep } from '@/services/optimizeService';
import { structureFormat } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import type { AiSettings } from '@/services/settingsService';
import InterviewSteps from './InterviewSteps';
import type { PlanStep, Technique, TranscriptTurn } from '@/types';

/**
 * De pure UI van het vraag-na-vraag-interview: het gesprek tot nu toe, de huidige
 * vraag met een antwoordveld, en de acties (volgende vraag / afronden). Gedeeld
 * door de plan-bouwer en de losse techniek-keuze zodat de weergave identiek is.
 */
export function InterviewPanel({
  socratic,
  intro,
  step,
  question,
  transcript,
  answer,
  busy,
  finishing = false,
  onAnswerChange,
  onSubmit,
  onFinish,
  onInventAnswer,
  inventing = false,
}: {
  /** Socratisch: de AI stelt alleen vragen zodat JIJ tot inzicht komt (geen conclusie). */
  socratic: boolean;
  /**
   * Eigen introtekst boven het gesprek. Leeg = de standaardtekst die bij de
   * gekozen toon (socratisch of niet) hoort. De doel-flow zet hier zijn eigen
   * tekst neer: die dialoog kent een ander vragenmaximum.
   */
  intro?: string;
  /**
   * De stap uit de vaste vraaglijn waar de openstaande vraag bij hoort. Alleen
   * de brainstormsessie levert die; ontbreekt hij, dan blijft de voortgangsbalk
   * weg (het plan-interview kent geen vaste lijn).
   */
  step?: string | null;
  question: string | null;
  transcript: TranscriptTurn[];
  answer: string;
  busy: boolean;
  /**
   * Het gesprek is klaar en het totaalplaatje wordt samengevat/getoetst. Alleen
   * de laadtekst verschilt — de gebruiker wacht dan niet op een volgende vraag.
   */
  finishing?: boolean;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onFinish: () => void;
  /**
   * Beheerdershulp: laat de AI een testantwoord op de huidige vraag verzinnen.
   * Alleen meegeven als de gebruiker admin is — de knop verschijnt precies dan.
   */
  onInventAnswer?: () => void | Promise<void>;
  /** Staat er nu een testantwoord te wachten? */
  inventing?: boolean;
}) {
  return (
    <nldd-container gap="12">
      <nldd-container layout="row" gap="8">
        <nldd-icon icon="question-mark-circle" size="20" color="lintblauw"></nldd-icon>
        <nldd-text size="sm" color="secondary">
          {intro ??
            (socratic
              ? 'De AI stelt alleen vragen (max. 7) zodat jij je eigen denken aanscherpt, zonder antwoorden of adviezen. Weet je iets niet? Zeg dat gerust; de volgende vraag wordt dan concreter. Klaar? Rond af voor een neutrale samenvatting van je aannames, met per aanname hoe zeker die is.'
              : 'De AI stelt op basis van je antwoorden telkens de volgende vraag (max. 7), tot het beeld compleet is. Klaar met input geven? Rond dan af; de AI trekt dan meteen een conclusie.')}
        </nldd-text>
      </nldd-container>

      {/* Where the conversation stands. Only when the caller supplies steps. */}
      {step !== undefined && (
        <InterviewSteps current={step} answered={transcript.length} busy={busy && !question} />
      )}

      {/* The conversation so far. */}
      {transcript.length > 0 && (
        <nldd-list appearance="box-base" accessible-label="Het gesprek tot nu toe">
          {transcript.map((t, i) => (
            <nldd-list-item key={i} size="sm">
              <nldd-text-cell size="sm" text={`${i + 1}. ${stripMarkdown(t.question)}`} supporting-text={t.answer}></nldd-text-cell>
            </nldd-list-item>
          ))}
        </nldd-list>
      )}

      {/* The current question with its answer field, or a loading state while the AI thinks. */}
      {busy && !question ? (
        <nldd-card>
          <nldd-container padding="12" gap="8">
            <nldd-container layout="row" gap="8" vertical-alignment="center">
              <nldd-activity-indicator size="16"></nldd-activity-indicator>
              <nldd-text size="sm" color="accent">
                {finishing
                  ? 'We zetten het totaalplaatje op een rij en kijken wat er nog mist…'
                  : transcript.length === 0
                    ? 'De eerste vraag wordt opgesteld…'
                    : 'De AI denkt na over de volgende vraag…'}
              </nldd-text>
            </nldd-container>
            {/* Indeterminate progress: something happens, without promising a wait we do not know. */}
            <nldd-progress-bar size="sm" indeterminate value-display="none" accessible-label="De AI denkt na"></nldd-progress-bar>
          </nldd-container>
        </nldd-card>
      ) : question ? (
        <nldd-card>
          <nldd-container padding="12" gap="8">
            <nldd-form-field label={`Vraag ${transcript.length + 1}: ${stripMarkdown(question)}`}>
              <AnswerField
                question={question}
                value={answer}
                disabled={busy}
                onValue={onAnswerChange}
                onSubmit={onSubmit}
              />
            </nldd-form-field>
            {/* Test button for administrators only: the caller passes this handler
                only when the user is an admin. The AI makes up a fitting answer,
                so an administrator can walk the whole round without answering
                each question. The answer lands in the field, visible and editable
                before it counts. */}
            {onInventAnswer && (
              <nldd-container layout="row" gap="8" vertical-alignment="center">
                <nldd-tooltip text="Alleen voor beheerders: laat de AI een testantwoord op deze vraag verzinnen">
                  <nldd-button
                    appearance="neutral-tinted"
                    size="xs"
                    start-icon="magic"
                    text="Verzin een testantwoord"
                    loading={inventing || undefined}
                    loading-text="Antwoord verzinnen…"
                    disabled={busy || inventing || undefined}
                    onClick={() => void onInventAnswer()}
                  ></nldd-button>
                </nldd-tooltip>
                <nldd-tag size="sm" color="oranje" text="admin"></nldd-tag>
              </nldd-container>
            )}

            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-tooltip
                text={
                  socratic
                    ? 'Rond af; de AI zet je aannames neutraal op een rij, met per aanname hoe zeker die is (zonder oordeel)'
                    : 'Rond het interview af; de AI trekt een conclusie op basis van je antwoorden'
                }
              >
                <nldd-button
                  appearance="secondary"
                  start-icon="check-mark"
                  text="Ik heb genoeg gedeeld"
                  disabled={busy || undefined}
                  onClick={onFinish}
                ></nldd-button>
              </nldd-tooltip>
              <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
              <nldd-button
                appearance="primary"
                end-icon="arrow-right"
                text="Volgende vraag"
                loading={busy || undefined}
                disabled={busy || !answer.trim() || undefined}
                onClick={onSubmit}
              ></nldd-button>
            </nldd-container>
          </nldd-container>
        </nldd-card>
      ) : null}
    </nldd-container>
  );
}

/**
 * The answer field of the open question. It mounts with the question, so its
 * binding does too; a new question puts the cursor in it. Enter sends,
 * Shift+Enter starts a new line.
 */
function AnswerField({
  question,
  value,
  disabled,
  onValue,
  onSubmit,
}: {
  question: string;
  value: string;
  disabled: boolean;
  onValue: (value: string) => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  useEffect(() => {
    ref.current?.focus();
  }, [question]);
  return (
    <nldd-multi-line-text-field
      ref={ref}
      rows={3}
      resize="vertical"
      placeholder="Typ je antwoord…"
      disabled={disabled || undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
    ></nldd-multi-line-text-field>
  );
}

/**
 * Zelfstandig vraag-na-vraag-interview voor de LOSSE techniek-keuze (Chain-of-
 * Thought / Socratic). Draait dezelfde interview-lus als de plan-bouwer (via
 * `runPlanStep`), maar los van het plan. Zodra de AI afrondt met een conclusie,
 * roept het `onComplete(material)` aan — die conclusie voedt het genereren.
 */
export default function InterviewFlow({
  technique,
  settings,
  goal,
  onComplete,
}: {
  technique: Technique;
  settings: AiSettings;
  /** Startcontext (bijv. het startpunt-/doelveld); voedt de eerste vraag. */
  goal?: string;
  /** Aangeroepen met de conclusie/samenvatting zodra het interview klaar is. */
  onComplete: (material: string) => void;
}) {
  const format = structureFormat(technique);
  const socratic = format === 'socratic';
  const [question, setQuestion] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Een synthetische plan-stap zodat we runPlanStep kunnen hergebruiken.
  const step: PlanStep = {
    id: 'solo',
    technique_id: technique.id,
    title: technique.name,
    rationale: '',
    produces: 'brief',
    structure_format: format,
    interactive: true,
  };

  // Start het interview automatisch bij het monteren.
  useEffect(() => {
    void turn([], false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGoal = (goal ?? '').trim();

  async function turn(turns: TranscriptTurn[], forceFinish: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await runPlanStep({
        // In de losse keuze is er vaak nog geen doel; laat de AI daar dan zelf
        // eerst naar vragen (noContext) i.p.v. iets te verzinnen.
        goal: startGoal,
        step,
        techniqueName: technique.name,
        interactive: true,
        transcript: turns,
        forceFinish,
        noContext: !startGoal,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        setError(res.reason?.trim() || 'Je invoer is nog niet duidelijk genoeg.');
        return;
      }
      if (res.needs_input && res.question) {
        setQuestion(res.question);
        setAnswer('');
        return;
      }
      if (res.material) {
        setQuestion(null);
        setDone(res.material);
        onComplete(res.material);
        return;
      }
      setError(res.error ?? 'De volgende vraag kon niet worden opgehaald.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Interview mislukt.');
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!question) return;
    const a = answer.trim();
    if (!a) {
      notify.error('Vul eerst een antwoord in, of rond af.');
      return;
    }
    const findings: GuardrailFinding[] = [
      ...(settings.pii.enabled ? detectPii(a) : []),
      ...detectBlockedTopics(a, settings.blockedTopics),
    ];
    if (findings.length > 0) {
      // In deze losse flow tonen we de finding als toast i.p.v. een dialoog.
      notify.warning(`Let op: mogelijk gevoelige inhoud (${findings.map((f) => f.label).join(', ')}).`);
    }
    const turns = [...transcript, { question, answer: a }];
    setTranscript(turns);
    setQuestion(null);
    void turn(turns, false);
  }

  function finish() {
    setQuestion(null);
    void turn(transcript, true);
  }

  // Done: show the conclusion; generating uses this content.
  if (done) {
    return (
      <nldd-box background="tinted">
        <nldd-container padding="16" gap="8">
          <nldd-container layout="row" gap="8" vertical-alignment="center">
            <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
            <nldd-text size="sm" weight="bold" color="success">
              {socratic ? 'Samenvatting van je inzichten' : 'Conclusie van het gesprek'}
            </nldd-text>
          </nldd-container>
          <nldd-code-viewer appearance="box-base" wrap no-copy max-height="16rem">
            {done}
          </nldd-code-viewer>
          <nldd-text size="xs" color="secondary">
            Klik hieronder op &quot;Bouw prompt&quot; om hier een herbruikbare prompt van te maken.
          </nldd-text>
        </nldd-container>
      </nldd-box>
    );
  }

  if (error) {
    return (
      <nldd-banner variant="critical" text={stripMarkdown(error)}>
        <nldd-button slot="actions" appearance="secondary" text="Opnieuw proberen" onClick={() => void turn(transcript, false)}></nldd-button>
      </nldd-banner>
    );
  }

  return (
    <InterviewPanel
      socratic={socratic}
      question={question}
      transcript={transcript}
      answer={answer}
      busy={busy}
      onAnswerChange={setAnswer}
      onSubmit={submit}
      onFinish={finish}
    />
  );
}
