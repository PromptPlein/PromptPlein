import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eraser,
  FileUp,
  HelpCircle,
  Info,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  RotateCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  analyzePlanStep,
  generatePlan,
  generatePrompt,
  prefillFields,
  runPlanStep,
  serializeOutcomes,
} from '@/services/optimizeService';
import { isContextPrompt, structureFormat } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import type { AiSettings } from '@/services/settingsService';
import OptimizingLoader from './OptimizingLoader';
import FollowUpQuestions from './FollowUpQuestions';
import GuardrailDialog from './GuardrailDialog';
import PersonaBuilder from './PersonaBuilder';
import RichText from './RichText';
import type {
  OptimizeResult,
  PlanStep,
  PlanStepGap,
  PromptPlan,
  PromptRecipe,
  StepOutcome,
  Technique,
  TranscriptTurn,
} from '@/types';

/** localStorage-sleutel waaronder een lopende plan-run wordt bewaard (hervatten na herladen). */
const RUN_STORAGE_KEY = 'opl.planRun';

/** De naar localStorage geschreven snapshot van een lopende run. */
interface PersistedRun {
  goal: string;
  plan: PromptPlan;
  outcomes: StepOutcome[];
  currentStepIndex: number;
}

function loadRun(): PersistedRun | null {
  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRun;
    if (parsed && parsed.plan && Array.isArray(parsed.plan.steps) && parsed.plan.steps.length > 0) {
      return parsed;
    }
  } catch {
    /* corrupte of afwezige run → negeren */
  }
  return null;
}

function saveRun(run: PersistedRun): void {
  try {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
  } catch {
    /* bewaren is best-effort */
  }
}

function clearRunDraft(): void {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY);
  } catch {
    /* negeren */
  }
}

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
 *  - goal        → doel invoeren
 *  - planning    → AI stelt het plan op
 *  - plan-review → plan inzien/aanpassen
 *  - collecting  → per stap: de gebruiker vult de vragen in; na "Genereren" toont
 *                  de AI het materiaal én wat er nog mist voor het totale plaatje
 *  - composing   → laatste stap: alle input wordt tot één template gegoten
 *  - error       → een stap mislukte; retry mogelijk (materiaal blijft behouden)
 */
type Phase = 'goal' | 'planning' | 'plan-review' | 'collecting' | 'composing' | 'error';

/**
 * Slimme meerstaps-bouwer voor de doel-flow ("Help mij met een prompt om mijn
 * doel te bereiken"). De gebruiker beschrijft het doel; de AI stelt een geordend
 * PLAN op van technieken die samen één herbruikbare template opbouwen. De
 * gebruiker ziet het plan, kan stappen aanpassen, en doorloopt daarna de stappen.
 *
 * Fase 5 (deze versie): de INPUT van de gebruiker staat centraal. Bij ELKE stap
 * vult de gebruiker eerst de vervolgvragen van de techniek in. Na "Genereren"
 * denkt de AI mee: op basis van het doel, het materiaal van eerdere stappen en
 * deze input schrijft hij het materiaal uit én benoemt hij wat er nog ONTBREEKT
 * voor het totale plaatje (net als de framework-flow). De gebruiker vult aan tot
 * de stap compleet is; dat materiaal gaat mee naar de volgende stap. De laatste
 * stap giet alle input via de bestaande generate-modus in één herbruikbare template.
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
  // Huidige stap — input van de gebruiker en de AI-analyse ervan.
  const [stepAnswers, setStepAnswers] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [stepMaterial, setStepMaterial] = useState<string | null>(null);
  const [stepSummary, setStepSummary] = useState<string>('');
  const [stepGaps, setStepGaps] = useState<PlanStepGap[]>([]);
  const [clarification, setClarification] = useState('');
  // Geserialiseerde persona-definitie (Persona/Multi-Persona-stap); leeg voor
  // andere technieken. Gaat als gelabeld veld mee in de analyse.
  const [personaText, setPersonaText] = useState('');
  // Chain-of-Thought / Socratic: het adaptieve vraag-na-vraag-interview.
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewQuestion, setInterviewQuestion] = useState<string | null>(null);
  const [interviewTranscript, setInterviewTranscript] = useState<TranscriptTurn[]>([]);
  const [interviewAnswer, setInterviewAnswer] = useState('');
  const [interviewBusy, setInterviewBusy] = useState(false);
  // Een bij het laden gevonden, niet-afgemaakte run — aangeboden om te hervatten.
  const [resumable, setResumable] = useState<PersistedRun | null>(null);

  const busy = phase === 'planning' || phase === 'composing';

  // Bij binnenkomst: is er een niet-afgemaakte run bewaard? Bied hem aan om te
  // hervatten (zonder hem meteen te herstellen — de gebruiker kiest).
  useEffect(() => {
    const run = loadRun();
    if (run) setResumable(run);
    // Alleen bij mount uitvoeren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bewaar de lopende run zodra er een plan is en we het aan het uitvoeren zijn,
  // zodat een herlaadactie of gesloten tab niet alle voortgang wist.
  useEffect(() => {
    if (plan && (phase === 'plan-review' || phase === 'collecting')) {
      saveRun({ goal, plan, outcomes, currentStepIndex });
    }
  }, [plan, phase, goal, outcomes, currentStepIndex]);

  /** Reset de per-stap-state (input + analyse) naar leeg. */
  function resetStepState() {
    setStepAnswers({});
    setStepMaterial(null);
    setStepSummary('');
    setStepGaps([]);
    setClarification('');
    setPersonaText('');
    setInterviewActive(false);
    setInterviewQuestion(null);
    setInterviewTranscript([]);
    setInterviewAnswer('');
  }

  /** Herstel een eerder bewaarde run en ga verder waar de gebruiker gebleven was. */
  function resumeRun() {
    if (!resumable) return;
    const { goal: g, plan: p, outcomes: o, currentStepIndex: idx } = resumable;
    setGoal(g);
    setPlan(p);
    setOutcomes(o);
    setCurrentStepIndex(idx);
    setStepError(null);
    resetStepState();
    setResumable(null);
    // Hervat het invoerscherm exact bij de bewaarde stap, mét het al verzamelde
    // materiaal. (Stap 0 net zo goed — de gebruiker vult daar zijn input in.)
    setPhase(idx >= p.steps.length - 1 ? 'plan-review' : 'collecting');
  }

  /** Verwerp de bewaarde run en begin schoon. */
  function discardRun() {
    clearRunDraft();
    setResumable(null);
  }

  /** Wis doel + afgeleide state en begin opnieuw. */
  function handleClear() {
    clearGoal();
    clearRunDraft();
    setResumable(null);
    setPlan(null);
    setPhase('goal');
    setUnclearReason(null);
    setShowExamples(false);
    setGuardrailFindings(null);
    setCurrentStepIndex(0);
    setOutcomes([]);
    setStepError(null);
    resetStepState();
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

  /** Verplaats een stap één positie omhoog of omlaag (herordenen in plan-review). */
  function moveStep(index: number, dir: -1 | 1) {
    setPlan((prev) => {
      if (!prev) return prev;
      const target = index + dir;
      if (target < 0 || target >= prev.steps.length) return prev;
      const steps = [...prev.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  }

  /** Pas de titel van een stap aan (inline bewerken in plan-review). */
  function editStepTitle(id: string, title: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.map((s) => (s.id === id ? { ...s, title } : s)) };
    });
  }

  /** Is dit de laatste stap? Die stelt de uiteindelijke template samen (compose). */
  function isLastStep(p: PromptPlan, index: number): boolean {
    return index >= p.steps.length - 1;
  }

  /** Start de uitvoering: begin bij stap 0 met een schone lei. */
  function handleBuild() {
    if (!plan) return;
    setOutcomes([]);
    beginStep(plan, 0, []);
  }

  /**
   * Begin een stap: reset de per-stap-state en toon óf het invoerscherm
   * (tussenstap) óf stel meteen de template samen (laatste stap). Bij een
   * interactieve stap (chain-of-thought/socratic) start meteen het interview.
   */
  function beginStep(p: PromptPlan, index: number, accumulated: StepOutcome[]) {
    setCurrentStepIndex(index);
    setStepError(null);
    setUnclearReason(null);
    resetStepState();
    if (isLastStep(p, index)) {
      void composeFinal(p, accumulated);
      return;
    }
    setPhase('collecting');
    const step = p.steps[index];
    if (step?.interactive) {
      setInterviewActive(true);
      void interviewTurn(p, index, accumulated, [], false);
    }
  }

  /** Herprobeer de huidige (mislukte) stap; behoud het al verzamelde materiaal. */
  function retryStep() {
    if (!plan) return;
    setStepError(null);
    setUnclearReason(null);
    if (isLastStep(plan, currentStepIndex)) {
      void composeFinal(plan, outcomes);
      return;
    }
    setPhase('collecting');
    // Mislukte de stap midden in een interview, herpak dan die beurt.
    if (interviewActive) {
      void interviewTurn(plan, currentStepIndex, outcomes, interviewTranscript, false);
    }
  }

  /**
   * Genereer een al afgeronde stap opnieuw. Omdat elke stap voortbouwt op de
   * vorige, vervallen de uitkomsten van deze én latere stappen; we hervatten bij
   * deze stap met alleen het materiaal ervóór.
   */
  function regenerateStep(index: number) {
    if (!plan) return;
    const kept = outcomes.slice(0, index);
    setOutcomes(kept);
    beginStep(plan, index, kept);
  }

  /**
   * "Genereren" op een tussenstap: stuur de input van de gebruiker naar de AI,
   * die het materiaal uitschrijft én benoemt wat er nog ontbreekt voor het totale
   * plaatje. `extraClarification` komt uit de "wat mist nog"-lus.
   */
  async function analyzeCurrentStep(extraClarification?: string) {
    if (!plan) return;
    const step = plan.steps[currentStepIndex];
    const technique = techniqueById(step.technique_id);
    if (!technique) {
      setStepError('Kon de techniek voor deze stap niet vinden.');
      setPhase('error');
      return;
    }

    // Guardrail-check op de door de gebruiker ingevulde velden + persona + toelichting.
    const toCheck = [...Object.values(stepAnswers), personaText, extraClarification ?? '']
      .map((v) => v.trim())
      .filter(Boolean)
      .join('\n');
    if (toCheck) {
      const findings: GuardrailFinding[] = [
        ...(settings.pii.enabled ? detectPii(toCheck) : []),
        ...detectBlockedTopics(toCheck, settings.blockedTopics),
      ];
      if (findings.length > 0) {
        setGuardrailFindings(findings);
        return;
      }
    }

    setAnalyzing(true);
    setStepError(null);
    setUnclearReason(null);
    try {
      const res = await analyzePlanStep({
        goal: goal.trim(),
        step,
        technique,
        answers: stepAnswers,
        // De gestructureerde persona-definitie gaat als gelabeld veld mee.
        extraAnsweredFields: personaText.trim()
          ? [{ id: 'persona_definitie', label: 'Persona-definitie', answer: personaText.trim() }]
          : undefined,
        outcomesSummary: serializeOutcomes(outcomes),
        clarification: extraClarification,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je invoer is nog niet duidelijk genoeg. Vul de velden concreter in.',
        );
        return;
      }
      if (!res.success || !res.material) {
        setStepError(res.error ?? 'De analyse voor deze stap kon niet worden gemaakt.');
        setPhase('error');
        return;
      }
      setStepMaterial(res.material);
      setStepSummary(res.summary ?? '');
      setStepGaps(res.gaps ?? []);
      setClarification('');
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Analyse mislukt.');
      setPhase('error');
    } finally {
      setAnalyzing(false);
    }
  }

  /** Guardrail bevestigd → alsnog analyseren met de huidige toelichting. */
  function confirmAnalyze() {
    setGuardrailFindings(null);
    void analyzeCurrentStep(clarification.trim() || undefined);
  }

  /**
   * Eén beurt van het adaptieve interview (chain-of-thought/socratic). De AI stelt
   * op basis van het transcript de volgende vraag, of — na max. 7 vragen of als de
   * gebruiker afrondt (`forceFinish`) — een conclusie die het stap-materiaal wordt.
   * `turns` en `accumulated` worden expliciet doorgegeven (stale-closure-vrij).
   */
  async function interviewTurn(
    p: PromptPlan,
    index: number,
    accumulated: StepOutcome[],
    turns: TranscriptTurn[],
    forceFinish: boolean,
  ) {
    const step = p.steps[index];
    const technique = techniqueById(step.technique_id);
    if (!technique) {
      setStepError('Kon de techniek voor deze stap niet vinden.');
      setPhase('error');
      return;
    }
    setInterviewBusy(true);
    setStepError(null);
    setUnclearReason(null);
    try {
      const res = await runPlanStep({
        goal: goal.trim(),
        step,
        techniqueName: technique.name,
        outcomesSummary: serializeOutcomes(accumulated),
        interactive: true,
        transcript: turns,
        forceFinish,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        setUnclearReason(res.reason?.trim() || 'Je invoer is nog niet duidelijk genoeg.');
        return;
      }
      // De AI heeft nog een vraag nodig (en we zitten onder het maximum).
      if (res.needs_input && res.question) {
        setInterviewQuestion(res.question);
        setInterviewAnswer('');
        return;
      }
      // De AI is klaar: de conclusie wordt het materiaal van deze stap. Vanaf hier
      // loopt de gewone flow (tonen + "Volgende stap"/compose) door.
      if (res.material) {
        setInterviewActive(false);
        setInterviewQuestion(null);
        setStepMaterial(res.material);
        setStepSummary('');
        setStepGaps([]);
        return;
      }
      setStepError(res.error ?? 'De volgende vraag kon niet worden opgehaald.');
      setPhase('error');
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Interview mislukt.');
      setPhase('error');
    } finally {
      setInterviewBusy(false);
    }
  }

  /** De gebruiker beantwoordt de huidige interview-vraag; guardrail-check eerst. */
  function submitInterviewAnswer() {
    if (!plan || !interviewQuestion) return;
    const answer = interviewAnswer.trim();
    if (!answer) {
      toast.error('Vul eerst een antwoord in, of rond het interview af.');
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
    const turns = [...interviewTranscript, { question: interviewQuestion, answer }];
    setInterviewTranscript(turns);
    setInterviewQuestion(null);
    void interviewTurn(plan, currentStepIndex, outcomes, turns, false);
  }

  /** Guardrail bevestigd → verwerk het interview-antwoord alsnog. */
  function confirmInterviewAnswer() {
    if (!plan || !interviewQuestion) return;
    const answer = interviewAnswer.trim();
    if (!answer) return;
    const turns = [...interviewTranscript, { question: interviewQuestion, answer }];
    setInterviewTranscript(turns);
    setInterviewQuestion(null);
    void interviewTurn(plan, currentStepIndex, outcomes, turns, false);
  }

  /** "Ik heb genoeg gedeeld": rond het interview af met een conclusie. */
  function finishInterview() {
    if (!plan) return;
    setInterviewQuestion(null);
    void interviewTurn(plan, currentStepIndex, outcomes, interviewTranscript, true);
  }

  /**
   * Vul de velden van de huidige stap voor op basis van een geüpload document:
   * de AI leest het document volledig door, analyseert de layout (format,
   * rubrieken, regels) en vult de vragen voor. Alleen zinvol bij template-based.
   */
  async function prefillFromDocument(text: string): Promise<boolean> {
    if (!plan) return false;
    const step = plan.steps[currentStepIndex];
    const technique = techniqueById(step.technique_id);
    if (!technique) return false;
    const res = await prefillFields({
      ownPrompt: text,
      technique,
      fromDocument: true,
      preferredProvider: settings.provider,
      preferredModel: settings.model,
    });
    if (res.unclear) {
      toast.error(res.reason?.trim() || 'Uit het document kon geen bruikbare structuur worden gehaald.');
      return false;
    }
    if (res.fields.length === 0) {
      toast('Geen velden ingevuld uit het document. Vul ze zelf aan.', { icon: 'ℹ️' });
      return false;
    }
    if (res.error) toast(res.error, { icon: '⚠️' });
    // Voeg de afgeleide waarden toe (bestaande, door de gebruiker ingevulde velden
    // niet overschrijven — die zijn leidend).
    setStepAnswers((prev) => {
      const next = { ...prev };
      for (const f of res.fields) {
        if (!next[f.id]?.trim()) next[f.id] = f.value;
      }
      return next;
    });
    return true;
  }

  /** Leg het materiaal van deze stap vast en ga naar de volgende stap. */
  function commitStep() {
    if (!plan || stepMaterial == null) return;
    const step = plan.steps[currentStepIndex];
    const outcome: StepOutcome = {
      step_id: step.id,
      technique_id: step.technique_id,
      produces: step.produces,
      material: stepMaterial,
      answers: personaText.trim()
        ? { ...stepAnswers, persona_definitie: personaText.trim() }
        : { ...stepAnswers },
    };
    const next = [...outcomes, outcome];
    setOutcomes(next);
    beginStep(plan, currentStepIndex + 1, next);
  }

  /** Laatste stap: giet alle verzamelde input in één herbruikbare template. */
  async function composeFinal(p: PromptPlan, accumulated: StepOutcome[]) {
    const step = p.steps[p.steps.length - 1];
    const technique = techniqueById(step.technique_id);
    if (!technique) {
      setStepError('Kon de techniek voor de eindstap niet vinden.');
      setPhase('error');
      return;
    }
    setPhase('composing');
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
      const recipe: PromptRecipe = { goal: goal.trim(), plan: p, outcomes: accumulated };
      clearRunDraft();
      onResult({ ...res, recipe }, technique);
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Template samenstellen mislukt.');
      setPhase('error');
    }
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

              {/* Hervat-melding: er staat nog een niet-afgemaakte bouw bewaard. */}
              {resumable && phase === 'goal' && !plan && (
                <div className="animate-fade-in mt-3 flex flex-col gap-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <RotateCw size={16} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                    <span>
                      Je hebt nog een niet-afgemaakte bouw{' '}
                      <span className="font-medium">
                        ({resumable.outcomes.length}/{resumable.plan.steps.length} stappen)
                      </span>
                      . Verder waar je gebleven was?
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="opl-btn-secondary" onClick={discardRun}>
                      Verwijder
                    </button>
                    <button type="button" className="opl-btn-primary" onClick={resumeRun}>
                      Hervatten
                    </button>
                  </div>
                </div>
              )}
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
                onMoveStep={moveStep}
                onEditStepTitle={editStepTitle}
                onBuild={handleBuild}
              />
            ) : (
              <PlanExecutor
                plan={plan}
                techniqueById={techniqueById}
                currentStepIndex={currentStepIndex}
                outcomes={outcomes}
                phase={phase}
                error={phase === 'error' ? stepError : null}
                onRetry={retryStep}
                onRegenerateStep={regenerateStep}
                stepAnswers={stepAnswers}
                onStepAnswersChange={setStepAnswers}
                analyzing={analyzing}
                stepMaterial={stepMaterial}
                stepSummary={stepSummary}
                stepGaps={stepGaps}
                clarification={clarification}
                onClarificationChange={setClarification}
                onAnalyze={() => void analyzeCurrentStep(clarification.trim() || undefined)}
                onCommit={commitStep}
                onPrefillFromDocument={prefillFromDocument}
                settings={settings}
                goal={goal}
                onPersonaChange={setPersonaText}
                interviewActive={interviewActive}
                interviewQuestion={interviewQuestion}
                interviewTranscript={interviewTranscript}
                interviewAnswer={interviewAnswer}
                interviewBusy={interviewBusy}
                onInterviewAnswerChange={setInterviewAnswer}
                onSubmitInterviewAnswer={submitInterviewAnswer}
                onFinishInterview={finishInterview}
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
          // Route naar de juiste actie: een interview-antwoord, de stap-analyse,
          // óf het opstellen van het plan (doel-fase).
          onConfirm={() => {
            setGuardrailFindings(null);
            if (interviewActive) confirmInterviewAnswer();
            else if (phase === 'collecting') confirmAnalyze();
            else void runPlan();
          }}
          onCancel={() => setGuardrailFindings(null)}
        />
      )}
    </div>
  );
}

/**
 * Het inspecteerbare plan: een genummerde stepper. Stappen zijn te herordenen
 * (omhoog/omlaag), te hernoemen (inline) en te verwijderen voordat de bouw start.
 */
function PlanReview({
  plan,
  techniqueById,
  onRemoveStep,
  onMoveStep,
  onEditStepTitle,
  onBuild,
}: {
  plan: PromptPlan;
  techniqueById: (id?: string | null) => Technique | undefined;
  onRemoveStep: (id: string) => void;
  onMoveStep: (index: number, dir: -1 | 1) => void;
  onEditStepTitle: (id: string, title: string) => void;
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
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          Sleep­volgorde aanpassen met de pijltjes, hernoem een stap, of verwijder er een.
        </p>
      </div>

      <ol className="space-y-3">
        {plan.steps.map((step, idx) => (
          <ReviewStepRow
            key={step.id}
            index={idx}
            total={plan.steps.length}
            step={step}
            techniqueName={techniqueById(step.technique_id)?.name}
            onMove={onMoveStep}
            onEditTitle={onEditStepTitle}
            onRemove={onRemoveStep}
          />
        ))}
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

/** Eén stap in het plan-overzicht: herordenen, hernoemen (inline) en verwijderen. */
function ReviewStepRow({
  index,
  total,
  step,
  techniqueName,
  onMove,
  onEditTitle,
  onRemove,
}: {
  index: number;
  total: number;
  step: PlanStep;
  techniqueName?: string;
  onMove: (index: number, dir: -1 | 1) => void;
  onEditTitle: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step.title);

  function commit() {
    const next = draft.trim();
    if (next && next !== step.title) onEditTitle(step.id, next);
    else setDraft(step.title); // leeg/onveranderd → terug naar origineel
    setEditing(false);
  }

  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {/* Herorden-pijltjes + nummer. */}
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          title="Omhoog"
          aria-label={`Stap ${index + 1} omhoog`}
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 disabled:opacity-30 dark:hover:bg-slate-700"
        >
          <ChevronUp size={15} />
        </button>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-semibold text-white">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          title="Omlaag"
          aria-label={`Stap ${index + 1} omlaag`}
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 disabled:opacity-30 dark:hover:bg-slate-700"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <input
              className="opl-input h-8 max-w-xs py-1 text-sm font-semibold"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  setDraft(step.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(step.title);
                setEditing(true);
              }}
              title="Hernoem deze stap"
              className="group inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-rijksblauw-700 dark:text-slate-100 dark:hover:text-rijksblauw-200"
            >
              {step.title}
              <Pencil size={12} className="opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          )}
          {techniqueName && (
            <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
              {techniqueName}
            </span>
          )}
          {step.interactive && (
            <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">vraag na vraag</span>
          )}
        </div>
        {step.rationale && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {stripMarkdown(step.rationale)}
          </p>
        )}
      </div>

      {total > 1 && (
        <button
          type="button"
          onClick={() => onRemove(step.id)}
          title="Verwijder deze stap"
          aria-label={`Verwijder stap ${index + 1}`}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rijksoranje/10 hover:text-rijksoranje disabled:opacity-40 dark:text-slate-500"
        >
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}

/**
 * De uitvoering: een voortgangsrail (stap k van N). Op de actieve stap vult de
 * gebruiker eerst de vervolgvragen van de techniek in; na "Genereren" toont de
 * AI het materiaal én wat er nog mist voor het totale plaatje. Al afgeronde
 * stappen tonen hun materiaal inklapbaar. De laatste stap stelt de template samen.
 */
function PlanExecutor({
  plan,
  techniqueById,
  currentStepIndex,
  outcomes,
  phase,
  error,
  onRetry,
  onRegenerateStep,
  stepAnswers,
  onStepAnswersChange,
  analyzing,
  stepMaterial,
  stepSummary,
  stepGaps,
  clarification,
  onClarificationChange,
  onAnalyze,
  onCommit,
  onPrefillFromDocument,
  settings,
  goal,
  onPersonaChange,
  interviewActive,
  interviewQuestion,
  interviewTranscript,
  interviewAnswer,
  interviewBusy,
  onInterviewAnswerChange,
  onSubmitInterviewAnswer,
  onFinishInterview,
}: {
  plan: PromptPlan;
  techniqueById: (id?: string | null) => Technique | undefined;
  currentStepIndex: number;
  outcomes: StepOutcome[];
  phase: Phase;
  error: string | null;
  onRetry: () => void;
  onRegenerateStep: (index: number) => void;
  stepAnswers: Record<string, string>;
  onStepAnswersChange: (a: Record<string, string>) => void;
  analyzing: boolean;
  stepMaterial: string | null;
  stepSummary: string;
  stepGaps: PlanStepGap[];
  clarification: string;
  onClarificationChange: (v: string) => void;
  onAnalyze: () => void;
  onCommit: () => void;
  onPrefillFromDocument: (text: string) => Promise<boolean>;
  settings: AiSettings;
  goal: string;
  onPersonaChange: (text: string) => void;
  interviewActive: boolean;
  interviewQuestion: string | null;
  interviewTranscript: TranscriptTurn[];
  interviewAnswer: string;
  interviewBusy: boolean;
  onInterviewAnswerChange: (v: string) => void;
  onSubmitInterviewAnswer: () => void;
  onFinishInterview: () => void;
}) {
  const total = plan.steps.length;
  const outcomeByStepId = new Map(outcomes.map((o) => [o.step_id, o]));
  const isComposeStep = (idx: number) => idx >= total - 1;
  const composing = phase === 'composing';

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {composing
            ? 'De template wordt samengesteld…'
            : `Stap ${Math.min(currentStepIndex + 1, total)} van ${total}`}
        </p>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Vul je input in; de AI denkt mee wat er nog nodig is. Elke stap bouwt voort op de vorige.
        </p>
      </div>

      <ol className="space-y-3">
        {plan.steps.map((step, idx) => {
          const technique = techniqueById(step.technique_id);
          const outcome = outcomeByStepId.get(step.id);
          const done = Boolean(outcome);
          const isCurrent = idx === currentStepIndex;
          const failed = isCurrent && Boolean(error);
          const active = isCurrent && !error;
          const status: StepStatus = done
            ? 'done'
            : failed
              ? 'error'
              : active
                ? 'active'
                : 'pending';
          return (
            <StepRow
              key={step.id}
              index={idx}
              step={step}
              techniqueName={technique?.name}
              status={status}
              compose={isCurrent && isComposeStep(idx)}
              composing={composing}
              outcome={outcome}
              // Een afgeronde tussenstap mag opnieuw doorlopen worden (niet de
              // compose-stap, en alleen als er nu niets actief loopt).
              onRegenerate={done && !analyzing && !composing && !isComposeStep(idx) ? () => onRegenerateStep(idx) : undefined}
            >
              {/* Actieve tussenstap: input verzamelen + analyse tonen. */}
              {active && !isComposeStep(idx) && technique && (
                <StepCollector
                  technique={technique}
                  answers={stepAnswers}
                  onAnswersChange={onStepAnswersChange}
                  analyzing={analyzing}
                  material={stepMaterial}
                  summary={stepSummary}
                  gaps={stepGaps}
                  clarification={clarification}
                  onClarificationChange={onClarificationChange}
                  onAnalyze={onAnalyze}
                  onCommit={onCommit}
                  onPrefillFromDocument={onPrefillFromDocument}
                  settings={settings}
                  goal={goal}
                  onPersonaChange={onPersonaChange}
                  interviewActive={interviewActive}
                  interviewQuestion={interviewQuestion}
                  interviewTranscript={interviewTranscript}
                  interviewAnswer={interviewAnswer}
                  interviewBusy={interviewBusy}
                  onInterviewAnswerChange={onInterviewAnswerChange}
                  onSubmitInterviewAnswer={onSubmitInterviewAnswer}
                  onFinishInterview={onFinishInterview}
                  isLastBeforeCompose={idx === total - 2}
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
          <button type="button" className="opl-btn-secondary shrink-0" onClick={onRetry}>
            <RotateCw size={16} /> Opnieuw proberen
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Upload-zone voor een voorbeelddocument (Template-based Output). Extraheert de
 * tekst client-side (txt/md/pdf/docx), waarna de AI het document volledig
 * doorleest en de layout (format, rubrieken, regels) in de velden voor-invult.
 */
function DocumentUpload({
  onPrefill,
  disabled,
}: {
  onPrefill: (text: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setDoneName(null);
    try {
      const { extractDocument } = await import('@/lib/extractDocument');
      const doc = await extractDocument(file);
      toast.success(`"${doc.name}" ingelezen (${doc.chars.toLocaleString('nl-NL')} tekens).`);
      const ok = await onPrefill(doc.text);
      if (ok) setDoneName(doc.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Document inlezen mislukt.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-rijksblauw-300 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileUp size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Voorbeelddocument uploaden (optioneel)
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              De AI leest het document volledig door, analyseert de opbouw (format, rubrieken, regels)
              en vult de velden hieronder automatisch voor. Ondersteunt .txt, .md, .pdf en .docx.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="opl-btn-secondary shrink-0"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Inlezen…
            </>
          ) : (
            <>
              <FileUp size={16} /> Kies bestand
            </>
          )}
        </button>
      </div>
      {doneName && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check size={13} /> Velden voor-ingevuld op basis van &quot;{doneName}&quot;. Controleer en
          pas aan waar nodig.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

/**
 * Het invoer- en analysepaneel voor één actieve tussenstap. Eerst de
 * vervolgvragen van de techniek (input van de gebruiker) + "Genereren". Daarna
 * het door de AI uitgeschreven materiaal met de openstaande hiaten ("wat mist
 * nog") en een toelichtingsveld om te verfijnen, of door naar de volgende stap.
 */
function StepCollector({
  technique,
  answers,
  onAnswersChange,
  analyzing,
  material,
  summary,
  gaps,
  clarification,
  onClarificationChange,
  onAnalyze,
  onCommit,
  onPrefillFromDocument,
  settings,
  goal,
  onPersonaChange,
  interviewActive,
  interviewQuestion,
  interviewTranscript,
  interviewAnswer,
  interviewBusy,
  onInterviewAnswerChange,
  onSubmitInterviewAnswer,
  onFinishInterview,
  isLastBeforeCompose,
}: {
  technique: Technique;
  answers: Record<string, string>;
  onAnswersChange: (a: Record<string, string>) => void;
  analyzing: boolean;
  material: string | null;
  summary: string;
  gaps: PlanStepGap[];
  clarification: string;
  onClarificationChange: (v: string) => void;
  onAnalyze: () => void;
  onCommit: () => void;
  onPrefillFromDocument: (text: string) => Promise<boolean>;
  settings: AiSettings;
  goal: string;
  onPersonaChange: (text: string) => void;
  interviewActive: boolean;
  interviewQuestion: string | null;
  interviewTranscript: TranscriptTurn[];
  interviewAnswer: string;
  interviewBusy: boolean;
  onInterviewAnswerChange: (v: string) => void;
  onSubmitInterviewAnswer: () => void;
  onFinishInterview: () => void;
  isLastBeforeCompose: boolean;
}) {
  const hasFields = technique.follow_up_questions.length > 0;
  const format = structureFormat(technique);
  // Documenten uploaden is alleen zinvol bij Template-based Output: daar leidt de
  // AI de layout (format, rubrieken, regels) uit een voorbeelddocument af.
  const supportsDocument = format === 'template-based';
  // Persona/Multi-Persona krijgen de uitgebreide persona-builder i.p.v. de
  // generieke vragenlijst.
  const isPersona = format === 'persona' || format === 'multi-persona';

  // Chain-of-Thought / Socratic: het adaptieve vraag-na-vraag-interview vervangt
  // de gewone input+Genereren, tot de AI een conclusie levert (dan is material gezet).
  if (interviewActive && material == null) {
    return (
      <div className="mt-3">
        <InterviewPanel
          question={interviewQuestion}
          transcript={interviewTranscript}
          answer={interviewAnswer}
          busy={interviewBusy}
          onAnswerChange={onInterviewAnswerChange}
          onSubmit={onSubmitInterviewAnswer}
          onFinish={onFinishInterview}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {/* 0. Alleen bij Template-based: upload een voorbeelddocument om de velden
             op basis van de layout automatisch voor te laten invullen. */}
      {supportsDocument && material == null && (
        <DocumentUpload onPrefill={onPrefillFromDocument} disabled={analyzing} />
      )}

      {/* 1. Input van de gebruiker. Persona/Multi-Persona → de uitgebreide
             persona-builder; anders de vervolgvragen van de techniek. */}
      {isPersona ? (
        material == null && (
          <PersonaBuilder
            multi={format === 'multi-persona'}
            settings={settings}
            context={goal}
            onSerialized={onPersonaChange}
          />
        )
      ) : hasFields ? (
        <FollowUpQuestions technique={technique} answers={answers} onChange={onAnswersChange} />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Deze techniek heeft geen vaste vragen. Klik op &quot;Genereren&quot;; de AI denkt mee wat
          er nog nodig is.
        </p>
      )}

      {/* 2. Genereren: analyseer de input en bepaal wat nog mist. */}
      {material == null ? (
        <div className="flex justify-end">
          <button type="button" className="opl-btn-primary" onClick={onAnalyze} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Meedenken…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Genereren
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          {summary && (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {stripMarkdown(summary)}
            </p>
          )}

          {/* Het uitgeschreven materiaal van deze stap. */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Tussenresultaat
            </p>
            <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <RichText text={material} className="text-xs text-slate-600 dark:text-slate-300" />
            </div>
          </div>

          {/* "Wat mist nog voor het totale plaatje" — de doorvraag-lus. */}
          {gaps.length > 0 && (
            <div className="rounded-lg border border-rijksblauw-200 bg-white/70 p-3 dark:border-rijksblauw-500/30 dark:bg-slate-800/60">
              <p className="flex items-start gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                Wat je nog kunt aanleveren voor een scherper geheel
              </p>
              <ul className="mt-2 space-y-1.5 pl-1">
                {gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <HelpCircle size={15} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                    <span>
                      {g.label && <span className="font-medium">{g.label}: </span>}
                      {stripMarkdown(g.question)}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="opl-label mb-1 mt-3 block" htmlFor="plan-step-clarify">
                Jouw aanvulling
              </label>
              <textarea
                id="plan-step-clarify"
                className="opl-input min-h-[72px] resize-y text-sm"
                value={clarification}
                placeholder="Vul aan wat hierboven nog mist…"
                onChange={(e) => onClarificationChange(e.target.value)}
                disabled={analyzing}
              />
              <div className="mt-2">
                <button
                  type="button"
                  className="opl-btn-secondary"
                  onClick={onAnalyze}
                  disabled={analyzing || !clarification.trim()}
                >
                  {analyzing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Opnieuw meedenken…
                    </>
                  ) : (
                    <>
                      <RotateCw size={16} /> Verwerk mijn aanvulling
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Door naar de volgende stap (of de eindtemplate). */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400"
              onClick={onAnalyze}
              disabled={analyzing}
            >
              Opnieuw genereren
            </button>
            <button type="button" className="opl-btn-primary" onClick={onCommit} disabled={analyzing}>
              {isLastBeforeCompose ? (
                <>
                  <Sparkles size={16} /> Naar de eindtemplate <ArrowRight size={16} />
                </>
              ) : (
                <>
                  Volgende stap <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Het adaptieve vraag-na-vraag-paneel voor Chain-of-Thought / Socratic-stappen.
 * Toont het gesprek tot nu toe, de huidige vraag met een antwoordveld, en twee
 * acties: het antwoord versturen (volgende vraag), of het interview afronden
 * ("ik heb genoeg gedeeld") zodat de AI meteen een conclusie trekt.
 */
function InterviewPanel({
  question,
  transcript,
  answer,
  busy,
  onAnswerChange,
  onSubmit,
  onFinish,
}: {
  question: string | null;
  transcript: TranscriptTurn[];
  answer: string;
  busy: boolean;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          De AI stelt op basis van je antwoorden telkens de volgende vraag (max. 7), tot het beeld
          compleet is. Klaar met input geven? Rond dan af — de AI trekt dan meteen een conclusie.
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

      {/* De huidige vraag + antwoordveld, of een laadstaat terwijl de AI nadenkt. */}
      {busy && !question ? (
        <div className="flex items-center gap-2 rounded-xl border border-rijksblauw-200 bg-white p-3 text-sm text-rijksblauw-600 dark:border-rijksblauw-500/30 dark:bg-slate-800 dark:text-rijksblauw-300">
          <Loader2 size={16} className="animate-spin" />
          {transcript.length === 0 ? 'De eerste vraag wordt opgesteld…' : 'De AI denkt na over de volgende vraag…'}
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
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="opl-btn-secondary"
              onClick={onFinish}
              disabled={busy}
              title="Rond het interview af; de AI trekt een conclusie op basis van je antwoorden"
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

type StepStatus = 'pending' | 'active' | 'done' | 'error';

/** Eén rij in de uitvoeringsrail: status-icoon + titel + inklapbaar materiaal. */
function StepRow({
  index,
  step,
  techniqueName,
  status,
  compose,
  composing,
  outcome,
  onRegenerate,
  children,
}: {
  index: number;
  step: PlanStep;
  techniqueName?: string;
  status: StepStatus;
  compose: boolean;
  composing: boolean;
  outcome?: StepOutcome;
  /** Aanwezig op een afgeronde tussenstap: doorloop die stap (en de latere) opnieuw. */
  onRegenerate?: () => void;
  /** Extra inhoud onder de titel — het invoer-/analysepaneel op de actieve stap. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = status === 'active';
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
        <StepBadge index={index} status={status} composing={compose && composing} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{step.title}</span>
            {techniqueName && (
              <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                {techniqueName}
              </span>
            )}
            {compose && composing && (
              <span className="inline-flex items-center gap-1 text-xs text-rijksblauw-600 dark:text-rijksblauw-300">
                <Loader2 size={13} className="animate-spin" /> Template samenstellen…
              </span>
            )}
          </div>

          {children}

          {/* Inklapbaar: het verzamelde materiaal van een afgeronde stap. */}
          {outcome?.material && (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  className="inline-flex items-center gap-1 text-xs font-medium text-rijksblauw-600 hover:text-rijksblauw-700 dark:text-rijksblauw-300"
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {open ? 'Verberg' : 'Bekijk'} {outcomeLabel(outcome).toLowerCase()}
                </button>
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    title="Doorloop deze stap opnieuw (latere stappen worden ook opnieuw gedaan)"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rijksoranje dark:text-slate-400"
                  >
                    <RotateCw size={13} /> Opnieuw
                  </button>
                )}
              </div>
              {open && (
                <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <RichText text={outcome.material} className="text-xs text-slate-600 dark:text-slate-300" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Het ronde statusbadge links van een stap: nummer, spinner, vinkje of kruis. */
function StepBadge({ index, status, composing }: { index: number; status: StepStatus; composing: boolean }) {
  const base = 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold';
  if (status === 'done') {
    return (
      <span className={clsx(base, 'bg-emerald-500 text-white')}>
        <Check size={14} />
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
  if (status === 'active') {
    return (
      <span className={clsx(base, 'bg-rijksblauw-500 text-white')}>
        {composing ? <Loader2 size={13} className="animate-spin" /> : index + 1}
      </span>
    );
  }
  return (
    <span className={clsx(base, 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400')}>
      {index + 1}
    </span>
  );
}
