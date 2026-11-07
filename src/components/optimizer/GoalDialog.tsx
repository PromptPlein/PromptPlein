import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectContextSlot } from '@/components/optimizer/ProjectContextPicker';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Eraser,
  Lightbulb,
  MessageCircleQuestion,
  RotateCw,
  Sparkles,
  Wand2,
} from '@/components/common/icons';
import StepHeading from '@/components/optimizer/StepHeading';
import AanpakKaart, { type AanpakOptie } from '@/components/optimizer/AanpakKaart';
import MakeProgress from '@/components/optimizer/MakeProgress';
import { compactFieldLabel } from '@/lib/fieldLabel';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  generatePrompt,
  inventTestAnswer,
  prefillFields,
  recommendFramework,
  runClarifyTurn,
  type PrefillPhase,
} from '@/services/optimizeService';
import { isContextPrompt, isSjabloon } from '@/lib/techniques';
import { activityIdentifier, stripMarkdown } from '@/lib/utils';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import { logBehavior, newBehaviorSession, type BehaviorSession } from '@/services/behaviorService';
import { useAuth } from '@/context/AuthContext';
import HoverPreview from '@/components/common/HoverPreview';
import { GOAL_EXAMPLES, categoryOf } from '@/data/goalExamples';
import { overheidsContext, type AiSettings } from '@/services/settingsService';
import OptimizingLoader from './OptimizingLoader';
import PrefillLoader from './PrefillLoader';
import GuardrailDialog from './GuardrailDialog';
import VerantwoordGebruikHint from './VerantwoordGebruikHint';
import PrefillSources from './PrefillSources';
import BriefSummary from './BriefSummary';
import { InterviewPanel } from './InterviewPanel';
import FollowUpQuestions, { type FieldMeta } from './FollowUpQuestions';
import type { StreamStatus } from '@/lib/ndjsonStream';
import type {
  OptimizeResult,
  PrefilledField,
  PrefillResult,
  PromptDialogue,
  Technique,
  TechniqueRecommendation,
  TranscriptTurn,
} from '@/types';

/** localStorage-sleutel voor een lopend gesprek (hervatten na herladen). */
const RUN_STORAGE_KEY = 'opl.goalDialog';

// De voorbeelddoelen staan in data/goalExamples.ts: dezelfde lijst voedt de
// losse techniek-aanbeveling, zodat je overal dezelfde voorbeelden ziet.

/** De naar localStorage geschreven snapshot van een lopend gesprek. */
interface PersistedRun {
  goal: string;
  transcript: TranscriptTurn[];
}

function loadRun(): PersistedRun | null {
  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRun;
    if (parsed && typeof parsed.goal === 'string' && Array.isArray(parsed.transcript)) {
      // Een gesprek zonder beantwoorde vragen valt niets aan te hervatten.
      if (parsed.goal.trim() && parsed.transcript.length > 0) return parsed;
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

/** Zet het gesprek om in één gelabeld tekstblok voor de generator. */
function serializeTranscript(turns: TranscriptTurn[]): string {
  return turns.map((t, i) => `Vraag ${i + 1}: ${t.question}\nAntwoord: ${t.answer}`).join('\n\n');
}

interface GoalDialogProps {
  /** Admin-bepaalde AI-instellingen (provider, systeemprompt, toon, temperatuur). */
  settings: AiSettings;
  /** Het uiteindelijke resultaat + het framework waarin het is opgebouwd. */
  onResult: (result: OptimizeResult, technique: Technique) => void;
  /** De instap-tabs; vallen bovenin het omrande generator-blok. */
  header?: ReactNode;
  /** De knoppen Denken en Internet, naast de actieknop. */
  toggles?: ReactNode;
  /**
   * Context van het aangehaakte chatproject (de projectinstructie van de
   * gebruiker, eventueel met zijn bronbestanden). Gaat mee in élke AI-stap van
   * deze dialoog. Vooral de vragenronde profiteert: zonder deze context vraagt
   * de AI naar achtergrond die in het project allang beschreven staat.
   */
  projectContext?: string;
  /** De knop "Context" met zijn labels, boven het tekstvak. */
  renderProjectContext?: (slot: ProjectContextSlot) => ReactNode;
  /**
   * Denken aan: het model redeneert eerst en schrijft de prompt daarna pas.
   * Komt van de knop boven de bouwer; geldt alleen voor de laatste stap, het
   * schrijven zelf. De analyse- en voor-invulstappen leveren JSON en kunnen er
   * dus niet mee overweg.
   */
  thinking?: boolean;
  /**
   * Eerst op internet zoeken bij het schrijven van de prompt. Alleen voor
   * beheerders; de knop staat boven de bouwer, naast "Denken".
   */
  webSearch?: boolean;
}

/**
 * Fase van de doel-flow:
 *  - goal      → beschrijf in eigen woorden wat je wilt bereiken
 *  - dialogue  → de AI denkt stap voor stap mee en stelt vraag na vraag tot het
 *                vraagstuk compleet is; de laatste vragen gaan over gebruik en
 *                vorm, want daarop rust de frameworkkeuze
 *  - framework → de AI analyseert de opdrachtbeschrijving en stelt het best
 *                passende framework voor; de gebruiker kiest
 *  - fields    → de velden van dat framework worden voor-ingevuld uit het
 *                gesprek; de gebruiker controleert en past aan
 *  - composing → de prompt wordt in dat framework opgebouwd
 *  - done      → de prompt staat onder het blok; hier alleen nog opnieuw beginnen
 *  - error     → een beurt mislukte; retry mogelijk (het gesprek blijft staan)
 */
type Phase = 'goal' | 'dialogue' | 'framework' | 'fields' | 'composing' | 'done' | 'error';

/**
 * De doel-flow: "Bouw een prompt rond je doel". De gebruiker beschrijft in eigen
 * woorden wat die wil bereiken en gaat daarna direct het gesprek in — de AI
 * redeneert stap voor stap mee en stelt één vraag per keer, tot het beeld
 * compleet is. Er wordt bewust géén plan vooraf getoond en geen techniek bij naam
 * genoemd: de gebruiker praat over zijn vraagstuk, niet over prompt-methodes.
 *
 * Pas ná het gesprek volgt de analyse: uit de opdrachtbeschrijving én de
 * antwoorden over gebruik (chat, zelfstandige assistent of programma) en vorm
 * (tekst, code, beeld, …) bepaalt de AI welk framework past. De gebruiker kiest
 * daaruit — of pakt zelf een ander framework — en dán pas wordt de prompt gebouwd.
 */
export default function GoalDialog({
  settings,
  onResult,
  header,
  toggles,
  projectContext,
  renderProjectContext,
  thinking,
  webSearch,
}: GoalDialogProps) {
  const { techniques, techniqueById } = useReferenceData();
  const { profile, user, isAdmin } = useAuth();

  // Gedragslog-sessie voor deze run + een korte log-helper (fire-and-forget).
  const sessionRef = useRef<BehaviorSession>(newBehaviorSession());
  function log(
    action: Parameters<typeof logBehavior>[0]['action'],
    extra?: { techniqueId?: string | null; metadata?: Record<string, unknown> },
  ) {
    logBehavior({
      session: sessionRef.current,
      identifier: activityIdentifier(profile, user?.email),
      action,
      techniqueId: extra?.techniqueId ?? null,
      metadata: extra?.metadata,
    });
  }

  // Deelt de 'goal'-draftsleutel met de pagina, zodat de "Opschonen"-knop en de
  // titel-fallback van het resultaat blijven werken.
  const [goal, setGoal, clearGoal] = usePersistentDraft('goal');
  // Het doel als ref: `resumeRun` zet het doel én start meteen de volgende beurt;
  // de state-update is dan nog niet zichtbaar in deze closure.
  const goalRef = useRef(goal);
  goalRef.current = goal;

  const [phase, setPhase] = useState<Phase>('goal');
  // De prompt zoals de AI hem op dit moment schrijft (live meelezen).
  const [streamText, setStreamText] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  const [guardrailFindings, setGuardrailFindings] = useState<GuardrailFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Het gesprek: gestelde vraag, het transcript en het antwoordveld.
  const [question, setQuestion] = useState<string | null>(null);
  // De stap uit de vraaglijn waar de openstaande vraag bij hoort; voedt de
  // voortgangsbalk boven het gesprek.
  const [step, setStep] = useState<string | null>(null);
  // Beheerder laat een testantwoord verzinnen (zie handleInventAnswer).
  const [inventing, setInventing] = useState(false);
  // De techniek die de AI nu volgt + waarom, zoals getoond boven de vraag. Blijft
  // staan als een beurt die meta-regels niet meestuurt; hij wordt alleen
  // overschreven door een nieuwe analyse.
  // Als ref erbij: `turn()` draait door in dezelfde tick waarin de analyse wordt
  // gezet, en leest de state-waarde dan nog niet.
  const analysisRef = useRef<{ technique?: string; text?: string } | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  // Het gesprek is klaar; de opdrachtbeschrijving wordt nog opgesteld.
  const [finishing, setFinishing] = useState(false);
  // De uitgeschreven opdrachtbeschrijving (het resultaat van het gesprek).
  const [brief, setBrief] = useState<string | null>(null);

  // Frameworkkeuze: de aanbevelingen, of we ze nog ophalen, en het bouwen zelf.
  const [frameworkFits, setFrameworkFits] = useState<TechniqueRecommendation[]>([]);

  // Het gekozen framework en zijn voor-ingevulde velden. Dezelfde stap als in
  // "optimaliseer je eigen prompt": de AI verdeelt de opbrengst van het gesprek
  // over de velden van het raamwerk, waarna de gebruiker ze nog kan bijstellen.
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<PrefillResult | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  // Live voortgang van het voor-invullen (welk model, fase, binnengekomen
  // velden), zodat het laadscherm laat zien wát er gebeurt.
  const [prefillProgress, setPrefillProgress] = useState<{
    models: string[];
    winner: string | null;
    phase: PrefillPhase;
    fields: PrefilledField[];
    /** Gevonden bronnen en zoekvragen (zoeken aan); undefined = nog niet gezocht. */
    sources?: { title: string; url: string }[];
    queries?: string[];
  }>({ models: [], winner: null, phase: 'reading', fields: [] });
  // Dezelfde voortgang, maar dan voor het bouwen van de prompt zelf.
  const [composeProgress, setComposeProgress] = useState<StreamStatus>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>({});

  // Een bij het laden gevonden, niet-afgemaakt gesprek — aangeboden om te hervatten.
  const [resumable, setResumable] = useState<PersistedRun | null>(null);

  // Het laadscherm tijdens het bouwen van de prompt; wordt in beeld gescrold
  // zodra "Bouw mijn prompt" is geklikt.
  const composingRef = useRef<HTMLDivElement>(null);
  // Het velden-blok; komt in beeld zodra er een framework is gekozen.
  const fieldsRef = useRef<HTMLDivElement>(null);

  const inputDisabled = phase !== 'goal';

  // Bij binnenkomst: staat er nog een niet-afgemaakt gesprek klaar?
  useEffect(() => {
    const run = loadRun();
    if (run) setResumable(run);
    // Alleen bij mount uitvoeren.
     
  }, []);

  // Scroll het laadscherm in beeld zodra het bouwen begint. De rAF wacht tot het
  // blok gerenderd is; anders scrollen we naar een plek die er nog niet staat.
  useEffect(() => {
    if (phase !== 'composing') return;
    const id = requestAnimationFrame(() => {
      composingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // Bewaar het lopende gesprek, zodat een herlaadactie de antwoorden niet wist.
  useEffect(() => {
    if (phase === 'dialogue' && transcript.length > 0) {
      saveRun({ goal, transcript });
    }
  }, [phase, goal, transcript]);

  /** Kopieer een voorbeelddoel naar het klembord. */
  async function copyExample(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Voorbeeld gekopieerd.');
    } catch {
      toast.error('Kopiëren mislukt.');
    }
  }

  /** Wis doel + gesprek en begin schoon. */
  function handleClear() {
    if (transcript.length > 0 && phase !== 'goal') {
      log('cleared', { metadata: { phase, answered: transcript.length } });
    }
    clearGoal();
    clearRunDraft();
    setResumable(null);
    setPhase('goal');
    setQuestion(null);
    setStep(null);
    analysisRef.current = null;
    setTranscript([]);
    setAnswer('');
    setBrief(null);
    setFrameworkFits([]);
    resetFields();
    setError(null);
    setUnclearReason(null);
    setShowExamples(false);
    setGuardrailFindings(null);
  }

  /** Wis het gekozen framework en zijn voor-ingevulde velden. */
  function resetFields() {
    setFrameworkId(null);
    setPrefill(null);
    setPrefilling(false);
    setAnswers({});
    setFieldMeta({});
  }

  /** Verwerp het bewaarde gesprek en begin schoon. */
  function discardRun() {
    clearRunDraft();
    setResumable(null);
  }

  /** Hervat het bewaarde gesprek: haal de volgende vraag op bij het transcript. */
  function resumeRun() {
    if (!resumable) return;
    const { goal: g, transcript: turns } = resumable;
    setGoal(g);
    goalRef.current = g; // de beurt hieronder heeft het doel meteen nodig
    setTranscript(turns);
    setResumable(null);
    setError(null);
    setUnclearReason(null);
    sessionRef.current = newBehaviorSession();
    log('session_started', { metadata: { resumed: true, answered: turns.length } });
    void turn(turns, false);
  }

  /** Start het gesprek; guardrail-check op de doelbeschrijving eerst. */
  function handleStart() {
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
    startDialogue();
  }

  /** Guardrail bevestigd (of niet nodig) → begin met de eerste vraag. */
  function startDialogue() {
    setGuardrailFindings(null);
    setUnclearReason(null);
    setError(null);
    setTranscript([]);
    setQuestion(null);
    setStep(null);
    analysisRef.current = null;
    setAnswer('');
    setBrief(null);
    clearRunDraft();
    setResumable(null);
    sessionRef.current = newBehaviorSession();
    log('session_started', { metadata: { goal_len: goal.trim().length } });
    void turn([], false);
  }

  /**
   * Eén beurt in het gesprek. `forceFinish` = de gebruiker wil geen vragen meer
   * beantwoorden; de AI rondt dan af met wat er ligt.
   */
  async function turn(turns: TranscriptTurn[], forceFinish: boolean) {
    setPhase('dialogue');
    setBusy(true);
    setFinishing(forceFinish);
    setError(null);
    try {
      const res = await runClarifyTurn({
        goal: goalRef.current.trim(),
        transcript: turns,
        forceFinish,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
        // Alleen de losse technieken: hieruit kiest het gesprek de techniek
        // waarvan het de bouwstenen uitvraagt. Frameworks komen pas ná de
        // opdrachtbeschrijving aan bod.
        techniques: techniques.filter((t) => !isContextPrompt(t)),
      });
      if (res.unclear) {
        // De beschrijving is onbruikbaar: terug naar het doelveld met uitleg.
        setUnclearReason(res.reason?.trim() || 'Je beschrijving is nog niet duidelijk genoeg.');
        log('unclear_rejected', { metadata: { phase: 'clarify' } });
        setPhase('goal');
        return;
      }
      if (res.needs_input && res.question) {
        setQuestion(res.question);
        if (res.step) setStep(res.step);
        setAnswer('');
        log('interview_question', { metadata: { turn: turns.length + 1 } });
        return;
      }
      if (res.done && res.brief) {
        setQuestion(null);
        setBrief(res.brief);
        // Pas hier is de techniek bekend: hij volgt uit het complete beeld, niet
        // uit de eerste zin. Hij verschijnt in de samenvatting, niet bij de vragen.
        if (res.technique || res.analysis) {
          const next = { technique: res.technique, text: res.analysis };
          analysisRef.current = next;
        }
        clearRunDraft();
        log('interview_finished', { metadata: { turns: turns.length, forced: forceFinish } });
        void offerFramework(res.brief, turns);
        return;
      }
      setError(res.error ?? 'De volgende vraag kon niet worden opgehaald.');
      setPhase('error');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Het gesprek is mislukt.');
      setPhase('error');
    } finally {
      setBusy(false);
      setFinishing(false);
    }
  }

  /**
   * Beheerdershulp: laat de AI een geloofwaardig antwoord op de openstaande vraag
   * verzinnen en zet dat in het antwoordveld. Bedoeld om de vragenronde te kunnen
   * testen zonder elke vraag zelf te beantwoorden; de beheerder ziet het antwoord
   * staan en verstuurt het zelf, net als een getypt antwoord.
   */
  async function handleInventAnswer() {
    if (!question || inventing) return;
    setInventing(true);
    try {
      const invented = await inventTestAnswer({
        goal: goalRef.current.trim(),
        question,
        transcript,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
      });
      if (!invented) {
        toast.error('Er kon geen testantwoord worden verzonnen.');
        return;
      }
      setAnswer(stripMarkdown(invented));
    } finally {
      setInventing(false);
    }
  }

  /** De gebruiker beantwoordt de huidige vraag; guardrail-check eerst. */
  function submitAnswer() {
    if (!question) return;
    const a = answer.trim();
    if (!a) {
      toast.error('Vul eerst een antwoord in, of rond het gesprek af.');
      return;
    }
    const findings: GuardrailFinding[] = [
      ...(settings.pii.enabled ? detectPii(a) : []),
      ...detectBlockedTopics(a, settings.blockedTopics),
    ];
    if (findings.length > 0) {
      setGuardrailFindings(findings);
      return;
    }
    commitAnswer(a);
  }

  /** Verwerk het antwoord en vraag de volgende beurt op. */
  function commitAnswer(a: string) {
    if (!question) return;
    const turns = [...transcript, { question, answer: a }];
    setTranscript(turns);
    setQuestion(null);
    log('interview_answer', { metadata: { turn: turns.length, answer_len: a.length } });
    void turn(turns, false);
  }

  /** "Ik heb genoeg gedeeld": rond het gesprek af met wat er ligt. */
  function finishDialogue() {
    setQuestion(null);
    void turn(transcript, true);
  }

  /**
   * Na het gesprek: de AI bepaalt op basis van de opdrachtbeschrijving welk
   * framework het best past en vult het meteen in. De gebruiker kiest hier niets;
   * de alternatieven blijven achter "Andere aanpak". Mislukt de analyse, dan gaan
   * we door met het eerste framework: het gesprek is te veel werk om te laten vallen.
   */
  async function offerFramework(briefText: string, turns: TranscriptTurn[]) {
    // Sjablonen niet: die kies je zelf bij "Wat wil je maken?", een gesprek weegt ze niet.
    const frameworks = techniques.filter((tq) => isContextPrompt(tq) && !isSjabloon(tq));
    if (frameworks.length === 0) {
      setError('Er zijn geen frameworks beschikbaar om je prompt in op te bouwen.');
      setPhase('error');
      return;
    }
    setPhase('framework');
    setFrameworkFits([]);
    log('framework_fit_run', {
      metadata: { candidates: frameworks.length, answered: turns.length },
    });
    let keuze = frameworks[0].id;
    try {
      const fit = await recommendFramework({
        // De opdrachtbeschrijving is de basis; het gesprek gaat mee als
        // onderbouwing, zodat de keuze op de echte antwoorden rust.
        ownPrompt: `${briefText}\n\nGESPREK:\n${serializeTranscript(turns)}`,
        frameworks,
        fromDialogue: true,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
      });
      setFrameworkFits(fit.recommendations);
      keuze = fit.recommendations[0]?.id ?? keuze;
    } catch {
      setFrameworkFits([]);
    }
    void chooseFramework(keuze, briefText);
  }

  /**
   * Het framework staat vast (de keuze van de AI, of "Andere aanpak"). Nog niet
   * meteen bouwen: eerst de velden van dat raamwerk voor-invullen uit het gesprek,
   * precies zoals de eigen-prompt-flow dat doet. Zo ziet de gebruiker wat er in elk
   * veld terechtkomt en kan die het bijstellen vóórdat de prompt ontstaat.
   *
   * De opdrachtbeschrijving én het gesprek gaan als bron mee: het gesprek bevat
   * de details, de beschrijving de rode draad.
   */
  async function chooseFramework(id: string, briefText: string | null = brief) {
    const framework = techniqueById(id);
    if (!framework || !briefText) return;
    resetFields();
    setFrameworkId(id);
    setPhase('fields');
    setError(null);
    setPrefilling(true);
    setPrefillProgress({
      models: [],
      winner: null,
      phase: webSearch ? 'searching' : 'reading',
      fields: [],
    });
    log('framework_prefilled', {
      techniqueId: id,
      metadata: { fields: framework.follow_up_questions.length, answered: transcript.length },
    });
    requestAnimationFrame(() => {
      fieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    try {
      const res = await prefillFields({
        // Alleen de opdrachtbeschrijving: die vat het gesprek al samen. Het ruwe
        // transcript er nog eens bij duwde het model over zijn uitvoerlimiet,
        // waardoor de laatste velden leeg bleven.
        ownPrompt: briefText,
        technique: framework,
        thinking,
        webSearch,
        onSources: (sources, queries) => setPrefillProgress((p) => ({ ...p, sources, queries })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
        onStatus: (status) =>
          setPrefillProgress((p) => ({
            ...p,
            ...(status.models ? { models: status.models } : {}),
            ...(status.phase ? { phase: status.phase as PrefillPhase } : {}),
            ...(status.provider ? { winner: status.provider } : {}),
          })),
        onField: (field) =>
          setPrefillProgress((p) =>
            p.fields.some((f) => f.id === field.id) ? p : { ...p, fields: [...p.fields, field] },
          ),
      });
      // Onduidelijk is hier vrijwel uitgesloten — de tekst komt uit ons eigen
      // gesprek. Gebeurt het toch, dan blijven de velden leeg en kan de
      // gebruiker ze zelf invullen; de flow loopt niet vast.
      if (res.unclear) {
        setPrefill({ summary: '', fields: [], success: true, provider: res.provider });
        return;
      }
      setPrefill(res);
      setAnswers(Object.fromEntries(res.fields.map((f) => [f.id, f.value])));
      setFieldMeta(
        Object.fromEntries(res.fields.map((f) => [f.id, { source: f.source, note: f.note }])),
      );
      if (res.error) toast(res.error, { icon: 'ℹ️' });
    } catch {
      // Voor-invullen is een hulpmiddel, geen voorwaarde: bij een fout tonen we
      // gewoon de lege velden zodat de gebruiker verder kan.
      setPrefill({ summary: '', fields: [], success: false, provider: 'local-template' });
      toast('De velden konden niet worden voor-ingevuld; vul ze zelf aan.', { icon: 'ℹ️' });
    } finally {
      setPrefilling(false);
    }
  }

  /**
   * Bouw de prompt in het gekozen framework. De (voor-ingevulde en door de
   * gebruiker bijgestelde) velden zijn nu de hoofdinvoer; de opdrachtbeschrijving
   * gaat als rode draad mee. Het gesprek is al ÍN de tool gevoerd, dus het
   * resultaat is een direct bruikbare prompt en geen prompt die de dialoog nog
   * moet aanzwengelen.
   */
  async function compose(frameworkId: string) {
    const framework = techniqueById(frameworkId);
    if (!framework || !brief) return;
    setPhase('composing');
    setError(null);
    setStreamText(''); // meegelezen tekst van een vorige poging wissen
    setComposeProgress({}); // en de voortgang van die poging ook
    // Zit de opbrengst van het gesprek al in de velden, dan hoeft het ruwe
    // transcript er niet nog eens bij: dat levert dubbele invoer op en maakt de
    // generatie alleen maar trager. Bleven de velden leeg (voor-invullen
    // mislukt), dan is het transcript juist de enige inhoud die we hebben.
    const fieldsFilled = Object.values(answers).some((v) => v.trim());
    log('compose_run', {
      techniqueId: frameworkId,
      metadata: { answered: transcript.length, prefilled_fields: fieldsFilled },
    });
    try {
      const res = await generatePrompt({
        technique: framework,
        promptContent: goalRef.current.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: answers,
        extraAnsweredFields: [
          { id: 'opdracht', label: 'Opdrachtbeschrijving uit het gesprek', answer: brief },
          ...(!fieldsFilled && transcript.length > 0
            ? [
                {
                  id: 'gesprek',
                  label: 'Vragen en antwoorden uit het gesprek',
                  answer: serializeTranscript(transcript),
                },
              ]
            : []),
        ],
        interviewResolved: true,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
        thinking,
        webSearch,
        webSearchInstruction: settings.webSearchInstruction.trim() || undefined,
        systemPrompt: settings.systemPrompt.trim() || undefined,
        toneInstruction: settings.toneInstruction.trim() || undefined,
        ...overheidsContext(settings),
        temperature: settings.temperature,
        // Meelezen terwijl de prompt wordt geschreven.
        onChunk: setStreamText,
        // Welk model de prompt schrijft.
        onStatus: (status) => setComposeProgress((p) => ({ ...p, ...status })),
      });
      if (res.unclear || !res.optimized_content?.trim()) {
        setUnclearReason(
          res.reason?.trim() ||
            'De verzamelde informatie is niet duidelijk genoeg om er een prompt van te maken.',
        );
        setError('De prompt kon niet worden gebouwd.');
        log('unclear_rejected', { metadata: { phase: 'compose' } });
        setPhase('error');
        return;
      }
      const fit = frameworkFits.find((f) => f.id === frameworkId);
      const dialogue: PromptDialogue = {
        goal: goalRef.current.trim(),
        transcript,
        brief,
        frameworkName: framework.name,
        frameworkReason: (fit?.value ?? fit?.reason ?? '').trim() || undefined,
      };
      log('framework_packaged', { techniqueId: frameworkId });
      clearRunDraft();
      // De prompt verschijnt in de resultaatsectie onder dit blok; hier blijft
      // alleen een korte bevestiging staan (anders zou het laadscherm blijven hangen).
      setPhase('done');
      onResult({ ...res, dialogue }, framework);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'De prompt kon niet worden gebouwd.');
      log('step_error', { metadata: { where: 'compose' } });
      setPhase('error');
    }
  }

  /** Herprobeer de mislukte beurt; het gesprek tot nu toe blijft staan. */
  function retry() {
    setError(null);
    setUnclearReason(null);
    // Stonden de velden al klaar? Dan alleen het bouwen opnieuw proberen — de
    // aanpassingen van de gebruiker gaan zo niet verloren.
    if (frameworkId && prefill) {
      void compose(frameworkId);
      return;
    }
    if (brief) {
      void offerFramework(brief, transcript);
      return;
    }
    void turn(transcript, false);
  }

  const showConversation = phase !== 'goal';
  // Na het gesprek klapt het invulvlak in: de keuze van de AI en de velden gaan voor.
  const afterDialogue =
    phase === 'framework' || phase === 'fields' || phase === 'composing' || phase === 'done';
  const chosenFit = frameworkFits.find((f) => f.id === frameworkId);
  // Andere aanpak: de alternatieven die de AI al gaf, dus geen extra aanroep.
  const aanpakOpties: AanpakOptie[] = frameworkFits
    .filter((f) => f.id !== frameworkId)
    .flatMap((f) => {
      const fw = techniqueById(f.id);
      return fw ? [{ id: fw.id, naam: fw.name, waarom: stripMarkdown(f.reason) }] : [];
    });
  const chosenFramework = frameworkId ? techniqueById(frameworkId) : null;

  return (
    <div className="space-y-4">
      {afterDialogue ? (
        <section
          aria-label="Jouw idee"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-1.5 dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
            <strong className="font-semibold text-slate-900 dark:text-slate-100">Jouw idee: </strong>
            {goal}
          </p>
          <button
            type="button"
            onClick={handleClear}
            disabled={phase === 'framework' || prefilling}
            className="min-h-11 shrink-0 font-semibold text-rijksblauw-500 transition-colors hover:underline disabled:opacity-50 dark:text-rijksblauw-200"
          >
            Opnieuw beginnen
          </button>
        </section>
      ) : (
        <div>
          {header}
          <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:rounded-t-none dark:border-slate-700 dark:bg-slate-800">
            <div>
              <StepHeading
                title="Wat wil je bereiken?"
                htmlFor="goal-dialog-input"
                info="We stellen eerst een paar vragen. Daarna kiest de AI de aanpak en vult de velden voor je in."
              >
                <button
                  type="button"
                  onClick={() => setShowExamples((v) => !v)}
                  aria-expanded={showExamples}
                  aria-controls="goal-dialog-examples"
                  title="Bekijk voorbeelden"
                  className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-sm font-medium text-rijksblauw-500 transition-colors hover:underline dark:text-rijksblauw-200"
                >
                  <Lightbulb size={16} className="text-rijksoranje" />
                  <span>Voorbeelden</span>
                </button>
                {goal.trim() && (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Wis je doel en begin opnieuw"
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-sm font-medium text-slate-700 transition-colors hover:underline dark:text-slate-200"
                  >
                    <Eraser size={15} />
                    <span>Opschonen</span>
                  </button>
                )}
              </StepHeading>

              {showExamples && (
                <div
                  id="goal-dialog-examples"
                  className="animate-fade-in mb-3 space-y-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Zo omschrijf je een doel. Achter elk voorbeeld zit de prompttechniek waar zo’n
                    omschrijving op uitkomt. Klik om er één in te vullen.
                  </p>
                  {/* Zelfde kaartsjabloon als de voorbeeldprompts bij "Jouw eigen
                      prompt": techniek, titel, één regel toelichting, en rechts
                      kopiëren of gebruiken. De doelomschrijving zelf staat er niet
                      onder — die zou de lijst onleesbaar lang maken; hij komt in
                      het veld zodra je op "Gebruik" klikt. */}
                  <div className="opl-scroll-slim max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                    {GOAL_EXAMPLES.map((ex) => {
              const CategoryIcon = categoryOf(ex).icon;
              return (
                      <HoverPreview key={ex.title} label="Doelomschrijving" text={ex.goal}>
                      <div className="group rounded-lg border border-slate-200 bg-white p-2.5 transition-colors hover:border-rijksblauw-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rijksblauw-500/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rijksblauw-600 dark:text-rijksblauw-300">
                              <CategoryIcon size={12} className="shrink-0" />
                              {categoryOf(ex).label}
                            </span>
                            <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {ex.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {ex.subtitle}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => void copyExample(ex.goal)}
                              title="Kopieer voorbeeld"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300"
                            >
                              <ClipboardCopy size={13} /> Kopieer
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGoal(ex.goal);
                                setShowExamples(false);
                                toast.success('Voorbeeld ingevuld.');
                              }}
                              title="Gebruik dit voorbeeld in het invoerveld"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-rijksblauw-600 transition-colors hover:bg-rijksblauw-50 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/15"
                            >
                              <Wand2 size={13} /> Gebruik
                            </button>
                          </div>
                        </div>
                      </div>
                      </HoverPreview>
                    );
                    })}
                  </div>
                </div>
              )}

              {renderProjectContext?.({
                text: goal,
                stripMention: () => setGoal(goal.replace(/@$/, '')),
                className: 'mb-2',
              })}

              <textarea
                id="goal-dialog-input"
                className="opl-input min-h-[120px] resize-y"
                value={goal}
                disabled={inputDisabled}
                placeholder="Bijv. er moet een projectplan geschreven worden voor de invoering van een nieuwe interne tool"
                onChange={(e) => setGoal(e.target.value)}
              />
              <VerantwoordGebruikHint text={goal} />

              {/* Hervat-melding: er staat nog een niet-afgemaakt gesprek klaar. */}
              {resumable && phase === 'goal' && (
                <div className="animate-fade-in mt-3 flex flex-col gap-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
                  <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                    <RotateCw size={16} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                    <span>
                      Je hebt nog een lopend gesprek met {resumable.transcript.length} beantwoorde
                      vragen. Verder waar je gebleven was?
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

            {phase === 'goal' && (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {toggles}
                <button
                  type="button"
                  className="opl-btn-primary min-h-12 px-5 text-base"
                  onClick={handleStart}
                  disabled={!goal.trim()}
                >
                  <MessageCircleQuestion size={20} className="text-rijksoranje-vast" /> Start het
                  gesprek
                </button>
              </div>
            )}
          </section>
        </div>
      )}

        {/* Het gesprek, de keuze van de AI of het bouwen. */}
        {showConversation && (
          <div className="space-y-4">
            {/* Wat we uit het gesprek haalden, om na te lezen en te bewaren. */}
            {brief && phase !== 'dialogue' && <BriefSummary brief={brief} goal={goal} />}

            {phase === 'error' ? (
              <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200">
                <span>{stripMarkdown(error ?? 'Het gesprek is mislukt.')}</span>
                <button type="button" className="opl-btn-secondary shrink-0" onClick={retry}>
                  Opnieuw proberen
                </button>
              </div>
            ) : phase === 'composing' ? (
              <div ref={composingRef} className="scroll-mt-24">
                <OptimizingLoader
                  techniqueName="je prompt"
                  streamText={streamText}
                  models={composeProgress.models}
                  winner={composeProgress.provider}
                  phase={composeProgress.phase}
                />
              </div>
            ) : phase === 'done' ? (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <span className="flex items-start gap-2 text-emerald-800 dark:text-emerald-200">
                  <Check size={16} className="mt-0.5 shrink-0" />
                  Je prompt is klaar en staat hieronder.
                </span>
                <button type="button" className="opl-btn-secondary shrink-0" onClick={handleClear}>
                  Begin opnieuw
                </button>
              </div>
            ) : phase === 'fields' ? (
              <div ref={fieldsRef} className="scroll-mt-24 space-y-4">
                {prefilling ? (
                  <>
                  <MakeProgress
                    stage="invullen"
                    bron="Het gesprek"
                    aanpak={chosenFramework?.name}
                  />
                  /* De AI verdeelt de opbrengst van het gesprek over de velden;
                     die lopen één voor één vol terwijl de modellen werken. */
                  <PrefillLoader
                    plain
                    techniqueName={chosenFramework?.name}
                    source="wat je in het gesprek hebt verteld"
                    fields={chosenFramework?.follow_up_questions.map((q) => ({
                      id: q.id,
                      label: compactFieldLabel(q.label).name,
                    }))}
                    filled={prefillProgress.fields}
                    models={prefillProgress.models}
                    winner={prefillProgress.winner}
                    phase={prefillProgress.phase}
                    thinking={thinking}
                    webSearch={webSearch}
                    sources={prefillProgress.sources}
                    queries={prefillProgress.queries}
                  />
                  </>
                ) : chosenFramework ? (
                  <div className="animate-fade-in space-y-4">
                    <AanpakKaart
                      technique={chosenFramework}
                      reden={stripMarkdown(chosenFit?.value || chosenFit?.reason || '')}
                      opties={aanpakOpties}
                      onKies={(id) => void chooseFramework(id)}
                      disabled={prefilling}
                    />
                    <div>
                      {/* Kwam er niets terug (AI-dienst druk of niet bereikbaar), dan
                          zeggen we dat in plaats van te melden dat alles is ingevuld
                          terwijl het formulier leeg is. */}
                      {prefill && prefill.fields.length === 0 ? (
                        <div
                          role="alert"
                          className="mt-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
                        >
                          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium">Voor-invullen is niet gelukt</p>
                            <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">
                              De AI-dienst was even niet bereikbaar. Probeer het opnieuw, of vul de
                              velden hieronder zelf in.
                            </p>
                            <button
                              type="button"
                              className="opl-btn-secondary mt-2"
                              onClick={() => void chooseFramework(chosenFramework.id)}
                              disabled={prefilling}
                            >
                              <RotateCw size={16} /> Opnieuw proberen
                            </button>
                          </div>
                        </div>
                      ) : (
                        prefill && <PrefillSources prefill={prefill} />
                      )}
                    </div>

                    <section className="opl-card p-5">
                      <FollowUpQuestions
                        projectContext={projectContext}
                        technique={chosenFramework}
                        answers={answers}
                        onChange={setAnswers}
                        fieldMeta={fieldMeta}
                        preferredProvider={settings.provider}
                        preferredModel={settings.model}
                        // Zelf aangepast veld = geen AI-suggestie meer; het label vervalt.
                        onUserEdit={(id) =>
                          setFieldMeta((prev) => {
                            if (!prev[id]) return prev;
                            const next = { ...prev };
                            delete next[id];
                            return next;
                          })
                        }
                        onFinish={() => void compose(chosenFramework.id)}
                        finishLabel="Bouw prompt"
                        heading={<StepHeading title="Kijk na en vul aan" />}
                        showLetters={false}
                        askIfEmpty={Boolean(prefill && prefill.fields.length > 0)}
                      />
                    </section>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {toggles}
                      <button
                        type="button"
                        className="opl-btn-primary min-h-12 px-6 text-base"
                        onClick={() => void compose(chosenFramework.id)}
                      >
                        <Sparkles size={20} className="text-rijksoranje-vast" /> Bouw prompt
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : phase === 'framework' ? (
              <MakeProgress stage="kiezen" bron="Het gesprek" />
            ) : (
              <section className="opl-card p-5">
              <InterviewPanel
                socratic={false}
                step={step}
                onInventAnswer={isAdmin ? handleInventAnswer : undefined}
                inventing={inventing}
                intro="We stellen één vraag per keer: eerst wat je wilt bereiken, daarna de bouwstenen van de techniek die daarbij past."
                question={question}
                transcript={transcript}
                answer={answer}
                busy={busy}
                finishing={finishing}
                onAnswerChange={setAnswer}
                onSubmit={submitAnswer}
                onFinish={finishDialogue}
              />
              </section>
            )}
          </div>
        )}

      {unclearReason && (
        <div
          role="alert"
          className="animate-fade-in flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
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
          // Route naar de juiste actie: een antwoord in het gesprek, of de start
          // van het gesprek vanuit het doelveld.
          onConfirm={() => {
            setGuardrailFindings(null);
            if (question) commitAnswer(answer.trim());
            else startDialogue();
          }}
          onCancel={() => setGuardrailFindings(null)}
        />
      )}
    </div>
  );
}

