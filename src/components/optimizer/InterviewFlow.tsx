import { useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { runPlanStep } from '@/services/optimizeService';
import { structureFormat } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import type { AiSettings } from '@/services/settingsService';
import { InterviewPanel } from './InterviewPanel';
import type { PlanStep, Technique, TranscriptTurn } from '@/types';

/**
 * Zelfstandig vraag-na-vraag-interview voor de losse techniek-keuze (Chain-of-
 * Thought / Socratic). Draait dezelfde interview-lus als de plan-bouwer (via
 * `runPlanStep`), maar los van een plan: die technieken hebben geen vragenlijst,
 * hun "invulwerk" ís het gesprek. Zodra de AI afrondt met een conclusie, roept
 * het `onComplete(material)` aan — die conclusie voedt het genereren.
 */
export default function InterviewFlow({
  technique,
  settings,
  goal,
  projectContext,
  onComplete,
}: {
  technique: Technique;
  settings: AiSettings;
  /** Startcontext (bijv. het startpunt-/doelveld); voedt de eerste vraag. */
  goal?: string;
  /** Context van het aangehaakte chatproject; zie buildGeneratorContext. */
  projectContext?: string;
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
        projectContext,
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
