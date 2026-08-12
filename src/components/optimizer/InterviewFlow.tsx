import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import toast from 'react-hot-toast';
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
      toast.error('Vul eerst een antwoord in, of rond af.');
      return;
    }
    const findings: GuardrailFinding[] = [
      ...(settings.pii.enabled ? detectPii(a) : []),
      ...detectBlockedTopics(a, settings.blockedTopics),
    ];
    if (findings.length > 0) {
      // In deze losse flow tonen we de finding als toast i.p.v. een dialoog.
      toast(`Let op: mogelijk gevoelige inhoud (${findings.map((f) => f.label).join(', ')}).`, {
        icon: '⚠️',
      });
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

  // Klaar: toon de conclusie/samenvatting; het genereren gebruikt deze inhoud.
  if (done) {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          <Check size={15} />{' '}
          {socratic ? 'Samenvatting van je inzichten' : 'Conclusie van het gesprek'}
        </p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-200 bg-white p-3 text-xs leading-relaxed text-slate-700 dark:border-emerald-500/20 dark:bg-slate-900 dark:text-slate-200">
          {done}
        </pre>
        <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70">
          Klik hieronder op &quot;Bouw prompt&quot; om hier een herbruikbare prompt van te maken.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200">
        <span>{stripMarkdown(error)}</span>
        <button
          type="button"
          className="opl-btn-secondary shrink-0"
          onClick={() => void turn(transcript, false)}
        >
          Opnieuw proberen
        </button>
      </div>
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
