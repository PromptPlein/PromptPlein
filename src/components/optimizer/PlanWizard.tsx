import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  Info,
  Loader2,
  MessageCircleQuestion,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  generatePlan,
  generatePrompt,
  runPlanStep,
  serializeOutcomes,
} from '@/services/optimizeService';
import { isContextPrompt } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import type { AiSettings } from '@/services/settingsService';
import OptimizingLoader from './OptimizingLoader';
import GuardrailDialog from './GuardrailDialog';
import type {
  OptimizeResult,
  PlanStep,
  PromptPlan,
  StepOutcome,
  Technique,
  TranscriptTurn,
} from '@/types';

/**
 * Voorbeeldantwoorden op "Wat wil je graag bereiken?". Anders dan bij de losse
 * techniek-aanbeveling gaat het hier om samengestelde doelen die meerdere
 * technieken vragen — precies waar de plan-bouwer sterk in is.
 */
const GOAL_EXAMPLES: string[] = [
  'Er moet een projectplan geschreven worden voor de invoering van een nieuwe interne tool.',
  'Ik wil een formele Kamerbrief opstellen die aansluit bij verschillende doelgroepen.',
  'Ik wil een adviesnota maken met een vaste structuur en een heldere onderbouwing.',
  'Help me een communicatieplan op te zetten voor een nieuw beleidstraject.',
];

/**
 * Vat een vraag-na-vraag-transcript samen tot een platte brief. Alleen gebruikt
 * als de harde vragen-bovengrens is bereikt: dan consolideren we lokaal wat er
 * ligt i.p.v. eindeloos door te vragen (de eind-compose maakt er alsnog een
 * vloeiende template van).
 */
function consolidateTranscript(turns: TranscriptTurn[]): string {
  return turns.map((t) => `${t.question}\n${t.answer}`).join('\n\n');
}

/** Menselijk leesbaar label per stap-uitkomst, voor de compose-context en de UI. */
function outcomeLabel(o: { produces: StepOutcome['produces'] }): string {
  switch (o.produces) {
    case 'persona':
      return 'Doelgroep / persona';
    case 'format':
      return 'Format / structuur';
    case 'brief':
      return 'Inhoudelijke brief';
    default:
      return 'Materiaal';
  }
}

interface PlanWizardProps {
  /** Admin-bepaalde AI-instellingen (provider, systeemprompt, toon, temperatuur). */
  settings: AiSettings;
  /**
   * Aangeroepen met het uiteindelijke resultaat + de gebruikte techniek. De
   * techniek is VERPLICHT: OptimizedOutput leest daar naam/id/metadata uit.
   */
  onResult: (result: OptimizeResult, technique: Technique) => void;
  /** De instap-tabs; vallen bovenin het blauw-omrande generator-blok. */
  header?: ReactNode;
}

/**
 * Fase van de wizard:
 *  - goal            → doel invoeren
 *  - planning        → AI stelt het plan op
 *  - plan-review     → plan inzien/aanpassen
 *  - executing       → stappen sequentieel uitvoeren (materiaal verzamelen)
 *  - awaiting-answer → interactieve stap: wacht op het antwoord van de gebruiker
 *  - error           → een stap mislukte; retry mogelijk (materiaal blijft behouden)
 */
type Phase = 'goal' | 'planning' | 'plan-review' | 'executing' | 'awaiting-answer' | 'error';

/** Harde grens op het aantal vragen per interactieve stap (voorkomt eindeloos interviewen). */
const MAX_INTERVIEW_TURNS = 7;

/**
 * Slimme meerstaps-bouwer voor de doel-flow ("Help mij met een prompt om mijn
 * doel te bereiken"). De gebruiker beschrijft het doel; de AI stelt een geordend
 * PLAN op van technieken die samen één herbruikbare template opbouwen. De
 * gebruiker ziet het plan, kan stappen verwijderen, en start dan de bouw.
 *
 * Fase 3 (deze versie): het plan wordt STAP VOOR STAP uitgevoerd. Niet-interactieve
 * stappen verzamelen in één keer materiaal (persona, format-rubrieken); INTERACTIEVE
 * stappen (chain-of-thought / socratic) voeren een echt vraag-na-vraag-interview:
 * de AI stelt één vraag tegelijk tot er een geconsolideerde brief staat. Al het
 * verzamelde materiaal wordt als context aan de volgende stap doorgegeven ("dat
 * wat gemaakt is gebruikt voor de volgende stap"); de laatste stap giet het via de
 * bestaande generate-modus in één coherente, herbruikbare template.
 */
export default function PlanWizard({ settings, onResult, header }: PlanWizardProps) {
  const { techniques, techniqueById } = useReferenceData();
  // Deelt de 'goal'-draftsleutel met OptimizerPage, zodat de pagina-brede
  // "Opschonen"-knop, hasDraftContent en OptimizedOutput's titel-fallback blijven
  // werken zonder de state omhoog te tillen.
  const [goal, setGoal, clearGoal] = usePersistentDraft('goal');
  const [phase, setPhase] = useState<Phase>('goal');
  const [plan, setPlan] = useState<PromptPlan | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  const [guardrailFindings, setGuardrailFindings] = useState<GuardrailFinding[] | null>(null);
  // Uitvoering: welke stap draait, het al verzamelde materiaal, en een foutmelding.
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  // Interactieve stap (vraag-na-vraag): de huidige vraag, het transcript en het
  // antwoordveld. `interviewIndex` markeert bij welke stap het interview loopt.
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [answerDraft, setAnswerDraft] = useState('');

  const busy = phase === 'planning' || phase === 'executing';

  /** Wis doel + afgeleide state en begin opnieuw. */
  function handleClear() {
    clearGoal();
    setPlan(null);
    setPhase('goal');
    setUnclearReason(null);
    setShowExamples(false);
    setGuardrailFindings(null);
    setCurrentStepIndex(0);
    setOutcomes([]);
    setStepError(null);
    setCurrentQuestion(null);
    setTranscript([]);
    setAnswerDraft('');
  }

  /** Vraag de AI om een plan; guardrail-check eerst. */
  function handlePlan() {
    if (!goal.trim()) {
      toast.error('Beschrijf eerst wat je wilt bereiken.');
      return;
    }
    const findings: GuardrailFinding[] = [
      ...(settings.pii.enabled ? detectPii(goal) : []),
      ...detectBlockedTopics(goal, settings.blockedTopics),
    ];
    if (findings.length > 0) {
      setGuardrailFindings(findings);
      return;
    }
    void runPlan();
  }

  async function runPlan() {
    setGuardrailFindings(null);
    setUnclearReason(null);
    setPhase('planning');
    try {
      // Complexe-doel-flow: alleen losse prompttechnieken plannen; complete
      // frameworks horen bij de eigen-prompt-flow.
      const candidates = techniques.filter((t) => !isContextPrompt(t));
      const res = await generatePlan({
        goal: goal.trim(),
        techniques: candidates,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je omschrijving is nog niet duidelijk genoeg. Beschrijf concreet wat je wilt bereiken.',
        );
        setPhase('goal');
        return;
      }
      if (res.error) toast(res.error, { icon: '⚠️' });
      if (!res.plan || res.plan.steps.length === 0) {
        toast('Geen plan gevonden. Probeer je doel iets concreter te maken.', { icon: 'ℹ️' });
        setPhase('goal');
        return;
      }
      setPlan(res.plan);
      setPhase('plan-review');
    } catch {
      toast.error('Plan opstellen mislukt. Probeer het opnieuw.');
      setPhase('goal');
    }
  }

  /** Verwijder een stap uit het plan (minimaal één stap blijft staan). */
  function removeStep(id: string) {
    setPlan((prev) => {
      if (!prev || prev.steps.length <= 1) return prev;
      return { ...prev, steps: prev.steps.filter((s) => s.id !== id) };
    });
  }

  /** Is dit de laatste stap? Die stelt de uiteindelijke template samen (compose). */
  function isLastStep(p: PromptPlan, index: number): boolean {
    return index >= p.steps.length - 1;
  }

  /** Start de uitvoering van het plan vanaf stap 0 met een schone lei. */
  function handleBuild() {
    if (!plan) return;
    setCurrentStepIndex(0);
    setOutcomes([]);
    setStepError(null);
    setUnclearReason(null);
    setPhase('executing');
    void runStep(plan, 0, []);
  }

  /** Herprobeer de huidige (mislukte) stap; behoud het al verzamelde materiaal. */
  function retryStep() {
    if (!plan) return;
    setStepError(null);
    setUnclearReason(null);
    const step = plan.steps[currentStepIndex];
    // Zat de fout midden in een interview, herpak dan die beurt met het transcript.
    if (step && step.interactive && !isLastStep(plan, currentStepIndex)) {
      setPhase('executing');
      void runInterviewTurn(plan, currentStepIndex, outcomes, transcript);
      return;
    }
    void runStep(plan, currentStepIndex, outcomes);
  }

  /** Ga naar de volgende stap met een uitkomst toegevoegd (of compose als laatste). */
  function advanceWith(p: PromptPlan, index: number, accumulated: StepOutcome[], outcome: StepOutcome) {
    const next = [...accumulated, outcome];
    setOutcomes(next);
    setCurrentQuestion(null);
    setTranscript([]);
    setAnswerDraft('');
    const nextIndex = index + 1;
    setCurrentStepIndex(nextIndex);
    void runStep(p, nextIndex, next);
  }

  /**
   * De driver. Voert stap `index` uit, waarbij `accumulated` het materiaal van
   * álle eerdere stappen bevat (expliciet doorgegeven om stale-closure-bugs met
   * de outcomes-state te vermijden). Dit is de thread-seam concreet:
   *  - Laatste stap → compose: giet al het materiaal via generate in één template.
   *  - Interactieve tussenstap → start een vraag-na-vraag-interview.
   *  - Andere tussenstap → verzamel materiaal in één keer en ga door.
   */
  async function runStep(p: PromptPlan, index: number, accumulated: StepOutcome[]) {
    const step = p.steps[index];
    if (!step) return;
    const technique = techniqueById(step.technique_id);
    if (!technique) {
      setStepError('Kon de techniek voor deze stap niet vinden.');
      setPhase('error');
      return;
    }

    // Laatste stap: stel de uiteindelijke template samen uit al het materiaal.
    if (isLastStep(p, index)) {
      setPhase('executing');
      try {
        const res = await generatePrompt({
          technique,
          promptContent: goal.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
          followUpAnswers: {},
          // Al het verzamelde materiaal als gelabelde context — exact het formaat
          // dat de generate-modus als "ANTWOORDEN VAN DE GEBRUIKER" verwerkt.
          extraAnsweredFields: accumulated.map((o) => ({
            id: o.step_id,
            label: outcomeLabel(o),
            answer: o.material,
          })),
          preferredProvider: settings.provider,
          preferredModel: settings.model,
          systemPrompt: settings.systemPrompt.trim() || undefined,
          toneInstruction: settings.toneInstruction.trim() || undefined,
          temperature: settings.temperature,
        });
        if (res.unclear) {
          setUnclearReason(
            res.reason?.trim() ||
              'Je invoer is niet duidelijk genoeg om er een zinvolle prompt van te maken.',
          );
          setStepError('De invoer was niet duidelijk genoeg voor de eindtemplate.');
          setPhase('error');
          return;
        }
        onResult(res, technique);
      } catch (err) {
        setStepError(err instanceof Error ? err.message : 'Template samenstellen mislukt.');
        setPhase('error');
      }
      return;
    }

    // Interactieve tussenstap: start het vraag-na-vraag-interview (leeg transcript).
    if (step.interactive) {
      setCurrentQuestion(null);
      setTranscript([]);
      setAnswerDraft('');
      setPhase('executing');
      void runInterviewTurn(p, index, accumulated, []);
      return;
    }

    // Gewone tussenstap: verzamel het uitgeschreven materiaal en ga door.
    setPhase('executing');
    const res = await runPlanStep({
      goal: goal.trim(),
      step,
      techniqueName: technique.name,
      outcomesSummary: serializeOutcomes(accumulated),
      preferredProvider: settings.provider,
      preferredModel: settings.model,
    });

    if (res.unclear) {
      setUnclearReason(
        res.reason?.trim() ||
          'Deze stap kon niet worden ingevuld. Verduidelijk je doel en probeer opnieuw.',
      );
      setStepError('De invoer was niet duidelijk genoeg voor deze stap.');
      setPhase('error');
      return;
    }
    if (!res.success || !res.material) {
      setStepError(res.error ?? 'Materiaal voor deze stap kon niet worden gegenereerd.');
      setPhase('error');
      return;
    }

    advanceWith(p, index, accumulated, {
      step_id: step.id,
      technique_id: step.technique_id,
      produces: step.produces,
      material: res.material,
    });
  }

  /**
   * Eén beurt van een interactieve stap. Vraagt de AI om óf de volgende vraag,
   * óf (als er genoeg bekend is) de geconsolideerde brief. `turns` is het
   * transcript tot nu toe (expliciet doorgegeven tegen stale closures).
   */
  async function runInterviewTurn(
    p: PromptPlan,
    index: number,
    accumulated: StepOutcome[],
    turns: TranscriptTurn[],
  ) {
    const step = p.steps[index];
    const technique = techniqueById(step.technique_id);
    if (!technique) {
      setStepError('Kon de techniek voor deze stap niet vinden.');
      setPhase('error');
      return;
    }

    const res = await runPlanStep({
      goal: goal.trim(),
      step,
      techniqueName: technique.name,
      outcomesSummary: serializeOutcomes(accumulated),
      interactive: true,
      transcript: turns,
      preferredProvider: settings.provider,
      preferredModel: settings.model,
    });

    if (res.unclear) {
      setUnclearReason(
        res.reason?.trim() ||
          'Deze stap kon niet worden ingevuld. Verduidelijk je doel en probeer opnieuw.',
      );
      setStepError('De invoer was niet duidelijk genoeg voor deze stap.');
      setPhase('error');
      return;
    }

    // De AI heeft nog een vraag — maar respecteer de harde bovengrens.
    if (res.success && res.needs_input && res.question) {
      if (turns.length >= MAX_INTERVIEW_TURNS) {
        // Genoeg gevraagd: consolideer wat er ligt tot een brief i.p.v. door te vragen.
        advanceWith(p, index, accumulated, {
          step_id: step.id,
          technique_id: step.technique_id,
          produces: step.produces,
          material: consolidateTranscript(turns),
          transcript: turns,
        });
        return;
      }
      setCurrentQuestion(res.question);
      setTranscript(turns);
      setAnswerDraft('');
      setPhase('awaiting-answer');
      return;
    }

    // De AI rondde af met een brief (of degradeerde veilig naar materiaal).
    if (res.success && res.material) {
      advanceWith(p, index, accumulated, {
        step_id: step.id,
        technique_id: step.technique_id,
        produces: step.produces,
        material: res.material,
        transcript: turns,
      });
      return;
    }

    setStepError(res.error ?? 'De volgende vraag kon niet worden opgehaald.');
    setPhase('error');
  }

  /** De gebruiker beantwoordt de huidige interview-vraag; guardrail-check eerst. */
  function submitAnswer() {
    if (!plan || !currentQuestion) return;
    const answer = answerDraft.trim();
    if (!answer) {
      toast.error('Vul eerst een antwoord in.');
      return;
    }
    const findings: GuardrailFinding[] = [
      ...(settings.pii.enabled ? detectPii(answer) : []),
      ...detectBlockedTopics(answer, settings.blockedTopics),
    ];
    if (findings.length > 0) {
      setGuardrailFindings(findings);
      return;
    }
    const turns = [...transcript, { question: currentQuestion, answer }];
    setTranscript(turns);
    setCurrentQuestion(null);
    setPhase('executing');
    void runInterviewTurn(plan, currentStepIndex, outcomes, turns);
  }

  return (
    <div className="space-y-5">
      {/* Blauwe rand: deze doel-flow hoort bij de blauwe instap-tab. */}
      <div className="overflow-hidden rounded-2xl border-2 border-rijksblauw-500/60 shadow-sm dark:border-rijksblauw-500/50">
        <div
          className={clsx(
            'overflow-hidden',
            plan && 'border-b border-slate-200 dark:border-slate-700',
          )}
        >
          {header}
          <div className="space-y-5 bg-white p-5 dark:bg-slate-800 sm:p-6">
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="opl-label mb-0" htmlFor="plan-goal-input">
                  Wat wil je graag bereiken?
                </label>
                <button
                  type="button"
                  onClick={() => setShowExamples((v) => !v)}
                  aria-expanded={showExamples}
                  aria-controls="plan-goal-examples"
                  title="Bekijk voorbeelden"
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors',
                    showExamples
                      ? 'text-rijksblauw-700 dark:text-rijksblauw-200'
                      : 'text-slate-400 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:text-rijksblauw-300',
                  )}
                >
                  <Info size={15} />
                  <span>Voorbeelden</span>
                </button>
                {goal.trim() && (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Wis je doel en begin opnieuw"
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-slate-700 transition-colors hover:text-rijksoranje dark:text-slate-200 dark:hover:text-rijksoranje"
                  >
                    <Eraser size={15} />
                    <span>Opschonen</span>
                  </button>
                )}
              </div>

              {showExamples && (
                <div
                  id="plan-goal-examples"
                  className="animate-fade-in mb-3 space-y-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Voorbeelden van samengestelde doelen. Klik om er één in te vullen.
                  </p>
                  {GOAL_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        setGoal(ex);
                        setShowExamples(false);
                      }}
                      className="block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left text-sm leading-relaxed text-slate-600 transition-colors hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                id="plan-goal-input"
                className="opl-input min-h-[120px] resize-y"
                value={goal}
                disabled={busy}
                placeholder="Bijv. er moet een projectplan geschreven worden voor de invoering van een nieuwe interne tool"
                onChange={(e) => setGoal(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                We stellen een slim plan op dat meerdere technieken combineert tot één sterke,
                herbruikbare template.
              </p>
            </div>

            {phase !== 'plan-review' && (
              <button
                type="button"
                className="opl-btn-primary"
                onClick={handlePlan}
                disabled={busy || !goal.trim()}
              >
                {phase === 'planning' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Plan opstellen…
                  </>
                ) : (
                  <>
                    <Wand2 size={18} /> Stel een plan op
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Adviesdeel: het opgestelde plan (review) óf de uitvoering (executing). */}
        {plan && (
          <div className="space-y-5 bg-white p-5 dark:bg-slate-800 sm:p-6">
            {phase === 'planning' ? (
              <OptimizingLoader techniqueName="je plan" />
            ) : phase === 'plan-review' ? (
              <PlanReview
                plan={plan}
                techniqueById={techniqueById}
                onRemoveStep={removeStep}
                onBuild={handleBuild}
              />
            ) : (
              <PlanExecutor
                plan={plan}
                techniqueById={techniqueById}
                currentStepIndex={currentStepIndex}
                outcomes={outcomes}
                error={phase === 'error' ? stepError : null}
                onRetry={retryStep}
                awaitingAnswer={phase === 'awaiting-answer'}
                currentQuestion={currentQuestion}
                transcript={transcript}
                answerDraft={answerDraft}
                onAnswerChange={setAnswerDraft}
                onSubmitAnswer={submitAnswer}
              />
            )}
          </div>
        )}
      </div>

      {unclearReason && (
        <div
          role="alert"
          className="animate-fade-in flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Je omschrijving is nog niet duidelijk genoeg</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">
              {stripMarkdown(unclearReason)}
            </p>
          </div>
        </div>
      )}

      {guardrailFindings && (
        <GuardrailDialog
          findings={guardrailFindings}
          piiWarning={settings.pii.warning}
          onConfirm={() => void runPlan()}
          onCancel={() => setGuardrailFindings(null)}
        />
      )}
    </div>
  );
}

/** Het inspecteerbare plan: een genummerde stepper met verwijderbare stappen. */
function PlanReview({
  plan,
  techniqueById,
  onRemoveStep,
  onBuild,
}: {
  plan: PromptPlan;
  techniqueById: (id?: string | null) => Technique | undefined;
  onRemoveStep: (id: string) => void;
  onBuild: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Voorgesteld plan</p>
        {plan.summary && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {stripMarkdown(plan.summary)}
          </p>
        )}
      </div>

      <ol className="space-y-3">
        {plan.steps.map((step, idx) => {
          const technique = techniqueById(step.technique_id);
          return (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-semibold text-white">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {step.title}
                  </span>
                  {technique && (
                    <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                      {technique.name}
                    </span>
                  )}
                  {step.interactive && (
                    <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">
                      vraag na vraag
                    </span>
                  )}
                </div>
                {step.rationale && (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {stripMarkdown(step.rationale)}
                  </p>
                )}
              </div>
              {plan.steps.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemoveStep(step.id)}
                  title="Verwijder deze stap"
                  aria-label={`Verwijder stap ${idx + 1}`}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rijksoranje/10 hover:text-rijksoranje disabled:opacity-40 dark:text-slate-500"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
        <button type="button" className="opl-btn-primary px-6 py-2.5" onClick={onBuild}>
          <Sparkles size={18} /> Start met bouwen <ArrowRight size={16} />
        </button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
        <Check size={13} className="text-rijksblauw-400" />
        We doorlopen de stappen één voor één; elke stap bouwt voort op de vorige en het geheel wordt
        één herbruikbare template.
      </p>
    </div>
  );
}

/**
 * De uitvoering: een voortgangsrail (stap k van N) met per stap de status. Al
 * afgeronde stappen tonen hun verzamelde materiaal inklapbaar, zodat de gebruiker
 * ziet hoe het artefact groeit. Bij een interactieve stap verschijnt een
 * vraag-na-vraag-paneel. De laatste stap stelt de template samen.
 */
function PlanExecutor({
  plan,
  techniqueById,
  currentStepIndex,
  outcomes,
  error,
  onRetry,
  awaitingAnswer,
  currentQuestion,
  transcript,
  answerDraft,
  onAnswerChange,
  onSubmitAnswer,
}: {
  plan: PromptPlan;
  techniqueById: (id?: string | null) => Technique | undefined;
  currentStepIndex: number;
  outcomes: StepOutcome[];
  error: string | null;
  onRetry: () => void;
  awaitingAnswer: boolean;
  currentQuestion: string | null;
  transcript: TranscriptTurn[];
  answerDraft: string;
  onAnswerChange: (v: string) => void;
  onSubmitAnswer: () => void;
}) {
  const total = plan.steps.length;
  const outcomeByStepId = new Map(outcomes.map((o) => [o.step_id, o]));
  const isComposeStep = (idx: number) => idx >= total - 1;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Bezig met bouwen — stap {Math.min(currentStepIndex + 1, total)} van {total}
        </p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Elke stap bouwt voort op de vorige; het geheel wordt één herbruikbare template.
        </p>
      </div>

      <ol className="space-y-3">
        {plan.steps.map((step, idx) => {
          const technique = techniqueById(step.technique_id);
          const outcome = outcomeByStepId.get(step.id);
          const done = Boolean(outcome);
          const isCurrent = idx === currentStepIndex;
          const failed = isCurrent && Boolean(error);
          const awaiting = isCurrent && awaitingAnswer;
          const running = isCurrent && !error && !awaiting;
          const status: StepStatus = done
            ? 'done'
            : failed
              ? 'error'
              : awaiting
                ? 'awaiting'
                : running
                  ? 'running'
                  : 'pending';
          return (
            <StepRow
              key={step.id}
              index={idx}
              step={step}
              techniqueName={technique?.name}
              status={status}
              compose={isCurrent && isComposeStep(idx)}
              outcome={outcome}
            >
              {/* Vraag-na-vraag-paneel: alleen op de actieve interactieve stap. */}
              {awaiting && currentQuestion && (
                <InterviewPanel
                  question={currentQuestion}
                  transcript={transcript}
                  answerDraft={answerDraft}
                  onAnswerChange={onAnswerChange}
                  onSubmitAnswer={onSubmitAnswer}
                />
              )}
            </StepRow>
          );
        })}
      </ol>

      {error && (
        <div
          role="alert"
          className="animate-fade-in flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Deze stap is niet gelukt</p>
              <p className="mt-0.5 text-rose-700 dark:text-rose-300/90">{stripMarkdown(error)}</p>
            </div>
          </div>
          <button
            type="button"
            className="opl-btn-secondary shrink-0"
            onClick={onRetry}
          >
            <RotateCw size={16} /> Opnieuw proberen
          </button>
        </div>
      )}
    </div>
  );
}

type StepStatus = 'pending' | 'running' | 'awaiting' | 'done' | 'error';

/** Eén rij in de uitvoeringsrail: status-icoon + titel + inklapbaar materiaal. */
function StepRow({
  index,
  step,
  techniqueName,
  status,
  compose,
  outcome,
  children,
}: {
  index: number;
  step: PlanStep;
  techniqueName?: string;
  status: StepStatus;
  compose: boolean;
  outcome?: StepOutcome;
  /** Extra inhoud onder de titel — het vraag-na-vraag-paneel bij een interview. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = status === 'running' || status === 'awaiting';
  return (
    <li
      className={clsx(
        'rounded-xl border p-4 shadow-sm transition-colors',
        active
          ? 'border-rijksblauw-300 bg-rijksblauw-50/40 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10'
          : status === 'error'
            ? 'border-rose-200 bg-rose-50/40 dark:border-rose-500/30 dark:bg-rose-500/10'
            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
      )}
    >
      <div className="flex items-start gap-3">
        <StepBadge index={index} status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{step.title}</span>
            {techniqueName && (
              <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                {techniqueName}
              </span>
            )}
            {status === 'running' && (
              <span className="inline-flex items-center gap-1 text-xs text-rijksblauw-600 dark:text-rijksblauw-300">
                <Loader2 size={13} className="animate-spin" />
                {compose ? 'Template samenstellen…' : 'Materiaal verzamelen…'}
              </span>
            )}
            {status === 'awaiting' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-rijksoranje">
                <MessageCircleQuestion size={13} /> Wacht op je antwoord
              </span>
            )}
          </div>

          {children}

          {/* Inklapbaar: het verzamelde materiaal van een afgeronde stap. */}
          {outcome?.material && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex items-center gap-1 text-xs font-medium text-rijksblauw-600 hover:text-rijksblauw-700 dark:text-rijksblauw-300"
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {open ? 'Verberg' : 'Bekijk'} {outcomeLabel(outcome).toLowerCase()}
              </button>
              {open && (
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {outcome.material}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Het vraag-na-vraag-paneel voor een interactieve stap: het lopende transcript
 * plus de huidige vraag met een antwoordveld. Enter (zonder Shift) verstuurt.
 */
function InterviewPanel({
  question,
  transcript,
  answerDraft,
  onAnswerChange,
  onSubmitAnswer,
}: {
  question: string;
  transcript: TranscriptTurn[];
  answerDraft: string;
  onAnswerChange: (v: string) => void;
  onSubmitAnswer: () => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      {/* Eerder beantwoorde vragen in dit interview. */}
      {transcript.length > 0 && (
        <ul className="space-y-2">
          {transcript.map((t, i) => (
            <li key={i} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-800">
              <p className="font-medium text-slate-600 dark:text-slate-300">{stripMarkdown(t.question)}</p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">{t.answer}</p>
            </li>
          ))}
        </ul>
      )}

      {/* De huidige vraag + antwoordveld. */}
      <div className="rounded-xl border border-rijksblauw-200 bg-white p-3 dark:border-rijksblauw-500/30 dark:bg-slate-800">
        <p className="flex items-start gap-2 text-sm font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
          <MessageCircleQuestion size={16} className="mt-0.5 shrink-0" />
          {stripMarkdown(question)}
        </p>
        <textarea
          className="opl-input mt-2 min-h-[72px] resize-y"
          value={answerDraft}
          placeholder="Typ je antwoord…"
          autoFocus
          onChange={(e) => onAnswerChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmitAnswer();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">Enter = versturen · Shift+Enter = nieuwe regel</p>
          <button
            type="button"
            className="opl-btn-primary"
            onClick={onSubmitAnswer}
            disabled={!answerDraft.trim()}
          >
            <Send size={16} /> Antwoord
          </button>
        </div>
      </div>
    </div>
  );
}

/** Het ronde statusbadge links van een stap: nummer, spinner, vinkje of kruis. */
function StepBadge({ index, status }: { index: number; status: StepStatus }) {
  const base = 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold';
  if (status === 'done') {
    return (
      <span className={clsx(base, 'bg-emerald-500 text-white')}>
        <Check size={14} />
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className={clsx(base, 'bg-rijksblauw-500 text-white')}>
        <Loader2 size={13} className="animate-spin" />
      </span>
    );
  }
  if (status === 'awaiting') {
    return (
      <span className={clsx(base, 'bg-rijksoranje text-white')}>
        <MessageCircleQuestion size={13} />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={clsx(base, 'bg-rose-500 text-white')}>
        <AlertTriangle size={13} />
      </span>
    );
  }
  return (
    <span className={clsx(base, 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400')}>
      {index + 1}
    </span>
  );
}
