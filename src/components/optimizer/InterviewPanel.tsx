import { useEffect, useState } from 'react';
import { ArrowRight, Check, Dices, Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { runPlanStep } from '@/services/optimizeService';
import { structureFormat } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import type { AiSettings } from '@/services/settingsService';
import type { PlanStep, Technique, TranscriptTurn } from '@/types';

/**
 * De pure UI van het vraag-na-vraag-interview: het gesprek tot nu toe, de huidige
 * vraag met een antwoordveld, en de acties (volgende vraag / afronden). Gedeeld
 * door de plan-bouwer en de losse techniek-keuze zodat de weergave identiek is.
 */
export function InterviewPanel({
  socratic,
  intro,
  analysis,
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
   * Wat de AI van het vraagstuk heeft gemaakt: de prompttechniek die ze nu volgt
   * en waarom. Staat boven de vraag, zodat zichtbaar is waar de vragen vandaan
   * komen in plaats van dat ze uit de lucht lijken te vallen. Afwezig = niets
   * tonen (bijvoorbeeld in het plan-interview, waar de techniek al vaststaat).
   */
  analysis?: { technique?: string; text?: string } | null;
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
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {intro ??
            (socratic
              ? 'De AI stelt alleen vragen (max. 7) zodat jij je eigen denken aanscherpt — geen antwoorden of adviezen. Klaar? Rond af voor een neutrale samenvatting van jouw inzichten.'
              : 'De AI stelt op basis van je antwoorden telkens de volgende vraag (max. 7), tot het beeld compleet is. Klaar met input geven? Rond dan af — de AI trekt dan meteen een conclusie.')}
        </p>
      </div>

      {/* Het gesprek tot nu toe. */}
      {transcript.length > 0 && (
        <ul className="space-y-2">
          {transcript.map((t, i) => (
            <li
              key={i}
              className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="font-medium text-slate-600 dark:text-slate-300">
                {i + 1}. {stripMarkdown(t.question)}
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">{t.answer}</p>
            </li>
          ))}
        </ul>
      )}

      {/* De techniek die de AI heeft gekozen, vlak boven de vraag: zo is zichtbaar
          waar de vragen vandaan komen. Bewust één regel zonder toelichting — de
          motivatie die het model meestuurt houdt de keuze scherp, maar hoort niet
          op het scherm. stripMarkdown haalt de sterretjes eraf die het model er
          soms omheen zet; het vet komt hier van de opmaak, niet van de tekst.
          Kan tussen twee vragen wisselen als een antwoord de AI van gedachten
          doet veranderen. */}
      {analysis?.technique && (
        <div className="flex items-center gap-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/70 px-3 py-2 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          <Sparkles size={15} className="shrink-0 text-rijksblauw-500" />
          <p className="min-w-0 text-xs text-rijksblauw-700 dark:text-rijksblauw-200">
            Techniek: <strong className="font-bold">{stripMarkdown(analysis.technique)}</strong>
          </p>
        </div>
      )}

      {/* De huidige vraag + antwoordveld, of een laadstaat terwijl de AI nadenkt. */}
      {busy && !question ? (
        <div className="flex items-center gap-2 rounded-xl border border-rijksblauw-200 bg-white p-3 text-sm text-rijksblauw-600 dark:border-rijksblauw-500/30 dark:bg-slate-800 dark:text-rijksblauw-300">
          <Loader2 size={16} className="animate-spin" />
          {finishing
            ? 'We zetten het totaalplaatje op een rij en kijken wat er nog mist…'
            : transcript.length === 0
              ? 'De eerste vraag wordt opgesteld…'
              : 'De AI denkt na over de volgende vraag…'}
        </div>
      ) : question ? (
        <div className="rounded-xl border border-rijksblauw-200 bg-white p-3 dark:border-rijksblauw-500/30 dark:bg-slate-800">
          <p className="flex items-start gap-2 text-sm font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
            <MessageCircleQuestion size={16} className="mt-0.5 shrink-0" />
            <span>
              Vraag {transcript.length + 1}: {stripMarkdown(question)}
            </span>
          </p>
          <textarea
            className="opl-input mt-2 min-h-[72px] resize-y"
            value={answer}
            placeholder="Typ je antwoord…"
            autoFocus
            disabled={busy}
            onChange={(e) => onAnswerChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          {/* Testknop, alleen voor beheerders: de aanroeper geeft deze handler
              uitsluitend mee als de gebruiker admin is. Laat de AI een passend
              antwoord verzinnen, zodat een beheerder de hele vragenronde kan
              doorlopen zonder elke vraag zelf te beantwoorden. Het verzonnen
              antwoord komt gewoon in het veld te staan en is dus zichtbaar en
              aanpasbaar voordat het meetelt. */}
          {onInventAnswer && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rijksoranje/50 px-2 py-1 text-xs font-medium text-rijksoranje transition-colors hover:bg-rijksoranje/10 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void onInventAnswer()}
              disabled={busy || inventing}
              title="Alleen voor beheerders: laat de AI een testantwoord op deze vraag verzinnen"
            >
              {inventing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Dices size={13} />
              )}
              {inventing ? 'Antwoord verzinnen…' : 'Verzin een testantwoord'}
              <span className="rounded bg-rijksoranje/15 px-1 py-px text-[10px] uppercase tracking-wide">
                admin
              </span>
            </button>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="opl-btn-secondary"
              onClick={onFinish}
              disabled={busy}
              title={
                socratic
                  ? 'Rond af; de AI vat jouw eigen inzichten neutraal samen (zonder oordeel)'
                  : 'Rond het interview af; de AI trekt een conclusie op basis van je antwoorden'
              }
            >
              <Check size={16} /> Ik heb genoeg gedeeld
            </button>
            <button
              type="button"
              className="opl-btn-primary"
              onClick={onSubmit}
              disabled={busy || !answer.trim()}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Volgende vraag
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
          <Check size={15} /> {socratic ? 'Samenvatting van je inzichten' : 'Conclusie van het gesprek'}
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
