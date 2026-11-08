import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  analyzePlanStep,
  checkAssumptions,
  generatePlan,
  generatePrompt,
  prefillFields,
  runPlanStep,
  serializeOutcomes,
  type PrefillPhase,
  type TemplateAssumption,
} from '@/services/optimizeService';
import { hasOwnInputStep, isContextPrompt, structureFormat, isSkillCreator } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import { logBehavior, newBehaviorSession, type BehaviorSession } from '@/services/behaviorService';
import { useAuth } from '@/context/AuthContext';
import { activityIdentifier } from '@/lib/utils';
import { overheidsContext, type AiSettings } from '@/services/settingsService';
import OptimizingLoader from './OptimizingLoader';
import type { StreamStatus } from '@/lib/ndjsonStream';
import FollowUpQuestions, { type FieldMeta, type PrefillProgress } from './FollowUpQuestions';
import GuardrailDialog from './GuardrailDialog';
import VerantwoordGebruikHint from './VerantwoordGebruikHint';
import PersonaBuilder from './PersonaBuilder';
import FewShotBuilder from './FewShotBuilder';
import MetaBuilder from './MetaBuilder';
import VerificationBuilder from './VerificationBuilder';
import StepBackBuilder from './StepBackBuilder';
import RubricBuilder from './RubricBuilder';
import DocumentUpload from './DocumentUpload';
import { InterviewPanel } from './InterviewPanel';
import RichText from './RichText';
import type {
  OptimizeResult,
  PlanRouting,
  PlanStep,
  PlanStepGap,
  PromptPlan,
  PromptRecipe,
  Recurrence,
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
 *  - goal              → doel invoeren
 *  - planning          → AI stelt het plan op
 *  - plan-review       → plan inzien/aanpassen
 *  - collecting        → per stap: de gebruiker vult de vragen in; na "Genereren"
 *                        toont de AI het materiaal én wat er nog mist
 *  - composing         → laatste stap: alle input wordt tot één template gegoten
 *  - assumption-review → socratische eindcontrole: de AI heeft aannames in het
 *                        resultaat gevonden; de gebruiker beantwoordt ze of slaat over
 *  - error             → een stap mislukte; retry mogelijk (materiaal blijft behouden)
 */
type Phase =
  | 'goal'
  | 'planning'
  // De planner kon niet bepalen of de taak herhaalbaar is en stelde één vraag
  // terug; die leggen we voor vóórdat er een plan bestaat.
  | 'routing'
  | 'plan-review'
  | 'collecting'
  | 'composing'
  | 'assumption-review'
  | 'error';

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
  const { profile, user } = useAuth();
  // Gedragslog-sessie voor deze plan-wizard-run + een korte log-helper. De
  // sessie groepeert alle acties; het loggen is fire-and-forget (blokkeert nooit).
  const sessionRef = useRef<BehaviorSession>(newBehaviorSession());
  function log(
    action: Parameters<typeof logBehavior>[0]['action'],
    extra?: { stepIndex?: number | null; techniqueId?: string | null; metadata?: Record<string, unknown> },
  ) {
    logBehavior({
      session: sessionRef.current,
      identifier: activityIdentifier(profile, user?.email),
      action,
      stepIndex: extra?.stepIndex ?? null,
      techniqueId: extra?.techniqueId ?? null,
      metadata: extra?.metadata,
    });
  }
  // Deelt de 'goal'-draftsleutel met OptimizerPage, zodat de pagina-brede
  // "Opschonen"-knop, hasDraftContent en OptimizedOutput's titel-fallback blijven
  // werken zonder de state omhoog te tillen.
  const [goal, setGoal, clearGoal] = usePersistentDraft('goal');
  // Het doel als ref, synchroon bijgewerkt. Nodig omdat `resumeRun` het doel zet
  // én meteen daarna de stap start: de state-update is dan nog niet zichtbaar in
  // deze closure, terwijl de AI-aanroepen het doel wél al nodig hebben.
  const goalRef = useRef(goal);
  goalRef.current = goal;
  const [phase, setPhase] = useState<Phase>('goal');
  // De eindprompt zoals de AI hem op dit moment schrijft (live meelezen).
  const [composeStream, setComposeStream] = useState('');
  // Welk model aan de eindprompt werkt (voedt het laadscherm, zodat zichtbaar
  // is dat er iets gebeurt en welk model het doet).
  const [composeProgress, setComposeProgress] = useState<StreamStatus>({});
  const [plan, setPlan] = useState<PromptPlan | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  // Routing-gate: de vraag die de planner terugstelde, en het antwoord erop. Het
  // antwoord gaat mee in de nieuwe plan-aanvraag.
  const [routing, setRouting] = useState<PlanRouting | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [guardrailFindings, setGuardrailFindings] = useState<GuardrailFinding[] | null>(null);
  // Uitvoering: welke stap draait, het al verzamelde materiaal, en een foutmelding.
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  // Huidige stap — input van de gebruiker en de AI-analyse ervan.
  const [stepAnswers, setStepAnswers] = useState<Record<string, string>>({});
  // Voor-invulling van de stap-velden uit doel + eerder materiaal: herkomst-badges
  // per veld + laadstaat. Een oplopende teller voorkomt dat een trage prefill van
  // een VORIGE stap de velden van de huidige stap overschrijft.
  const [stepFieldMeta, setStepFieldMeta] = useState<FieldMeta>({});
  const [stepPrefilling, setStepPrefilling] = useState(false);
  // Live voortgang van dat voor-invullen: welk model, welke fase en de velden
  // die al binnen zijn. Voedt het laadscherm van de stap.
  const [stepPrefillProgress, setStepPrefillProgress] = useState<PrefillProgress>({});
  const prefillRunRef = useRef(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [stepMaterial, setStepMaterial] = useState<string | null>(null);
  const [stepSummary, setStepSummary] = useState<string>('');
  const [stepGaps, setStepGaps] = useState<PlanStepGap[]>([]);
  const [clarification, setClarification] = useState('');
  // Geserialiseerde persona-definitie (Persona/Multi-Persona-stap); leeg voor
  // andere technieken. Gaat als gelabeld veld mee in de analyse.
  const [personaText, setPersonaText] = useState('');
  // Geserialiseerde few-shot-definitie (Few-Shot-stap); idem.
  const [fewShotText, setFewShotText] = useState('');
  // Geserialiseerde meta-prompt (Meta Prompting-stap); idem.
  const [metaText, setMetaText] = useState('');
  // Geserialiseerde opzet van de rijksspecifieke bouwers (Chain-of-Verification,
  // Step-Back, Rubric). Eén kanaal in plaats van drie: de bouwers leveren alle
  // drie gelabelde tekst en landen op dezelfde plek in de analyse.
  const [builderText, setBuilderText] = useState('');
  // Chain-of-Thought / Socratic: het adaptieve vraag-na-vraag-interview.
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewQuestion, setInterviewQuestion] = useState<string | null>(null);
  const [interviewTranscript, setInterviewTranscript] = useState<TranscriptTurn[]>([]);
  const [interviewAnswer, setInterviewAnswer] = useState('');
  const [interviewBusy, setInterviewBusy] = useState(false);
  // Het interview is klaar en het totaalplaatje wordt nu op hiaten getoetst; de
  // interview-weergave blijft staan tot het materiaal er is.
  const [interviewFinishing, setInterviewFinishing] = useState(false);
  // De conclusie van het interview (het totaalplaatje). Een ref, niet state: de
  // analyse start meteen na de conclusie en moet hem synchroon kunnen meesturen.
  const interviewConclusionRef = useRef<string | null>(null);
  // Socratische eindcontrole: het (nog niet opgeleverde) resultaat + de door de
  // AI blootgelegde aannames + de antwoorden van de gebruiker daarop (per index).
  const [pendingResult, setPendingResult] = useState<OptimizeResult | null>(null);
  const [assumptions, setAssumptions] = useState<TemplateAssumption[]>([]);
  const [assumptionAnswers, setAssumptionAnswers] = useState<Record<number, string>>({});
  // Een bij het laden gevonden, niet-afgemaakte run — aangeboden om te hervatten.
  const [resumable, setResumable] = useState<PersistedRun | null>(null);

  const busy = phase === 'planning' || phase === 'composing';

  // Bij binnenkomst: is er een niet-afgemaakte run bewaard? Bied hem aan om te
  // hervatten (zonder hem meteen te herstellen — de gebruiker kiest).
  useEffect(() => {
    const run = loadRun();
    if (run) setResumable(run);
    // Alleen bij mount uitvoeren.
     
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
    prefillRunRef.current += 1; // een eventueel lopende prefill van de vorige stap vervalt
    setStepAnswers({});
    setStepFieldMeta({});
    setStepPrefilling(false);
    setStepMaterial(null);
    setStepSummary('');
    setStepGaps([]);
    setClarification('');
    setPersonaText('');
    setFewShotText('');
    setMetaText('');
    setInterviewActive(false);
    setInterviewQuestion(null);
    setInterviewTranscript([]);
    setInterviewAnswer('');
    setInterviewFinishing(false);
    interviewConclusionRef.current = null;
  }

  /** Herstel een eerder bewaarde run en ga verder waar de gebruiker gebleven was. */
  function resumeRun() {
    if (!resumable) return;
    const { goal: g, plan: p, outcomes: o, currentStepIndex: idx } = resumable;
    setGoal(g);
    goalRef.current = g; // beginStep() hieronder heeft het doel meteen nodig
    setPlan(p);
    setOutcomes(o);
    setStepError(null);
    setResumable(null);
    // Stond de gebruiker op de compose-stap, laat hem het plan dan eerst opnieuw
    // bekijken in plaats van meteen de eindtemplate te bouwen.
    if (idx >= p.steps.length - 1) {
      setCurrentStepIndex(idx);
      resetStepState();
      setPhase('plan-review');
      return;
    }
    // Anders: hervat de bewaarde stap volledig — inclusief het vraag-na-vraag-
    // interview of de voor-invulling die bij die stap hoort.
    beginStep(p, idx, o);
  }

  /** Verwerp de bewaarde run en begin schoon. */
  function discardRun() {
    clearRunDraft();
    setResumable(null);
  }

  /** Wis doel + afgeleide state en begin opnieuw. */
  function handleClear() {
    // Een lopende, niet-afgemaakte bouw die wordt gewist = afgebroken.
    if (plan && phase !== 'goal') {
      log('cleared', { metadata: { phase, at_step: currentStepIndex, of_steps: plan.steps.length } });
    }
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
    setPendingResult(null);
    setAssumptions([]);
    setAssumptionAnswers({});
    resetStepState();
  }

  /** Vraag de AI om een plan; guardrail-check eerst. */
  function handlePlan() {
    if (!goal.trim()) {
      notify.error('Beschrijf eerst wat je wilt bereiken.');
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

  /**
   * Stelt het plan op. `answered` is het antwoord op de routingvraag: is het gezet,
   * dan staat de herhaalbaarheid vast en vraagt de planner er niet opnieuw naar.
   * Zonder antwoord mag de planner de vraag terugstellen i.p.v. een plan te geven.
   */
  async function runPlan(answered?: Recurrence) {
    setGuardrailFindings(null);
    setUnclearReason(null);
    setRouting(null);
    setPhase('planning');
    // Nieuwe sessie bij een verse aanvraag; bij een antwoord op de routingvraag
    // loopt dezelfde sessie door — het is één poging van de gebruiker.
    if (!answered) {
      sessionRef.current = newBehaviorSession();
      log('session_started', { metadata: { goal_len: goal.trim().length } });
    }
    try {
      // Complexe-doel-flow: alleen losse prompttechnieken plannen; complete
      // frameworks horen bij de eigen-prompt-flow.
      const candidates = techniques.filter((t) => !isContextPrompt(t) && !isSkillCreator(t));
      const res = await generatePlan({
        goal: goal.trim(),
        techniques: candidates,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        recurrence: answered ?? recurrence ?? undefined,
      });
      // Routing-gate: de planner heeft bewust geen plan gemaakt en vraagt eerst of
      // de taak terugkeert. Voorleggen en wachten op het antwoord.
      if (res.routing) {
        setRouting(res.routing);
        log('plan_routing_asked', { metadata: { question: res.routing.question } });
        setPhase('routing');
        return;
      }
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je omschrijving is nog niet duidelijk genoeg. Beschrijf concreet wat je wilt bereiken.',
        );
        log('unclear_rejected', { metadata: { phase: 'plan' } });
        setPhase('goal');
        return;
      }
      if (res.error) notify(res.error, { icon: '⚠️' });
      if (!res.plan || res.plan.steps.length === 0) {
        notify('Geen plan gevonden. Probeer je doel iets concreter te maken.', { icon: 'ℹ️' });
        setPhase('goal');
        return;
      }
      setPlan(res.plan);
      log('plan_generated', {
        metadata: {
          provider: res.provider,
          steps: res.plan.steps.length,
          techniques: res.plan.steps.map((s) => techniqueById(s.technique_id)?.name ?? s.technique_id),
        },
      });
      setPhase('plan-review');
    } catch {
      notify.error('Plan opstellen mislukt. Probeer het opnieuw.');
      setPhase('goal');
    }
  }

  /**
   * Beantwoord de routingvraag. Het antwoord gaat mee in de nieuwe plan-aanvraag
   * (en blijft in state staan, zodat de few-shot-bouwer het straks kan overnemen).
   */
  function answerRouting(answer: Recurrence) {
    setRecurrence(answer);
    log('plan_routing_answered', { metadata: { answer } });
    void runPlan(answer);
  }

  /** Verwijder een stap uit het plan (minimaal één stap blijft staan). */
  function removeStep(id: string) {
    setPlan((prev) => {
      if (!prev || prev.steps.length <= 1) return prev;
      return { ...prev, steps: prev.steps.filter((s) => s.id !== id) };
    });
    log('plan_edited', { metadata: { edit: 'remove' } });
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
    log('plan_edited', { metadata: { edit: 'move', index, dir } });
  }

  /** Pas de titel van een stap aan (inline bewerken in plan-review). */
  function editStepTitle(id: string, title: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.map((s) => (s.id === id ? { ...s, title } : s)) };
    });
    log('plan_edited', { metadata: { edit: 'rename' } });
  }

  /** Is dit de laatste stap? Die stelt de uiteindelijke template samen (compose). */
  function isLastStep(p: PromptPlan, index: number): boolean {
    return index >= p.steps.length - 1;
  }

  /**
   * Mag deze stap meteen doorschieten naar de compose? Alleen als er niets bij
   * de gebruiker op te halen valt. Een laatste stap met een eigen bouwer
   * (few-shot, persona) of met vervolgvragen moet die invoer éérst tonen —
   * anders wordt de bouwer nooit zichtbaar en landt de gebruiker direct op de
   * socratische controle.
   */
  function composesWithoutInput(p: PromptPlan, index: number): boolean {
    const step = p.steps[index];
    // Voorbij de laatste stap: alle input is binnen, er valt alleen nog samen
    // te stellen.
    if (!step) return true;
    if (step.interactive) return false;
    const technique = techniqueById(step.technique_id);
    return !technique || !hasOwnInputStep(technique);
  }

  /** Start de uitvoering: begin bij stap 0 met een schone lei. */
  function handleBuild() {
    if (!plan) return;
    setOutcomes([]);
    log('build_started', { metadata: { steps: plan.steps.length } });
    beginStep(plan, 0, []);
  }

  /**
   * Begin een stap: reset de per-stap-state en toon óf het invoerscherm
   * (tussenstap) óf stel meteen de template samen (laatste stap). Bij een
   * interactieve stap (chain-of-thought/socratic) start meteen het interview —
   * óók als het de laatste stap is: dan wordt eerst vraag voor vraag de context
   * aangescherpt en gaat de conclusie als uitgewerkt materiaal de compose in,
   * in plaats van een prompt die de dialoog nog moet "aanzetten".
   */
  function beginStep(p: PromptPlan, index: number, accumulated: StepOutcome[]) {
    setCurrentStepIndex(index);
    setStepError(null);
    setUnclearReason(null);
    resetStepState();
    const step = p.steps[index];
    if (isLastStep(p, index) && composesWithoutInput(p, index)) {
      void composeFinal(p, accumulated);
      return;
    }
    setPhase('collecting');
    log('step_started', {
      stepIndex: index,
      techniqueId: step?.technique_id,
      metadata: {
        title: step?.title,
        produces: step?.produces,
        interactive: Boolean(step?.interactive),
        format: step ? techniqueById(step.technique_id) && structureFormat(techniqueById(step.technique_id)!) : undefined,
      },
    });
    if (step?.interactive) {
      setInterviewActive(true);
      void interviewTurn(p, index, accumulated, [], false);
    } else {
      // Slim bundelen: vul de velden van deze stap alvast voor op basis van
      // alle context tot nu toe (doel + materiaal van eerdere stappen).
      void prefillStepFields(p, index, accumulated);
    }
  }

  /**
   * Vul de velden van een niet-interactieve stap alvast voor op basis van ALLE
   * context tot nu toe: het doel + het materiaal van eerdere stappen. Zo bouwt
   * elke stap voort op wat al is vastgesteld (bijv. een Chain-of-Thought-
   * conclusie vult de persona- of template-velden). Best-effort: bij een fout
   * of onduidelijke context begint de gebruiker gewoon met lege velden.
   */
  async function prefillStepFields(p: PromptPlan, index: number, accumulated: StepOutcome[]) {
    const step = p.steps[index];
    const technique = techniqueById(step?.technique_id);
    if (!step || !technique || technique.follow_up_questions.length === 0) return;
    const fmt = structureFormat(technique);
    // Persona/Few-Shot/Meta hebben eigen bouwers (geen vragenlijst): niets voor te vullen.
    if (fmt === 'persona' || fmt === 'multi-persona' || fmt === 'few-shot' || fmt === 'meta') return;
    // Template-based niet automatisch voorvullen: daar kiest de gebruiker eerst
    // zélf een voorbeelddocument of omschrijft het gewenste format. Meteen
    // invullen neemt die keuze uit handen.
    if (fmt === 'template-based') return;
    const context = [goalRef.current.trim(), serializeOutcomes(accumulated)].filter(Boolean).join('\n\n');
    if (!context) return;
    const runId = ++prefillRunRef.current;
    setStepPrefilling(true);
    setStepPrefillProgress({ models: [], winner: null, phase: 'reading', fields: [] });
    try {
      const res = await prefillFields({
        ownPrompt: context,
        technique,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        // Voortgang van een inmiddels achterhaalde stap negeren.
        onStatus: (status) => {
          if (prefillRunRef.current !== runId) return;
          setStepPrefillProgress((p) => ({
            ...p,
            ...(status.models ? { models: status.models } : {}),
            ...(status.phase ? { phase: status.phase as PrefillPhase } : {}),
            ...(status.provider ? { winner: status.provider } : {}),
          }));
        },
        onField: (field) => {
          if (prefillRunRef.current !== runId) return;
          setStepPrefillProgress((p) =>
            (p.fields ?? []).some((f) => f.id === field.id)
              ? p
              : { ...p, fields: [...(p.fields ?? []), field] },
          );
        },
      });
      // Inmiddels een andere stap actief? Dan dit (verouderde) resultaat negeren.
      if (prefillRunRef.current !== runId) return;
      // Niets ingevuld door een storing bij de AI-dienst: dat zeggen we, anders
      // ziet de gebruiker alleen lege velden en weet hij niet waarom.
      if (res.error) notify(res.error, { icon: 'ℹ️' });
      if (res.unclear || res.fields.length === 0) return;
      setStepAnswers(Object.fromEntries(res.fields.map((f) => [f.id, f.value])));
      setStepFieldMeta(
        Object.fromEntries(res.fields.map((f) => [f.id, { source: f.source, note: f.note }])),
      );
      log('step_prefilled', {
        stepIndex: index,
        techniqueId: step.technique_id,
        metadata: { fields_filled: res.fields.length, context_len: context.length },
      });
    } catch {
      /* voor-invullen is een hulp-laag; bij een fout blijven de velden leeg */
    } finally {
      if (prefillRunRef.current === runId) setStepPrefilling(false);
    }
  }

  /** Laat de herkomst-badge vervallen zodra de gebruiker een stap-veld zelf aanpast. */
  function handleStepFieldEdit(id: string) {
    setStepFieldMeta((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /** Herprobeer de huidige (mislukte) stap; behoud het al verzamelde materiaal. */
  function retryStep() {
    if (!plan) return;
    setStepError(null);
    setUnclearReason(null);
    // Mislukte de stap midden in een interview (ook op de laatste stap), herpak
    // dan die beurt; anders is de laatste stap altijd de compose.
    if (interviewActive) {
      setPhase('collecting');
      void interviewTurn(plan, currentStepIndex, outcomes, interviewTranscript, false);
      return;
    }
    if (isLastStep(plan, currentStepIndex)) {
      void composeFinal(plan, outcomes);
      return;
    }
    setPhase('collecting');
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
    log('step_regenerated', { stepIndex: index, techniqueId: plan.steps[index]?.technique_id });
    beginStep(plan, index, kept);
  }

  /**
   * "Genereren" op een tussenstap: stuur de input van de gebruiker naar de AI,
   * die het materiaal uitschrijft én benoemt wat er nog ontbreekt voor het totale
   * plaatje. `extraClarification` komt uit de "wat mist nog"-lus.
   * `fallbackMaterial` wordt gebruikt door de Chain-of-Thought-stap: mislukt de
   * hiaten-analyse van het totaalplaatje, dan landen we zacht op de conclusie van
   * het gesprek zelf (echte inhoud) in plaats van op een foutscherm.
   */
  async function analyzeCurrentStep(extraClarification?: string, fallbackMaterial?: string) {
    if (!plan) return;
    /** Zachte landing bij een mislukte analyse van een interview-conclusie. */
    const softLand = () => {
      if (!fallbackMaterial) return false;
      setStepMaterial(fallbackMaterial);
      setStepSummary('');
      setStepGaps([]);
      return true;
    };
    const step = plan.steps[currentStepIndex];
    const technique = techniqueById(step.technique_id);
    if (!technique) {
      setStepError('Kon de techniek voor deze stap niet vinden.');
      setPhase('error');
      return;
    }

    // Guardrail-check op de ingevulde velden + persona/few-shot/meta + toelichting.
    const toCheck = [
      ...Object.values(stepAnswers),
      personaText,
      fewShotText,
      metaText,
      builderText,
      extraClarification ?? '',
    ]
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
    const isClarify = Boolean(extraClarification?.trim());
    log(isClarify ? 'clarification_added' : 'analyze_run', {
      stepIndex: currentStepIndex,
      techniqueId: step.technique_id,
      metadata: {
        answered_fields: Object.values(stepAnswers).filter((v) => v.trim()).length,
        has_persona: Boolean(personaText.trim()),
        clarification_len: extraClarification?.trim().length ?? 0,
      },
    });
    try {
      const res = await analyzePlanStep({
        goal: goalRef.current.trim(),
        step,
        technique,
        answers: stepAnswers,
        // De gestructureerde persona-/few-shot-/meta-definitie gaat als gelabeld veld mee.
        extraAnsweredFields: [
          // Chain-of-Thought/Socratic: het totaalplaatje uit het gesprek IS de input
          // van deze stap; de analyse toetst het op wat er nog ontbreekt.
          ...(interviewConclusionRef.current
            ? [
                {
                  id: 'gesprek_conclusie',
                  label: 'Totaalplaatje uit het vraag-na-vraag-gesprek',
                  answer: interviewConclusionRef.current,
                },
              ]
            : []),
          ...(personaText.trim()
            ? [{ id: 'persona_definitie', label: 'Persona-definitie', answer: personaText.trim() }]
            : []),
          ...(fewShotText.trim()
            ? [{ id: 'fewshot_definitie', label: 'Few-shot-definitie', answer: fewShotText.trim() }]
            : []),
          ...(metaText.trim()
            ? [{ id: 'meta_prompt', label: 'Meta-prompt', answer: metaText.trim() }]
            : []),
          ...(builderText.trim()
            ? [{ id: 'builder_input', label: 'Ingevulde bouwer', answer: builderText.trim() }]
            : []),
        ],
        outcomesSummary: serializeOutcomes(outcomes),
        clarification: extraClarification,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        if (softLand()) return;
        setUnclearReason(
          res.reason?.trim() ||
            'Je invoer is nog niet duidelijk genoeg. Vul de velden concreter in.',
        );
        log('unclear_rejected', { stepIndex: currentStepIndex, metadata: { phase: 'analyze' } });
        return;
      }
      if (!res.success || !res.material) {
        if (softLand()) return;
        setStepError(res.error ?? 'De analyse voor deze stap kon niet worden gemaakt.');
        log('step_error', { stepIndex: currentStepIndex, metadata: { where: 'analyze', error: res.error } });
        setPhase('error');
        return;
      }
      setStepMaterial(res.material);
      setStepSummary(res.summary ?? '');
      setStepGaps(res.gaps ?? []);
      setClarification('');
      if ((res.gaps ?? []).length > 0) {
        log('gaps_shown', {
          stepIndex: currentStepIndex,
          metadata: { count: res.gaps!.length, labels: res.gaps!.map((g) => g.label) },
        });
      }
    } catch (err) {
      if (softLand()) return;
      setStepError(err instanceof Error ? err.message : 'Analyse mislukt.');
      log('step_error', { stepIndex: currentStepIndex, metadata: { where: 'analyze' } });
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
   * Het vraag-na-vraag-gesprek leverde het totaalplaatje op. Toets dat meteen op
   * HIATEN — wat is nog niet duidelijk? — zodat de gebruiker het kan aanvullen
   * vóórdat de volgende technieken erop voortbouwen. De interview-weergave blijft
   * staan tot het materiaal er is; daarna neemt de gewone materiaal-weergave het
   * over (tussenresultaat + "wat mist nog" + volgende stap).
   */
  async function completeInterviewStep(conclusion: string) {
    interviewConclusionRef.current = conclusion;
    setInterviewFinishing(true);
    try {
      await analyzeCurrentStep(undefined, conclusion);
    } finally {
      setInterviewFinishing(false);
      setInterviewActive(false);
    }
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
        goal: goalRef.current.trim(),
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
        log('interview_question', {
          stepIndex: index,
          techniqueId: step.technique_id,
          metadata: { turn: turns.length + 1 },
        });
        return;
      }
      // De AI is klaar: de conclusie wordt het materiaal van deze stap. Vanaf hier
      // loopt de gewone flow (tonen + "Volgende stap"/compose) door.
      if (res.material) {
        setInterviewQuestion(null);
        log('interview_finished', {
          stepIndex: index,
          techniqueId: step.technique_id,
          metadata: { turns: turns.length, forced: forceFinish },
        });
        // Interview op de LAATSTE stap: de conclusie gaat als uitgewerkt
        // materiaal direct de compose in — de gebruiker hoeft niets extra's te doen.
        if (isLastStep(p, index)) {
          setInterviewActive(false);
          const outcome: StepOutcome = {
            step_id: step.id,
            technique_id: step.technique_id,
            produces: step.produces,
            material: res.material,
            answers: Object.fromEntries(turns.map((t, i) => [`vraag_${i + 1}`, `${t.question}\n${t.answer}`])),
          };
          const next = [...accumulated, outcome];
          setOutcomes(next);
          void composeFinal(p, next);
          return;
        }
        // Tussenstap (normaal gesproken de vaste eerste stap): toets het
        // totaalplaatje op hiaten zodat de gebruiker kan aanvullen.
        void completeInterviewStep(res.material);
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
      notify.error('Vul eerst een antwoord in, of rond het interview af.');
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
    log('interview_answer', { stepIndex: currentStepIndex, metadata: { turn: turns.length, answer_len: answer.length } });
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
    log('interview_answer', { stepIndex: currentStepIndex, metadata: { turn: turns.length, answer_len: answer.length } });
    void interviewTurn(plan, currentStepIndex, outcomes, turns, false);
  }

  /** "Ik heb genoeg gedeeld": rond het interview af met een conclusie. */
  function finishInterview() {
    if (!plan) return;
    setInterviewQuestion(null);
    log('interview_finished', { stepIndex: currentStepIndex, metadata: { turns: interviewTranscript.length, forced: true } });
    void interviewTurn(plan, currentStepIndex, outcomes, interviewTranscript, true);
  }

  /**
   * Vul de velden van de huidige stap voor vanuit een structuurbron: óf een
   * geüpload voorbeelddocument (`source: 'document'`), óf een omschrijving van
   * het gewenste document als de gebruiker geen voorbeeld heeft
   * (`source: 'brief'`). Alleen zinvol bij template-based.
   */
  async function prefillFromStructure(
    text: string,
    source: 'document' | 'brief',
  ): Promise<boolean> {
    if (!plan) return false;
    const step = plan.steps[currentStepIndex];
    const technique = techniqueById(step.technique_id);
    if (!technique) return false;
    const fromDocument = source === 'document';
    const res = await prefillFields({
      ownPrompt: text,
      technique,
      fromDocument,
      fromFormatBrief: !fromDocument,
      preferredProvider: settings.provider,
      preferredModel: settings.model,
    });
    if (res.unclear) {
      notify.error(
        res.reason?.trim() ||
          (fromDocument
            ? 'Uit het document kon geen bruikbare structuur worden gehaald.'
            : 'Uit deze omschrijving kon geen bruikbare structuur worden afgeleid.'),
      );
      return false;
    }
    if (res.fields.length === 0) {
      notify(
        fromDocument
          ? 'Geen velden ingevuld uit het document. Vul ze zelf aan.'
          : 'Geen velden ingevuld op basis van je omschrijving. Vul ze zelf aan.',
        { icon: 'ℹ️' },
      );
      return false;
    }
    if (res.error) notify(res.error, { icon: '⚠️' });
    // Voeg de afgeleide waarden toe (bestaande, door de gebruiker ingevulde velden
    // niet overschrijven — die zijn leidend).
    setStepAnswers((prev) => {
      const next = { ...prev };
      for (const f of res.fields) {
        if (!next[f.id]?.trim()) next[f.id] = f.value;
      }
      return next;
    });
    log(fromDocument ? 'document_uploaded' : 'format_brief_used', {
      stepIndex: currentStepIndex,
      techniqueId: step.technique_id,
      metadata: { chars: text.length, fields_filled: res.fields.length },
    });
    return true;
  }

  /** Leg het materiaal van deze stap vast en ga naar de volgende stap. */
  function commitStep() {
    if (!plan || stepMaterial == null) return;
    const step = plan.steps[currentStepIndex];
    // Er is een gestructureerde persona-/few-shot-definitie gebruikt bij deze stap.
    if (personaText.trim())
      log('persona_ai_filled', { stepIndex: currentStepIndex, metadata: { persona_len: personaText.trim().length } });
    if (fewShotText.trim())
      log('fewshot_extracted', { stepIndex: currentStepIndex, metadata: { fewshot_len: fewShotText.trim().length } });
    if (metaText.trim())
      log('meta_built', { stepIndex: currentStepIndex, metadata: { meta_len: metaText.trim().length } });
    const extraAnswers: Record<string, string> = {};
    if (interviewConclusionRef.current) extraAnswers.gesprek_conclusie = interviewConclusionRef.current;
    if (personaText.trim()) extraAnswers.persona_definitie = personaText.trim();
    if (fewShotText.trim()) extraAnswers.fewshot_definitie = fewShotText.trim();
    if (metaText.trim()) extraAnswers.meta_prompt = metaText.trim();
    if (builderText.trim()) extraAnswers.builder_input = builderText.trim();
    const outcome: StepOutcome = {
      step_id: step.id,
      technique_id: step.technique_id,
      produces: step.produces,
      material: stepMaterial,
      answers: { ...stepAnswers, ...extraAnswers },
    };
    const next = [...outcomes, outcome];
    setOutcomes(next);
    log('step_committed', {
      stepIndex: currentStepIndex,
      techniqueId: step.technique_id,
      metadata: { material_len: stepMaterial.length },
    });
    beginStep(plan, currentStepIndex + 1, next);
  }

  /**
   * Is het vraag-na-vraag-gesprek al ÍN de tool gevoerd? Dan moet de compose
   * een uitgewerkte, direct uitvoerbare prompt maken in plaats van een prompt
   * die de chain-of-thought/socratische dialoog nog "aanzet".
   */
  function interviewIsResolved(technique: Technique, accumulated: StepOutcome[]): boolean {
    const fmt = structureFormat(technique);
    if (fmt !== 'chain-of-thought' && fmt !== 'socratic') return false;
    return accumulated.some((o) => {
      const t = techniqueById(o.technique_id);
      const f = t ? structureFormat(t) : undefined;
      return f === 'chain-of-thought' || f === 'socratic';
    });
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
    setComposeStream(''); // meegelezen tekst van een vorige poging wissen
    setComposeProgress({}); // en de voortgang van die poging ook
    log('compose_run', { techniqueId: step.technique_id, metadata: { steps: accumulated.length } });
    try {
      const res = await generatePrompt({
        technique,
        promptContent: goalRef.current.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: {},
        // Al het verzamelde materiaal als gelabelde context — exact het formaat
        // dat de generate-modus als "ANTWOORDEN VAN DE GEBRUIKER" verwerkt.
        extraAnsweredFields: accumulated.map((o) => ({
          id: o.step_id,
          label: outcomeLabel(o),
          answer: o.material,
        })),
        // Het CoT/Socratische gesprek is al gevoerd → uitgewerkte prompt.
        interviewResolved: interviewIsResolved(technique, accumulated),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        systemPrompt: settings.systemPrompt.trim() || undefined,
        toneInstruction: settings.toneInstruction.trim() || undefined,
        ...overheidsContext(settings),
        temperature: settings.temperature,
        // Meelezen terwijl de eindprompt wordt geschreven.
        onChunk: setComposeStream,
        onStatus: (status) => setComposeProgress((p) => ({ ...p, ...status })),
      });
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je invoer is niet duidelijk genoeg om er een zinvolle prompt van te maken.',
        );
        setStepError('De invoer was niet duidelijk genoeg voor de eindprompt.');
        log('unclear_rejected', { metadata: { phase: 'compose' } });
        setPhase('error');
        return;
      }
      const recipe: PromptRecipe = { goal: goalRef.current.trim(), plan: p, outcomes: accumulated };
      const finalResult: OptimizeResult = { ...res, recipe };

      // Socratische eindcontrole (best-effort): welke aannames zitten er in het
      // resultaat die de gebruiker niet zelf heeft aangeleverd? Gevonden aannames
      // worden vragen; de antwoorden scherpen de template aan. Faalt de controle,
      // dan gaat het resultaat gewoon door — de template blijft bruikbaar.
      const check = await checkAssumptions({
        goal: goalRef.current.trim(),
        templateContent: res.optimized_content,
        outcomesSummary: serializeOutcomes(accumulated),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (check.success && check.assumptions.length > 0) {
        setPendingResult(finalResult);
        setAssumptions(check.assumptions);
        setAssumptionAnswers({});
        log('assumptions_shown', {
          metadata: { count: check.assumptions.length, labels: check.assumptions.map((a) => a.label) },
        });
        setPhase('assumption-review');
        return;
      }

      clearRunDraft();
      onResult(finalResult, technique);
    } catch (err) {
      setStepError(err instanceof Error ? err.message : 'Prompt samenstellen mislukt.');
      log('step_error', { metadata: { where: 'compose' } });
      setPhase('error');
    }
  }

  /**
   * Socratische eindcontrole — "Gebruik zoals het is": lever het al samengestelde
   * resultaat op zonder de aannames te verwerken.
   */
  function skipAssumptions() {
    if (!plan || !pendingResult) return;
    const technique = techniqueById(plan.steps[plan.steps.length - 1]?.technique_id);
    if (!technique) return;
    log('assumptions_skipped', { metadata: { count: assumptions.length } });
    clearRunDraft();
    onResult(pendingResult, technique);
  }

  /**
   * Socratische eindcontrole — "Verwerk mijn antwoorden": guardrail-check en dan
   * de template opnieuw samenstellen mét de beantwoorde aannames als context.
   * Onbeantwoorde vragen tellen niet mee; zijn ze állemaal leeg, dan is dit
   * hetzelfde als overslaan.
   */
  function applyAssumptions() {
    if (!plan || !pendingResult) return;
    const answered = assumptions
      .map((a, i) => ({ ...a, answer: (assumptionAnswers[i] ?? '').trim() }))
      .filter((a) => a.answer);
    if (answered.length === 0) {
      skipAssumptions();
      return;
    }
    const toCheck = answered.map((a) => a.answer).join('\n');
    const findings: GuardrailFinding[] = [
      ...(settings.pii.enabled ? detectPii(toCheck) : []),
      ...detectBlockedTopics(toCheck, settings.blockedTopics),
    ];
    if (findings.length > 0) {
      setGuardrailFindings(findings);
      return;
    }
    void recomposeWithAssumptions(answered);
  }

  /** Guardrail bevestigd → verwerk de aanname-antwoorden alsnog. */
  function confirmApplyAssumptions() {
    const answered = assumptions
      .map((a, i) => ({ ...a, answer: (assumptionAnswers[i] ?? '').trim() }))
      .filter((a) => a.answer);
    if (answered.length === 0) return;
    void recomposeWithAssumptions(answered);
  }

  /** Stel de eindtemplate opnieuw samen met de beantwoorde aannames als extra context. */
  async function recomposeWithAssumptions(
    answered: (TemplateAssumption & { answer: string })[],
  ) {
    if (!plan || !pendingResult) return;
    const step = plan.steps[plan.steps.length - 1];
    const technique = techniqueById(step?.technique_id);
    if (!technique) return;
    setPhase('composing');
    setComposeStream(''); // meegelezen tekst van een vorige poging wissen
    setComposeProgress({}); // en de voortgang van die poging ook
    log('assumptions_applied', { metadata: { answered: answered.length } });
    try {
      const res = await generatePrompt({
        technique,
        promptContent: goalRef.current.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: {},
        extraAnsweredFields: [
          ...outcomes.map((o) => ({ id: o.step_id, label: outcomeLabel(o), answer: o.material })),
          // De beantwoorde aannames: vraag + antwoord als gelabelde context, zodat
          // de nieuwe versie de aannames vervangt door wat de gebruiker écht wil.
          ...answered.map((a, i) => ({
            id: `aanname_${i + 1}`,
            label: a.label ? `Socratische verduidelijking: ${a.label}` : 'Socratische verduidelijking',
            answer: `${a.question}\nAntwoord van de gebruiker: ${a.answer}`,
          })),
        ],
        interviewResolved: interviewIsResolved(technique, outcomes),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        systemPrompt: settings.systemPrompt.trim() || undefined,
        toneInstruction: settings.toneInstruction.trim() || undefined,
        ...overheidsContext(settings),
        temperature: settings.temperature,
        // Meelezen terwijl de eindprompt wordt geschreven.
        onChunk: setComposeStream,
        onStatus: (status) => setComposeProgress((p) => ({ ...p, ...status })),
      });
      if (res.unclear || !res.optimized_content?.trim()) {
        // Aanscherpen lukte niet → val terug op het al goedgekeurde resultaat.
        notify('Aanscherpen lukte niet; de eerdere prompt is gebruikt.', { icon: 'ℹ️' });
        clearRunDraft();
        onResult(pendingResult, technique);
        return;
      }
      clearRunDraft();
      onResult({ ...res, recipe: pendingResult.recipe }, technique);
    } catch {
      notify('Aanscherpen lukte niet; de eerdere prompt is gebruikt.', { icon: 'ℹ️' });
      clearRunDraft();
      onResult(pendingResult, technique);
    }
  }

  return (
    <nldd-container gap="20">
      <nldd-card>
        {header}
        <nldd-container padding="20" sm-padding="16" gap="16">
          <nldd-container gap="8">
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-button
                appearance="neutral-transparent"
                size="sm"
                start-icon="info-circle"
                text="Voorbeelden"
                accessible-label="Bekijk voorbeelden"
                expanded={showExamples || undefined}
                onClick={() => setShowExamples((v) => !v)}
              ></nldd-button>
              {goal.trim() && (
                <nldd-button
                  appearance="neutral-transparent"
                  size="sm"
                  start-icon="delete"
                  text="Opschonen"
                  accessible-label="Wis je doel en begin opnieuw"
                  onClick={handleClear}
                ></nldd-button>
              )}
            </nldd-container>

            {showExamples && (
              <nldd-container gap="6">
                <nldd-text size="xs" color="secondary">
                  Voorbeelden van samengestelde doelen. Kies er één om in te vullen.
                </nldd-text>
                <nldd-list appearance="box-tinted" accessible-label="Voorbeelden van doelen">
                  {GOAL_EXAMPLES.map((ex) => (
                    <nldd-list-item
                      key={ex}
                      button
                      onClick={() => {
                        setGoal(ex);
                        setShowExamples(false);
                      }}
                    >
                      <nldd-text-cell size="sm" text={ex}></nldd-text-cell>
                    </nldd-list-item>
                  ))}
                </nldd-list>
              </nldd-container>
            )}

            <nldd-form-field label="Wat wil je graag bereiken?">
              <TextArea
                value={goal}
                onValue={setGoal}
                rows={5}
                resize="vertical"
                disabled={busy || undefined}
                placeholder="Bijv. er moet een projectplan geschreven worden voor de invoering van een nieuwe interne tool"
              />
              <nldd-form-field-help-text>
                We beginnen met vragen tot je vraagstuk compleet in beeld is, en versterken dat beeld
                daarna met meerdere technieken tot één sterke, herbruikbare prompt.
              </nldd-form-field-help-text>
            </nldd-form-field>
            <VerantwoordGebruikHint text={goal} />

            {/* Hervat-melding: er staat nog een niet-afgemaakte bouw bewaard. */}
            {resumable && phase === 'goal' && !plan && (
              <nldd-banner
                variant="accent"
                icon="arrow-clockwise"
                text={`Je hebt nog een niet-afgemaakte bouw (${resumable.outcomes.length}/${resumable.plan.steps.length} stappen)`}
                supporting-text="Verder waar je gebleven was?"
              >
                <nldd-button slot="actions" appearance="secondary" text="Verwijder" onClick={discardRun}></nldd-button>
                <nldd-button slot="actions" appearance="primary" text="Hervatten" onClick={resumeRun}></nldd-button>
              </nldd-banner>
            )}
          </nldd-container>

          {phase !== 'plan-review' && (
            <nldd-button-group>
              <nldd-button
                appearance="primary"
                start-icon="magic"
                text="Stel een plan op"
                loading={phase === 'planning' || undefined}
                loading-text="Plan opstellen"
                disabled={phase === 'composing' || !goal.trim() || undefined}
                onClick={handlePlan}
              ></nldd-button>
            </nldd-button-group>
          )}
        </nldd-container>

        {/* Routing-gate: de planner kon de herhaalbaarheid niet uit het doel
            afleiden. Eén vraag, en dan pas een plan. */}
        {phase === 'routing' && routing && (
          <>
            <nldd-divider></nldd-divider>
            <nldd-container padding="20" sm-padding="16" gap="12">
              <nldd-title
                heading-level={3}
                size={5}
                text={routing.question}
                supporting-text="Dit bepaalt of voorbeelden zinvol zijn. Voorbeelden werken alleen als er telkens iets soortgelijks binnenkomt waar op dezelfde manier op gereageerd moet worden."
              ></nldd-title>
              <nldd-list appearance="box-tinted" accessible-label={routing.question}>
                {routing.options.map((o) => (
                  <nldd-list-item key={o.id} button onClick={() => answerRouting(o.id)}>
                    <nldd-text-cell text={o.label} supporting-text={o.hint}></nldd-text-cell>
                    <nldd-spacer-cell size="12"></nldd-spacer-cell>
                    <nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
                  </nldd-list-item>
                ))}
              </nldd-list>
            </nldd-container>
          </>
        )}

        {/* Adviesdeel: het opgestelde plan (review) óf de uitvoering (executing). */}
        {plan && (
          <>
            <nldd-divider></nldd-divider>
            <nldd-container padding="20" sm-padding="16" gap="20">
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
              ) : phase === 'assumption-review' && pendingResult ? (
                <AssumptionReview
                  assumptions={assumptions}
                  answers={assumptionAnswers}
                  onAnswerChange={(i, v) => setAssumptionAnswers((prev) => ({ ...prev, [i]: v }))}
                  templateContent={pendingResult.optimized_content}
                  onApply={applyAssumptions}
                  onSkip={skipAssumptions}
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
                  stepFieldMeta={stepFieldMeta}
                  stepPrefilling={stepPrefilling}
                  stepPrefillProgress={stepPrefillProgress}
                  onStepFieldEdit={handleStepFieldEdit}
                  analyzing={analyzing}
                  stepMaterial={stepMaterial}
                  stepSummary={stepSummary}
                  stepGaps={stepGaps}
                  clarification={clarification}
                  onClarificationChange={setClarification}
                  onAnalyze={() => void analyzeCurrentStep(clarification.trim() || undefined)}
                  onCommit={commitStep}
                  onPrefillFromDocument={(text) => prefillFromStructure(text, 'document')}
                  onDescribeFormat={(brief) => prefillFromStructure(brief, 'brief')}
                  settings={settings}
                  goal={goal}
                  onPersonaChange={setPersonaText}
                  onFewShotChange={setFewShotText}
                  onMetaChange={setMetaText}
                  onBuilderChange={setBuilderText}
                  interviewActive={interviewActive}
                  interviewQuestion={interviewQuestion}
                  interviewTranscript={interviewTranscript}
                  interviewAnswer={interviewAnswer}
                  interviewBusy={interviewBusy}
                  interviewFinishing={interviewFinishing}
                  onInterviewAnswerChange={setInterviewAnswer}
                  onSubmitInterviewAnswer={submitInterviewAnswer}
                  onFinishInterview={finishInterview}
                  composeStream={composeStream}
                  composeProgress={composeProgress}
                />
              )}
            </nldd-container>
          </>
        )}
      </nldd-card>

      {unclearReason && (
        <nldd-banner
          variant="warning"
          text="Je omschrijving is nog niet duidelijk genoeg"
          supporting-text={stripMarkdown(unclearReason)}
        ></nldd-banner>
      )}

      {guardrailFindings && (
        <GuardrailDialog
          findings={guardrailFindings}
          piiWarning={settings.pii.warning}
          // Route naar de juiste actie: een interview-antwoord, de stap-analyse,
          // de aanname-antwoorden (socratische eindcontrole), óf het opstellen
          // van het plan (doel-fase).
          onConfirm={() => {
            setGuardrailFindings(null);
            if (interviewActive) confirmInterviewAnswer();
            else if (phase === 'collecting') confirmAnalyze();
            else if (phase === 'assumption-review') confirmApplyAssumptions();
            else void runPlan();
          }}
          onCancel={() => setGuardrailFindings(null)}
        />
      )}
    </nldd-container>
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
    <nldd-container gap="16">
      <nldd-container gap="4">
        <nldd-title
          heading-level={3}
          size={5}
          text="Voorgesteld plan"
          supporting-text={plan.summary ? stripMarkdown(plan.summary) : undefined}
        ></nldd-title>
        <nldd-text size="xs" color="secondary">
          Pas de volgorde aan met de pijltjes, hernoem een stap, of verwijder er een.
        </nldd-text>
      </nldd-container>

      <nldd-list appearance="box-tinted" accessible-label="Stappen van het plan">
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
      </nldd-list>

      <nldd-container horizontal-alignment="right">
        <nldd-button
          appearance="primary"
          start-icon="sparkles"
          end-icon="arrow-right"
          text="Start met bouwen"
          onClick={onBuild}
        ></nldd-button>
      </nldd-container>

      <nldd-container layout="row" gap="6" vertical-alignment="center">
        <nldd-icon icon="check-mark" size="16" color="accent"></nldd-icon>
        <nldd-text size="xs" color="secondary">
          We beginnen met vraag voor vraag het totaalplaatje ophalen; de volgende stappen versterken dat
          beeld en het geheel wordt één herbruikbare prompt.
        </nldd-text>
      </nldd-container>
    </nldd-container>
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
    <nldd-list-item>
      {editing ? (
        <nldd-cell width="full">
          <TitleField
            value={draft}
            onValue={setDraft}
            label={`Naam van stap ${index + 1}`}
            onCommit={commit}
            onCancel={() => {
              setDraft(step.title);
              setEditing(false);
            }}
          />
        </nldd-cell>
      ) : (
        <nldd-text-cell
          overline={`Stap ${index + 1}`}
          text={step.title}
          supporting-text={step.rationale ? stripMarkdown(step.rationale) : undefined}
        ></nldd-text-cell>
      )}
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      {(techniqueName || step.interactive) && (
        <nldd-cell>
          <nldd-container layout="wrap" gap="4">
            {techniqueName && <nldd-tag size="sm" color="lintblauw" text={techniqueName}></nldd-tag>}
            {step.interactive && <nldd-tag size="sm" color="oranje" text="vraag na vraag"></nldd-tag>}
          </nldd-container>
        </nldd-cell>
      )}
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-cell>
        <nldd-container layout="row" gap="2">
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon="chevron-up"
            accessible-label={`Stap ${index + 1} omhoog`}
            disabled={index === 0 || undefined}
            onClick={() => onMove(index, -1)}
          ></nldd-icon-button>
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon="chevron-down"
            accessible-label={`Stap ${index + 1} omlaag`}
            disabled={index === total - 1 || undefined}
            onClick={() => onMove(index, 1)}
          ></nldd-icon-button>
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon="pencil"
            accessible-label={`Hernoem stap ${index + 1}`}
            onClick={() => {
              setDraft(step.title);
              setEditing(true);
            }}
          ></nldd-icon-button>
          {total > 1 && (
            <nldd-icon-button
              appearance="critical-transparent"
              size="sm"
              icon="trash"
              accessible-label={`Verwijder stap ${index + 1}`}
              onClick={() => onRemove(step.id)}
            ></nldd-icon-button>
          )}
        </nldd-container>
      </nldd-cell>
    </nldd-list-item>
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
  stepFieldMeta,
  stepPrefilling,
  stepPrefillProgress,
  onStepFieldEdit,
  analyzing,
  stepMaterial,
  stepSummary,
  stepGaps,
  clarification,
  onClarificationChange,
  onAnalyze,
  onCommit,
  onPrefillFromDocument,
  onDescribeFormat,
  settings,
  goal,
  onPersonaChange,
  onFewShotChange,
  onMetaChange,
  onBuilderChange,
  interviewActive,
  interviewQuestion,
  interviewTranscript,
  interviewAnswer,
  interviewBusy,
  interviewFinishing,
  onInterviewAnswerChange,
  onSubmitInterviewAnswer,
  onFinishInterview,
  composeStream,
  composeProgress,
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
  stepFieldMeta: FieldMeta;
  stepPrefilling: boolean;
  /** Live voortgang van dat voor-invullen (welk model, binnengekomen velden). */
  stepPrefillProgress: PrefillProgress;
  onStepFieldEdit: (id: string) => void;
  analyzing: boolean;
  stepMaterial: string | null;
  stepSummary: string;
  stepGaps: PlanStepGap[];
  clarification: string;
  onClarificationChange: (v: string) => void;
  onAnalyze: () => void;
  onCommit: () => void;
  onPrefillFromDocument: (text: string) => Promise<boolean>;
  /** Geen voorbeelddocument: laat de AI een structuur voorstellen uit een omschrijving. */
  onDescribeFormat: (brief: string) => Promise<boolean>;
  settings: AiSettings;
  goal: string;
  onPersonaChange: (text: string) => void;
  onFewShotChange: (text: string) => void;
  onMetaChange: (text: string) => void;
  onBuilderChange: (text: string) => void;
  interviewActive: boolean;
  interviewQuestion: string | null;
  interviewTranscript: TranscriptTurn[];
  interviewAnswer: string;
  interviewBusy: boolean;
  /** Het gesprek is klaar; het totaalplaatje wordt op hiaten getoetst. */
  interviewFinishing: boolean;
  onInterviewAnswerChange: (v: string) => void;
  onSubmitInterviewAnswer: () => void;
  onFinishInterview: () => void;
  /** De eindprompt zoals de AI hem op dit moment schrijft; leeg = nog niets. */
  composeStream: string;
  composeProgress: StreamStatus;
}) {
  const total = plan.steps.length;
  const outcomeByStepId = new Map(outcomes.map((o) => [o.step_id, o]));
  // Verzamelt de laatste stap zelf nog input (eigen bouwer of vervolgvragen)?
  // Dan is hij géén zuivere compose-stap: hij toont eerst zijn invoerscherm en
  // stelt de eindprompt pas samen zodra de gebruiker hem vastlegt.
  const lastStep = plan.steps[total - 1];
  const lastTechnique = techniqueById(lastStep?.technique_id);
  const lastStepCollects = Boolean(
    lastStep && !lastStep.interactive && lastTechnique && hasOwnInputStep(lastTechnique),
  );
  const isComposeStep = (idx: number) => idx >= total - 1 && !lastStepCollects;
  const composing = phase === 'composing';
  // Alle context tot nu toe: het doel + het materiaal van eerdere stappen. Voedt
  // de AI-invulhulp van de persona-bouwer, zodat bijv. een CoT-conclusie de
  // persona mede bepaalt ("slim bundelen").
  const contextText = [goal.trim(), serializeOutcomes(outcomes)].filter(Boolean).join('\n\n');

  return (
    <nldd-container gap="16">
      <nldd-title
        heading-level={3}
        size={5}
        text={composing ? 'De prompt wordt samengesteld…' : `Stap ${Math.min(currentStepIndex + 1, total)} van ${total}`}
        supporting-text="We halen eerst vraag voor vraag het totaalplaatje op; elke volgende stap bouwt daarop voort en de AI denkt mee wat er nog nodig is."
      ></nldd-title>

      {/* Overzicht van de voortgang; meer dan zeven stappen past niet in een balk,
          dan dragen de stappen hieronder het zelf. */}
      {total <= 7 && (
        <nldd-step-bar accessible-label="Voortgang van het plan">
          {plan.steps.map((step, idx) => (
            <nldd-step-bar-item
              key={step.id}
              text={step.title}
              status={
                outcomeByStepId.has(step.id) ? 'past' : idx === currentStepIndex && !composing ? 'current' : 'future'
              }
            ></nldd-step-bar-item>
          ))}
        </nldd-step-bar>
      )}

      <nldd-container gap="12">
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
              // 1 zodra de stap actief wordt, 2 zodra het resultaat er is: beide
              // momenten brengen de stap weer in beeld.
              focusSignal={active ? (stepMaterial != null ? 2 : 1) : 0}
              // Een afgeronde tussenstap mag opnieuw doorlopen worden (niet de
              // compose-stap, en alleen als er nu niets actief loopt).
              onRegenerate={done && !analyzing && !composing && !isComposeStep(idx) ? () => onRegenerateStep(idx) : undefined}
            >
              {/* Actieve tussenstap: input verzamelen + analyse tonen. Een
                  interactieve LAATSTE stap (chain-of-thought/socratic) toont
                  hier eerst het interview; de conclusie gaat daarna de compose in. */}
              {active && technique && (!isComposeStep(idx) || interviewActive) && (
                <StepCollector
                  technique={technique}
                  answers={stepAnswers}
                  onAnswersChange={onStepAnswersChange}
                  fieldMeta={stepFieldMeta}
                  prefilling={stepPrefilling}
                  prefillProgress={stepPrefillProgress}
                  onFieldEdit={onStepFieldEdit}
                  analyzing={analyzing}
                  material={stepMaterial}
                  summary={stepSummary}
                  gaps={stepGaps}
                  clarification={clarification}
                  onClarificationChange={onClarificationChange}
                  onAnalyze={onAnalyze}
                  onCommit={onCommit}
                  onPrefillFromDocument={onPrefillFromDocument}
                  onDescribeFormat={onDescribeFormat}
                  settings={settings}
                  goal={goal}
                  contextText={contextText}
                  onPersonaChange={onPersonaChange}
                  onFewShotChange={onFewShotChange}
                  onMetaChange={onMetaChange}
                  onBuilderChange={onBuilderChange}
                  interviewActive={interviewActive}
                  interviewQuestion={interviewQuestion}
                  interviewTranscript={interviewTranscript}
                  interviewAnswer={interviewAnswer}
                  interviewBusy={interviewBusy}
                  interviewFinishing={interviewFinishing}
                  onInterviewAnswerChange={onInterviewAnswerChange}
                  onSubmitInterviewAnswer={onSubmitInterviewAnswer}
                  onFinishInterview={onFinishInterview}
                  // Verzamelt de laatste stap zelf input, dan volgt de compose
                  // pas ná die stap; anders is de één-na-laatste de opmaat.
                  isLastBeforeCompose={idx === (lastStepCollects ? total - 1 : total - 2)}
                />
              )}
            </StepRow>
          );
        })}
      </nldd-container>

      {/* Eindstap: laat de prompt meelezen terwijl hij wordt samengesteld, in
          plaats van alleen een spinner bij de laatste stap. */}
      {composing && (
        <OptimizingLoader
          techniqueName="je prompt"
          streamText={composeStream}
          models={composeProgress.models}
          winner={composeProgress.provider}
          phase={composeProgress.phase}
        />
      )}

      {error && (
        <nldd-banner variant="critical" text="Deze stap is niet gelukt" supporting-text={stripMarkdown(error)}>
          <nldd-button
            slot="actions"
            appearance="secondary"
            start-icon="arrow-clockwise"
            text="Opnieuw proberen"
            onClick={onRetry}
          ></nldd-button>
        </nldd-banner>
      )}
    </nldd-container>
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
  fieldMeta,
  prefilling,
  prefillProgress,
  onFieldEdit,
  analyzing,
  material,
  summary,
  gaps,
  clarification,
  onClarificationChange,
  onAnalyze,
  onCommit,
  onPrefillFromDocument,
  onDescribeFormat,
  settings,
  goal,
  contextText,
  onPersonaChange,
  onFewShotChange,
  onMetaChange,
  onBuilderChange,
  interviewActive,
  interviewQuestion,
  interviewTranscript,
  interviewAnswer,
  interviewBusy,
  interviewFinishing,
  onInterviewAnswerChange,
  onSubmitInterviewAnswer,
  onFinishInterview,
  isLastBeforeCompose,
}: {
  technique: Technique;
  answers: Record<string, string>;
  onAnswersChange: (a: Record<string, string>) => void;
  fieldMeta: FieldMeta;
  prefilling: boolean;
  prefillProgress: PrefillProgress;
  onFieldEdit: (id: string) => void;
  analyzing: boolean;
  material: string | null;
  summary: string;
  gaps: PlanStepGap[];
  clarification: string;
  onClarificationChange: (v: string) => void;
  onAnalyze: () => void;
  onCommit: () => void;
  onPrefillFromDocument: (text: string) => Promise<boolean>;
  /** Geen voorbeelddocument: laat de AI een structuur voorstellen uit een omschrijving. */
  onDescribeFormat: (brief: string) => Promise<boolean>;
  settings: AiSettings;
  goal: string;
  /** Doel + materiaal van eerdere stappen; voedt de persona-invulhulp. */
  contextText: string;
  onPersonaChange: (text: string) => void;
  onFewShotChange: (text: string) => void;
  onMetaChange: (text: string) => void;
  onBuilderChange: (text: string) => void;
  interviewActive: boolean;
  interviewQuestion: string | null;
  interviewTranscript: TranscriptTurn[];
  interviewAnswer: string;
  interviewBusy: boolean;
  /** Het gesprek is klaar; het totaalplaatje wordt op hiaten getoetst. */
  interviewFinishing: boolean;
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
  // Few-Shot krijgt de eigen meerstaps-bouwer (context → input en output → analyse).
  const isFewShot = format === 'few-shot';
  // Meta Prompting: de AI bouwt zelf de prompt (geen antwoord).
  const isMeta = format === 'meta';
  // De drie rijksspecifieke technieken met een eigen bouwer. Ze delen één
  // terugmeldkanaal (onBuilderChange), want ze leveren alle drie gelabelde tekst.
  const isVerification = format === 'chain-of-verification';
  const isStepBack = format === 'step-back';
  const isRubric = format === 'rubric';
  // De vraag-na-vraag-stap (vast de eerste stap): het materiaal is hier het
  // totaalplaatje waarop alle volgende stappen voortbouwen.
  const isInterviewStep = format === 'chain-of-thought' || format === 'socratic';

  // Chain-of-Thought / Socratic: het adaptieve vraag-na-vraag-interview vervangt
  // de gewone input+Genereren, tot de AI een conclusie levert (dan is material gezet).
  if (interviewActive && material == null) {
    return (
      <InterviewPanel
        socratic={format === 'socratic'}
        question={interviewQuestion}
        transcript={interviewTranscript}
        answer={interviewAnswer}
        busy={interviewBusy || interviewFinishing}
        finishing={interviewFinishing}
        onAnswerChange={onInterviewAnswerChange}
        onSubmit={onSubmitInterviewAnswer}
        onFinish={onFinishInterview}
      />
    );
  }

  return (
    <nldd-container gap="16">
      {/* 0. Alleen bij Template-based: upload een voorbeelddocument om de velden
             op basis van de layout automatisch voor te laten invullen. */}
      {supportsDocument && material == null && (
        <DocumentUpload
          onPrefill={onPrefillFromDocument}
          onDescribe={onDescribeFormat}
          disabled={analyzing}
        />
      )}

      {/* 1. Input van de gebruiker. Persona → persona-builder; Few-Shot → few-shot-
             builder; anders de vervolgvragen van de techniek. */}
      {isPersona ? (
        material == null && (
          <PersonaBuilder
            multi={format === 'multi-persona'}
            settings={settings}
            technique={technique}
            // Slim bundelen: niet alleen het doel, maar ook het materiaal van
            // eerdere stappen (bijv. de CoT-conclusie) voedt de persona-invulhulp.
            context={contextText || goal}
            onSerialized={onPersonaChange}
          />
        )
      ) : isFewShot ? (
        material == null && (
          <FewShotBuilder
            settings={settings}
            onSerialized={onFewShotChange}
            // De context van de few-shot-bouwer begint bij het doel en wat
            // eerdere stappen opleverden; de gebruiker scherpt hem daarna aan.
            initialContext={contextText || goal}
          />
        )
      ) : isMeta ? (
        material == null && <MetaBuilder settings={settings} goal={goal} onSerialized={onMetaChange} />
      ) : isVerification ? (
        material == null && (
          <VerificationBuilder
            settings={settings}
            context={contextText || goal}
            onSerialized={onBuilderChange}
          />
        )
      ) : isStepBack ? (
        material == null && (
          <StepBackBuilder
            settings={settings}
            context={contextText || goal}
            onSerialized={onBuilderChange}
          />
        )
      ) : isRubric ? (
        material == null && (
          <RubricBuilder
            settings={settings}
            context={contextText || goal}
            onSerialized={onBuilderChange}
          />
        )
      ) : hasFields ? (
        <FollowUpQuestions
          technique={technique}
          answers={answers}
          onChange={onAnswersChange}
          fieldMeta={fieldMeta}
          onUserEdit={onFieldEdit}
          prefilling={prefilling}
          prefillProgress={prefillProgress}
        />
      ) : (
        <nldd-text size="sm" color="secondary">
          Deze techniek heeft geen vaste vragen. Klik op &quot;Genereren&quot;; de AI denkt mee wat
          er nog nodig is.
        </nldd-text>
      )}

      {/* 2. Genereren: analyseer de input en bepaal wat nog mist. */}
      {material == null ? (
        <nldd-container horizontal-alignment="right">
          <nldd-button
            appearance="primary"
            start-icon="sparkles"
            text="Genereren"
            loading={analyzing || undefined}
            loading-text="Meedenken"
            onClick={onAnalyze}
          ></nldd-button>
        </nldd-container>
      ) : (
        <nldd-box background="accent-tinted">
          <nldd-container padding="16" gap="12">
            {summary && (
              <nldd-text size="sm" weight="medium">
                {stripMarkdown(summary)}
              </nldd-text>
            )}

            {/* Het uitgeschreven materiaal van deze stap. Bij de vraag-na-vraag-stap
                is dat het totaalplaatje waar de volgende stappen op voortbouwen. */}
            <nldd-container gap="4">
              <nldd-text size="xs" weight="bold" color="secondary">
                {isInterviewStep ? 'Het totaalplaatje' : 'Tussenresultaat'}
              </nldd-text>
              <nldd-box background="base">
                <nldd-container padding="12">
                  <RichText text={material} />
                </nldd-container>
              </nldd-box>
            </nldd-container>

            {/* "Wat mist nog voor het totale plaatje": de doorvraag-lus. */}
            {gaps.length > 0 && (
              <nldd-box background="base">
                <nldd-container padding="12" gap="8">
                  <nldd-container layout="row" gap="8" vertical-alignment="center">
                    <nldd-icon icon="lightbulb" size="16" color="accent"></nldd-icon>
                    <nldd-text size="sm" weight="bold">
                      {isInterviewStep
                        ? 'Dit is nog niet helemaal duidelijk; vul het aan'
                        : 'Wat je nog kunt aanleveren voor een scherper geheel'}
                    </nldd-text>
                  </nldd-container>
                  <nldd-container gap="6">
                    {gaps.map((g, i) => (
                      <nldd-container key={i} layout="row" gap="8">
                        <nldd-icon icon="question-mark-circle" size="16" color="accent"></nldd-icon>
                        <nldd-text size="sm">
                          {g.label && <strong>{g.label}: </strong>}
                          {stripMarkdown(g.question)}
                        </nldd-text>
                      </nldd-container>
                    ))}
                  </nldd-container>
                  <nldd-form-field label="Jouw aanvulling">
                    <TextArea
                      value={clarification}
                      onValue={onClarificationChange}
                      rows={3}
                      resize="vertical"
                      placeholder="Vul aan wat hierboven nog mist…"
                      disabled={analyzing || undefined}
                    />
                  </nldd-form-field>
                  <nldd-button-group>
                    <nldd-button
                      appearance="secondary"
                      start-icon="arrow-clockwise"
                      text="Verwerk mijn aanvulling"
                      loading={analyzing || undefined}
                      loading-text="Opnieuw meedenken"
                      disabled={!clarification.trim() || undefined}
                      onClick={onAnalyze}
                    ></nldd-button>
                  </nldd-button-group>
                </nldd-container>
              </nldd-box>
            )}

            {/* Door naar de volgende stap (of de eindtemplate). */}
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-button
                appearance="neutral-transparent"
                size="sm"
                text="Opnieuw genereren"
                disabled={analyzing || undefined}
                onClick={onAnalyze}
              ></nldd-button>
              <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
              <nldd-button
                appearance="primary"
                start-icon={isLastBeforeCompose ? 'sparkles' : undefined}
                end-icon="arrow-right"
                text={isLastBeforeCompose ? 'Naar de eindprompt' : 'Volgende stap'}
                disabled={analyzing || undefined}
                onClick={onCommit}
              ></nldd-button>
            </nldd-container>
          </nldd-container>
        </nldd-box>
      )}
    </nldd-container>
  );
}

/**
 * Socratische eindcontrole: de AI heeft in de samengestelde template AANNAMES
 * gevonden die de gebruiker niet zelf heeft aangeleverd. Elke aanname is een
 * open vraag; de antwoorden scherpen de template aan tot één sterk geheel.
 * Overslaan mag altijd — dan wordt de template gebruikt zoals hij is.
 */
function AssumptionReview({
  assumptions,
  answers,
  onAnswerChange,
  templateContent,
  onApply,
  onSkip,
}: {
  assumptions: TemplateAssumption[];
  answers: Record<number, string>;
  onAnswerChange: (index: number, value: string) => void;
  templateContent: string;
  onApply: () => void;
  onSkip: () => void;
}) {
  const answeredCount = assumptions.filter((_, i) => (answers[i] ?? '').trim()).length;
  return (
    <nldd-container gap="16">
      <nldd-title
        heading-level={3}
        size={5}
        overline="Socratische controle"
        text="Aannames in het resultaat"
        supporting-text="Je prompt is klaar, maar er zitten aannames in die je niet zelf hebt aangeleverd. Beantwoord de vragen om die aannames te vervangen door wat jíj bedoelt, of gebruik de prompt zoals hij is."
      ></nldd-title>

      <nldd-container gap="12">
        {assumptions.map((a, i) => (
          <nldd-card key={i}>
            <nldd-container padding="16">
              <nldd-form-field
                label={a.label ? `**${a.label}:** ${stripMarkdown(a.question)}` : stripMarkdown(a.question)}
              >
                <TextArea
                  value={answers[i] ?? ''}
                  onValue={(v) => onAnswerChange(i, v)}
                  rows={2}
                  resize="vertical"
                  placeholder="Laat leeg als de aanname klopt…"
                />
              </nldd-form-field>
            </nldd-container>
          </nldd-card>
        ))}
      </nldd-container>

      {/* De huidige template (nog zonder de aanscherping), ter referentie. */}
      <nldd-container gap="4">
        <nldd-text size="xs" weight="bold" color="secondary">
          Huidige prompt
        </nldd-text>
        <nldd-box>
          <nldd-container padding="12">
            <RichText text={templateContent} />
          </nldd-container>
        </nldd-box>
      </nldd-container>

      <nldd-container layout="wrap" gap="12" vertical-alignment="center">
        <nldd-button appearance="secondary" start-icon="check-mark" text="Gebruik zoals het is" onClick={onSkip}></nldd-button>
        <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
        {/* Niet uitschakelen bij lege velden: "laat leeg als de aanname klopt" is
            een geldig antwoord. `applyAssumptions` behandelt een lege set als
            overslaan, dus beide knoppen komen dan op hetzelfde uit. */}
        <nldd-button
          appearance="primary"
          start-icon="sparkles"
          text={answeredCount === 0 ? 'Maak de prompt' : `Verwerk mijn antwoorden (${answeredCount})`}
          onClick={onApply}
        ></nldd-button>
      </nldd-container>
    </nldd-container>
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
  focusSignal,
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
  /**
   * Verandert zodra deze stap de aandacht opeist: bij het activeren en zodra het
   * resultaat binnen is. Elke wijziging brengt de kop van de stap in beeld.
   */
  focusSignal: number;
  /** Extra inhoud onder de titel — het invoer-/analysepaneel op de actieve stap. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const active = status === 'active';
  const rowRef = useRef<HTMLElement>(null);

  // Na het vastleggen van een stap (of zodra het resultaat er is) staat de
  // gebruiker onderaan de pagina; breng de kop van de actieve stap in beeld
  // zodat hij meteen verder kan typen in plaats van eerst omhoog te scrollen.
  useEffect(() => {
    if (!focusSignal) return;
    const frame = requestAnimationFrame(() => {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusSignal]);

  return (
    <nldd-card ref={rowRef} background={active ? 'accent-tinted' : undefined}>
      <nldd-container padding="16" gap="12">
        <nldd-container gap="6">
          <nldd-title heading-level={3} size={6} overline={`Stap ${index + 1}`} text={step.title}></nldd-title>
          <nldd-container layout="wrap" gap="6" vertical-alignment="center">
            <StepBadge index={index} status={status} composing={compose && composing} />
            {techniqueName && <nldd-tag size="sm" color="lintblauw" text={techniqueName}></nldd-tag>}
            {compose && composing && (
              <nldd-container layout="row" gap="4" vertical-alignment="center">
                <nldd-activity-indicator size="16" timing="instant"></nldd-activity-indicator>
                <nldd-text size="xs" color="accent">Prompt samenstellen…</nldd-text>
              </nldd-container>
            )}
          </nldd-container>
        </nldd-container>

        {children}

        {/* Inklapbaar: het verzamelde materiaal van een afgeronde stap. */}
        {outcome?.material && (
          <nldd-container gap="8">
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-button
                appearance="neutral-transparent"
                size="sm"
                start-icon={open ? 'chevron-down' : 'chevron-right'}
                text={`${open ? 'Verberg' : 'Bekijk'} ${outcomeLabel(outcome).toLowerCase()}`}
                expanded={open || undefined}
                onClick={() => setOpen((v) => !v)}
              ></nldd-button>
              {onRegenerate && (
                <nldd-tooltip text="Doorloop deze stap opnieuw (latere stappen worden ook opnieuw gedaan)">
                  <nldd-button
                    appearance="neutral-transparent"
                    size="sm"
                    start-icon="arrow-clockwise"
                    text="Opnieuw"
                    onClick={onRegenerate}
                  ></nldd-button>
                </nldd-tooltip>
              )}
            </nldd-container>
            {open && (
              <nldd-box>
                <nldd-container padding="12">
                  <RichText text={outcome.material} />
                </nldd-container>
              </nldd-box>
            )}
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
  );
}

/** De status van een stap als badge: het woord draagt de betekenis, de kleur helpt scannen. */
function StepBadge({ status, composing }: { index: number; status: StepStatus; composing: boolean }) {
  if (status === 'done') return <nldd-badge size="sm" color="success" icon="check-mark" text="Klaar"></nldd-badge>;
  if (status === 'error') return <nldd-badge size="sm" color="critical" icon="exclamation-triangle" text="Mislukt"></nldd-badge>;
  if (status === 'active') return <nldd-badge size="sm" color="accent" text={composing ? 'Bezig' : 'Nu aan de beurt'}></nldd-badge>;
  return <nldd-badge size="sm" color="neutral" text="Nog te doen"></nldd-badge>;
}

/** A multi-line nldd field bound to React state; it binds its own listener when it mounts. */
function TextArea({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<'nldd-multi-line-text-field'>, 'ref'> & { value: string; onValue: (v: string) => void }) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return <nldd-multi-line-text-field ref={ref} {...rest}></nldd-multi-line-text-field>;
}

/** The inline name field of a plan step: Enter or leaving the field saves, Escape cancels. */
function TitleField({
  value,
  onValue,
  label,
  onCommit,
  onCancel,
}: {
  value: string;
  onValue: (v: string) => void;
  label: string;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <nldd-text-field
      ref={ref}
      accessible-label={label}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          onCancel();
        }
      }}
    ></nldd-text-field>
  );
}
