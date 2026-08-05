import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Compass,
  Eraser,
  HelpCircle,
  Info,
  Layers,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt, localFrameworkGuess } from '@/lib/techniques';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { stripMarkdown } from '@/lib/utils';
import {
  explainFrameworkFit,
  generatePrompt,
  prefillFields,
  recommendFramework,
  type FrameworkSearchPhase,
  type PrefillPhase,
} from '@/services/optimizeService';
import OptimizingLoader from './OptimizingLoader';
import PrefillLoader from './PrefillLoader';
import FollowUpQuestions, { type FieldMeta } from './FollowUpQuestions';
import type { AiSettings } from '@/services/settingsService';
import type { StreamStatus } from '@/lib/ndjsonStream';
import type {
  FrameworkFit,
  OptimizeResult,
  PrefilledField,
  PrefillResult,
  Technique,
  TechniqueRecommendation,
} from '@/types';

interface OwnPromptOptimizerProps {
  /** Admin-bepaalde AI-instellingen (provider, systeemprompt, toon, temperatuur). */
  settings: AiSettings;
  /** Aangeroepen met het geoptimaliseerde resultaat + de gekozen techniek. */
  onResult: (result: OptimizeResult, technique: Technique) => void;
  /**
   * Optionele header (de instap-tabs) die boven de chat valt. De chat (prompt
   * plakken + zoekknop) wordt samen met deze header in één oranje-omrand element
   * getoond, zodat de oranje rand alléén om de chat valt. Alles daarna
   * (aanbevelingen, frameworklijst, voor-invullen, genereren) staat als losse
   * kaarten eronder, buiten het oranje element.
   */
  header?: ReactNode;
  /**
   * Optionele startwaarde voor het invoerveld: de inhoud van een bibliotheek-
   * prompt waarmee de gebruiker via /genereren/:promptId binnenkomt. Wordt één
   * keer toegepast per aangeleverde tekst, zodat eigen bewerkingen daarna niet
   * worden overschreven.
   */
  initialPrompt?: string | null;
}

/** Voorbeeldprompts per raamwerk; uitklapbaar als hulp/inspiratie en om te testen. */
const PROMPT_EXAMPLES: { framework: string; prompt: string }[] = [
  {
    framework: 'CRISPE',
    prompt:
      'Maak een advies voor een gemeente die AI wil inzetten om interne werkprocessen te verbeteren. Neem de huidige situatie, rollen, risico’s, stappen, randvoorwaarden en het gewenste eindresultaat mee.',
  },
  {
    framework: 'RAISE',
    prompt:
      'Herschrijf deze interne instructietekst voor ambtenaren naar duidelijke en praktische taal. Gebruik de aangeleverde tekst als basis en zorg dat medewerkers direct weten wat ze moeten doen.',
  },
  {
    framework: 'CO-STAR',
    prompt:
      'Schrijf een korte intranettekst voor rijksambtenaren over een nieuwe training veilig werken met AI. De tekst moet duidelijk maken waarom deelname belangrijk is, voor wie de training bedoeld is en wat deelnemers eraan hebben.',
  },
  {
    framework: 'CRAFT',
    prompt:
      'Maak een zakelijke memo voor het managementteam over de invoering van een nieuwe AI-tool binnen de organisatie. Gebruik een professionele toon en lever de output op als korte managementsamenvatting met vervolgstappen.',
  },
  {
    framework: 'CREATE',
    prompt:
      'Bedenk drie creatieve campagne-ideeën om ambtenaren enthousiast te maken voor een programma over digitale vaardigheden. Geef elk idee een titel, een korte slogan en een praktische uitwerking.',
  },
  {
    framework: 'REACT',
    prompt:
      'Controleer een conceptbeleidstekst stap voor stap op duidelijkheid, AVG-risico’s en toepasbaarheid voor ambtenaren. Beoordeel de belangrijkste aandachtspunten, voer verbeteringen door, controleer het resultaat en geef een korte terugkoppeling.',
  },
];

/**
 * Wat de knop toont terwijl de AI zoekt. Een spinner die 10 seconden stilstaat
 * voelt kapot; benoemen wát er gebeurt maakt dezelfde wachttijd draaglijk.
 */
const PHASE_LABEL: Record<FrameworkSearchPhase, string> = {
  analyzing: 'Je prompt analyseren…',
  weighing: 'Frameworks tegen je vraagstuk wegen…',
  writing: 'Motivatie schrijven…',
};

/**
 * Flow om een EIGEN prompt te optimaliseren. De gebruiker plakt zijn prompt en
 * laat de AI bepalen welk prompt framework (CARE, CRISP, …) het beste past.
 * Uit de aanbevelingen (1–3) kiest de gebruiker er één. Daarna analyseren we de
 * prompt tegen de eisen van dat raamwerk, tonen we wat nog ontbreekt als extra
 * invulvelden, en genereren we de volledig geoptimaliseerde prompt.
 */
export default function OwnPromptOptimizer({
  settings,
  onResult,
  header,
  initialPrompt,
}: OwnPromptOptimizerProps) {
  const { techniques, techniqueById } = useReferenceData();
  const frameworks = techniques.filter(isContextPrompt);

  // De geplakte prompt wordt in localStorage bewaard, zodat hij niet verloren
  // gaat bij een fout of herlaadactie. "Opschonen" maakt hem (en de rest) leeg.
  const [ownPrompt, setOwnPrompt, clearOwnPromptDraft] = usePersistentDraft('ownPromptFlow');
  const [showExamples, setShowExamples] = useState(false);
  // Vraagstuk-specifiek fit-oordeel per framework (past het, waarom (niet), en
  // wat er nog bij moet), voor de "kies een ander framework"-lijst. Per
  // framework-id. Wordt opgehaald zodra de gebruiker die lijst uitklapt (één
  // AI-call die ALLE frameworks tegen het vraagstuk beoordeelt).
  const [frameworkFits, setFrameworkFits] = useState<Record<string, FrameworkFit>>({});
  const [fitLoading, setFitLoading] = useState(false);
  const fitFetchedRef = useRef(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<TechniqueRecommendation[] | null>(null);
  const [recommendSummary, setRecommendSummary] = useState('');
  // Waar de zoekactie mee bezig is; voedt de voortgangstekst op de knop.
  const [searchPhase, setSearchPhase] = useState<FrameworkSearchPhase>('analyzing');
  // De getoonde lijst is (nog) de lokale trefwoord-gok, niet het AI-oordeel.
  // Zo staat er meteen iets op het scherm zonder dat het zich voordoet als advies.
  const [provisional, setProvisional] = useState(false);
  // De gebruiker klapte "kies een ander framework" uit terwijl de aanbeveling nog
  // liep: het fit-oordeel wachten we dan af tot die klaar is (twee zware calls
  // tegelijk vechten om dezelfde provider-ratelimit en vertragen elkaar).
  const [fitsRequested, setFitsRequested] = useState(false);
  // Het uitklapblok zelf, zodat we de echte open-stand kunnen uitlezen.
  const chooseRef = useRef<HTMLDetailsElement>(null);
  // Toelichting die de gebruiker typt om, ná het kiezen van een framework, de
  // velden aan te vullen die voor DIT raamwerk nog ontbraken. Voedt een nieuwe
  // voor-invulronde (chain-of-thought): menselijke input maakt de template scherper.
  // In localStorage bewaard, zodat een half getypte toelichting niet verloren
  // gaat bij een fout of herlaadactie. resetDownstream() (leeg → verwijderd) en
  // "Opschonen" maken hem weer leeg.
  const [clarification, setClarification] = usePersistentDraft('ownPromptClarification');
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  // Voor-invulling van de velden op basis van de eigen prompt (null = nog niet gedaan).
  const [prefill, setPrefill] = useState<PrefillResult | null>(null);
  // Bewust NIET in localStorage bewaard: deze velden worden door de AI voor-
  // ingevuld zodra een framework wordt gekozen, en die keuze + prefill herstellen
  // we niet over een herlaadactie heen. De geplakte prompt en de toelichting (het
  // eigenlijke handwerk) worden wél bewaard; die volstaan om verder te gaan.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Herkomst per voor-ingevuld veld (origin-badges); vervalt zodra de gebruiker zelf typt.
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>({});
  const [prefilling, setPrefilling] = useState(false);
  // Live voortgang van het voor-invullen: welke modellen racen, wie wint, welke
  // fase loopt en welke velden al binnen zijn. Voedt het laadscherm, zodat de
  // gebruiker de velden ziet vollopen in plaats van naar skeletten te kijken.
  const [prefillProgress, setPrefillProgress] = useState<{
    models: string[];
    winner: string | null;
    phase: PrefillPhase;
    fields: PrefilledField[];
  }>({ models: [], winner: null, phase: 'reading', fields: [] });
  const [generating, setGenerating] = useState(false);
  // De prompt zoals de AI hem op dit moment schrijft (live meelezen).
  const [streamText, setStreamText] = useState('');
  // Dezelfde voortgang, maar dan voor het bouwen van de prompt zelf.
  const [genProgress, setGenProgress] = useState<StreamStatus>({});
  // Terugkoppeling bij onzin-input: geen resultaat, wél uitleg.
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  // Anker voor het voor-invul-/laadblok zodat we er na een keuze naartoe scrollen.
  const analysisRef = useRef<HTMLDivElement>(null);

  const technique = frameworks.find((t) => t.id === techniqueId) ?? null;

  /** Reset alles wat van de (oude) prompt afhangt: aanbevelingen, keuze, voor-invulling. */
  function resetDownstream() {
    setRecommendations(null);
    setProvisional(false);
    setFitsRequested(false);
    setRecommendSummary('');
    setClarification('');
    setTechniqueId(null);
    setPrefill(null);
    setAnswers({});
    setFieldMeta({});
    setUnclearReason(null);
    // Oude fit-oordelen vervallen; opnieuw ophalen bij uitklappen.
    setFrameworkFits({});
    fitFetchedRef.current = false;
  }

  // Komt de gebruiker binnen via /genereren/:promptId, dan zetten we die prompt
  // in het invoerveld en laten we alles wat van een vorige prompt afhing
  // vervallen. Eén keer per aangeleverde tekst (ref-bewaakt), zodat wat de
  // gebruiker daarna zelf typt blijft staan.
  const appliedInitialRef = useRef<string | null>(null);
  useEffect(() => {
    const text = initialPrompt?.trim();
    if (!text || appliedInitialRef.current === text) return;
    appliedInitialRef.current = text;
    setOwnPrompt(text);
    resetDownstream();
    // resetDownstream/setOwnPrompt zijn stabiel binnen deze component; alleen de
    // aangeleverde tekst bepaalt of dit opnieuw moet lopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  /** "Opschonen": wis de geplakte prompt (ook uit localStorage) én alle voortgang. */
  function handleClearAll() {
    clearOwnPromptDraft();
    resetDownstream();
    setShowExamples(false);
    toast.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  /** Kopieer een voorbeeldprompt naar het klembord. */
  async function copyExample(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Voorbeeld gekopieerd.');
    } catch {
      toast.error('Kopiëren mislukt.');
    }
  }

  /** Zet een voorbeeldprompt direct in het invoerveld om te testen. */
  function useExample(text: string) {
    setOwnPrompt(text);
    resetDownstream(); // nieuwe inhoud = oude aanbeveling/analyse vervalt
    setShowExamples(false);
    toast.success('Voorbeeld ingevuld.');
  }

  /** Stap 1: laat de AI op basis van de geplakte prompt het beste framework kiezen. */
  async function handleRecommend() {
    if (!ownPrompt.trim()) {
      toast.error('Plak eerst je eigen prompt.');
      return;
    }
    setRecommending(true);
    setSearchPhase('analyzing');
    // Een nieuwe zoekopdracht maakt de vorige keuze en voor-invulling ongeldig.
    setTechniqueId(null);
    setPrefill(null);
    setAnswers({});
    setFieldMeta({});
    setUnclearReason(null);
    setClarification('');
    setRecommendSummary('');
    // Oude fit-oordelen vervallen; opnieuw ophalen bij uitklappen. Staat het blok
    // op dit moment open, dan volgt dat vanzelf zodra deze zoekactie klaar is.
    setFrameworkFits({});
    fitFetchedRef.current = false;
    setFitsRequested(chooseRef.current?.open ?? false);

    // Meteen een voorlopige suggestie op basis van trefwoorden, zodat er iets
    // staat terwijl de AI nog werkt. Levert dat niets op, dan blijft het blok
    // leeg — een willekeurig framework tonen zou misleidend zijn.
    const guess = localFrameworkGuess(ownPrompt, frameworks);
    setProvisional(guess.length > 0);
    setRecommendations(
      guess.length > 0 ? guess.map((t) => ({ id: t.id, reason: '', value: '' })) : null,
    );

    // De aanbevelingen die de stream tot nu toe heeft opgeleverd. Bewust een
    // gewone array naast de state: de callback kan zo idempotent ontdubbelen.
    const streamed: TechniqueRecommendation[] = [];
    try {
      const res = await recommendFramework({
        ownPrompt: ownPrompt.trim(),
        frameworks,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        onPhase: setSearchPhase,
        onSummary: setRecommendSummary,
        onRecommendation: (rec) => {
          if (streamed.some((r) => r.id === rec.id)) return;
          streamed.push(rec);
          // De eerste échte aanbeveling vervangt de voorlopige gok.
          setProvisional(false);
          setRecommendations([...streamed]);
        },
      });
      setRecommendations(res.recommendations);
      setProvisional(false);
      setRecommendSummary(res.summary);
      if (res.error) toast(res.error, { icon: '⚠️' });
      if (res.recommendations.length === 0) {
        toast('Geen duidelijke match. Kies hieronder zelf een framework.', { icon: 'ℹ️' });
      }
    } catch {
      // Alleen de voorlopige gok laten staan is misleidend als de AI faalde:
      // dan hoort de gebruiker te weten dat dit geen advies is.
      setRecommendations(streamed.length > 0 ? streamed : null);
      setProvisional(false);
      toast.error('Aanbeveling mislukt. Probeer het opnieuw.');
    } finally {
      setRecommending(false);
    }
  }

  /**
   * Haal, zodra de "kies een ander framework"-lijst wordt uitgeklapt, voor ELK
   * framework een vraagstuk-specifiek fit-oordeel op: past het bij dít vraagstuk,
   * waarom (wel of niet), en zo niet — wat er nog bij zou moeten om het wél te
   * laten matchen. Eén AI-call die alle frameworks tegen de eigen prompt weegt.
   * Best-effort: lukt het niet, dan blijft de kaart terugvallen op de beschrijving.
   */
  async function fetchFrameworkFits() {
    if (fitFetchedRef.current || fitLoading) return;
    if (frameworks.length === 0) return;
    // Nooit gelijktijdig met de framework-aanbeveling: twee zware AI-calls op
    // dezelfde provider vertragen elkaar. Het effect wordt afgehandeld zodra
    // `recommending` weer false is.
    if (recommending) return;
    fitFetchedRef.current = true;
    setFitLoading(true);
    try {
      const res = await explainFrameworkFit({
        ownPrompt: ownPrompt.trim(),
        frameworks,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      const map: Record<string, FrameworkFit> = {};
      for (const f of res.fits) map[f.id] = f;
      setFrameworkFits(map);
    } catch {
      // Best-effort; bij een fout blijft de lijst gewoon zonder fit-uitleg.
      fitFetchedRef.current = false;
    } finally {
      setFitLoading(false);
    }
  }

  // Uitgesteld fit-oordeel: is de lijst uitgeklapt terwijl de aanbeveling nog
  // liep, dan halen we het alsnog op zodra die klaar is.
  useEffect(() => {
    if (fitsRequested && !recommending) void fetchFrameworkFits();
    // fetchFrameworkFits is stabiel binnen deze component; alleen de vraag en de
    // loopstatus bepalen of dit opnieuw moet lopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitsRequested, recommending]);

  /** Stap 2: gebruiker kiest één aanbevolen framework → velden alvast voor-invullen. */
  async function handleSelectFramework(id: string) {
    setTechniqueId(id);
    setPrefill(null);
    setAnswers({});
    setFieldMeta({});
    setUnclearReason(null);
    // Nieuw framework = een nieuwe "wat mist nog"-lus; oude toelichting vervalt.
    setClarification('');
    const chosen = frameworks.find((t) => t.id === id);
    if (!chosen) return;
    // Wacht tot het laadblok is gerenderd en scroll het rustig in beeld.
    requestAnimationFrame(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    void runPrefill(chosen);
  }

  /**
   * Stap 3: ontleed de eigen prompt en vul de velden van het framework alvast voor.
   * `clarify` (optioneel) is de toelichting uit de "wat mist nog voor dit framework"-
   * lus: die geven we mee zodat de velden die eerst nog ontbraken nu concreet worden
   * ingevuld. Een chain-of-thought-lus, herhaalbaar tot de gebruiker tevreden is.
   */
  async function runPrefill(chosen: Technique, clarify?: string) {
    setPrefilling(true);
    // Voortgang van een vorige ronde wissen; het laadscherm begint weer leeg.
    setPrefillProgress({ models: [], winner: null, phase: 'reading', fields: [] });
    try {
      const res = await prefillFields({
        ownPrompt: ownPrompt.trim(),
        technique: chosen,
        clarification: clarify?.trim() || undefined,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
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
      // De prompt was onzin → toon de terugkoppeling i.p.v. velden voor te vullen.
      if (res.unclear) {
        setPrefill(null);
        setUnclearReason(
          res.reason?.trim() ||
            'Je prompt is nog niet duidelijk genoeg om de velden voor te vullen. Beschrijf concreet wat je wilt bereiken.',
        );
        return;
      }
      setPrefill(res);
      setAnswers(Object.fromEntries(res.fields.map((f) => [f.id, f.value])));
      setFieldMeta(
        Object.fromEntries(res.fields.map((f) => [f.id, { source: f.source, note: f.note }])),
      );
      if (res.error) toast(res.error, { icon: 'ℹ️' });
    } catch {
      toast.error('Voor-invullen mislukt. Probeer het opnieuw.');
    } finally {
      setPrefilling(false);
    }
  }

  /** Stap 4: genereer de volledig uitgewerkte, geoptimaliseerde prompt. */
  async function handleGenerate() {
    if (!technique) return;
    setGenerating(true);
    setUnclearReason(null); // nieuwe poging: oude onduidelijk-melding wissen
    setStreamText(''); // meegelezen tekst van een vorige poging wissen
    setGenProgress({}); // en de voortgang van die poging ook
    // Het laadscherm verschijnt boven de genereerknop; scroll het in beeld zodat
    // de gebruiker de analyse ziet i.p.v. naar de (nu verdwenen) knop te staren.
    requestAnimationFrame(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    try {
      const res = await generatePrompt({
        technique,
        promptContent: ownPrompt.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: answers,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        systemPrompt: settings.systemPrompt.trim() || undefined,
        toneInstruction: settings.toneInstruction.trim() || undefined,
        temperature: settings.temperature,
        // Meelezen terwijl de prompt wordt geschreven.
        onChunk: setStreamText,
        // Welke modellen meeschrijven en wie de race wint.
        onStatus: (status) => setGenProgress((p) => ({ ...p, ...status })),
      });
      // Clarity-gate: de AI vond de input onzin en maakte bewust geen prompt.
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je prompt is nog niet duidelijk genoeg om te optimaliseren. Beschrijf concreet wat je wilt bereiken.',
        );
        return;
      }
      onResult(res, technique);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Optimaliseren mislukt');
    } finally {
      setGenerating(false);
    }
  }

  if (frameworks.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Er zijn nog geen prompt frameworks beschikbaar. Vraag een beheerder er één toe te voegen.
      </p>
    );
  }

  // Zodra er een framework is gezocht (aanbevelingen aanwezig), groeit de oranje
  // omranding mee om de héle flow — chat + aanbevelingen + frameworklijst — zodat
  // het als één geheel oogt. Daarvóór valt de rand alléén om de chat.
  const expanded = Boolean(recommendations);

  return (
    <div className="space-y-5">
      {/* Generator-blok = het advies vanuit de prompt generator: de chat + de
          aanbevelingen + (na een keuze) de voor-ingevulde velden en genereer-knop.
          De oranje rand omsluit dit hele blok zodra er een advies is (expanded);
          de handmatige frameworklijst valt er bewust buiten (zie onder). */}
      <div className="overflow-hidden rounded-2xl border-2 border-rijksoranje/60 shadow-sm dark:border-rijksoranje/50">
        {/* Chatdeel: de tabs (header) + het promptveld + de zoekknop. Bij een
            advies krijgt dit een scheidingslijn onder zich binnen hetzelfde blok. */}
        <div
          className={clsx(
            'overflow-hidden',
            expanded && 'border-b border-slate-200 dark:border-slate-700',
          )}
        >
          {header}
          <div className="space-y-5 bg-white p-5 dark:bg-slate-800 sm:p-6">
          {/* 1. Eigen prompt plakken */}
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="opl-label mb-0" htmlFor="own-prompt-input">
                Jouw eigen prompt
              </label>
          <button
            type="button"
            onClick={() => setShowExamples((v) => !v)}
            aria-expanded={showExamples}
            aria-controls="prompt-examples"
            title="Bekijk voorbeeldprompts"
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
          {/* Opschonen — alleen tonen als er iets te wissen valt. */}
          {ownPrompt.trim() && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Wis je prompt en begin opnieuw"
              className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-slate-700 transition-colors hover:text-rijksoranje dark:text-slate-200 dark:hover:text-rijksoranje"
            >
              <Eraser size={15} />
              <span>Opschonen</span>
            </button>
          )}
        </div>

        {/* Uitklapbaar paneel met voorbeeldprompts per raamwerk. */}
        {showExamples && (
          <div
            id="prompt-examples"
            className="animate-fade-in mb-3 space-y-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Voorbeeldprompts om te testen. Klik op het voorbeeld om het in te vullen, of kopieer
              het.
            </p>
            {PROMPT_EXAMPLES.map((ex) => (
              <div
                key={ex.framework}
                className="group rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">{ex.framework}</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void copyExample(ex.prompt)}
                      title="Kopieer voorbeeld"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300"
                    >
                      <ClipboardCopy size={13} /> Kopieer
                    </button>
                    <button
                      type="button"
                      onClick={() => useExample(ex.prompt)}
                      title="Gebruik dit voorbeeld in het invoerveld"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-rijksblauw-600 transition-colors hover:bg-rijksblauw-50 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/15"
                    >
                      <Wand2 size={13} /> Gebruik
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {ex.prompt}
                </p>
              </div>
            ))}
          </div>
        )}

        <textarea
          id="own-prompt-input"
          className="opl-input min-h-[120px] resize-y font-mono text-[13px]"
          value={ownPrompt}
          placeholder="Plak hier de prompt die je wilt optimaliseren…"
          onChange={(e) => {
            setOwnPrompt(e.target.value);
            resetDownstream(); // gewijzigde prompt = aanbeveling en analyse vervallen
          }}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          We analyseren je prompt en zoeken automatisch het best passende prompt framework voor je
          uit.
        </p>
      </div>

          {/* 2. Beste framework laten zoeken op basis van de prompt */}
          <button
            type="button"
            className="opl-btn-primary"
            onClick={() => void handleRecommend()}
            disabled={recommending || prefilling || !ownPrompt.trim()}
          >
            {recommending ? (
              <>
                <Loader2 size={18} className="animate-spin" /> {PHASE_LABEL[searchPhase]}
              </>
            ) : (
              <>
                <Compass size={18} /> Zoek het beste prompt framework
              </>
            )}
          </button>
        </div>
      </div>

      {/* Adviesdeel binnen het generator-blok: de aanbevelingen en — na een keuze —
          de voor-ingevulde velden en genereer-knop. Zodra er een advies is, krijgt
          dit een witte achtergrond met padding, zodat het naadloos onder de chat
          binnen dezelfde oranje rand valt. De handmatige frameworklijst staat
          bewust apart, ná dit hele blok. */}
      <div className={clsx(expanded ? 'space-y-5 bg-white p-5 dark:bg-slate-800 sm:p-6' : 'space-y-5')}>
        {/* 3. Aanbevolen frameworks — kies er één om toe te passen */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-3">
          {recommendSummary && (
            <div className="rounded-xl border border-l-4 border-rijksoranje/30 border-l-rijksoranje bg-rijksoranje/5 p-3.5 text-sm font-medium leading-relaxed text-slate-700 dark:border-rijksoranje/25 dark:border-l-rijksoranje dark:bg-rijksoranje/10 dark:text-slate-200">
              {stripMarkdown(recommendSummary)}
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-300">
            {provisional
              ? 'Alvast een eerste indruk op basis van trefwoorden — de AI-analyse verfijnt dit zo:'
              : recommendations.length === 1
                ? 'Dit framework past het beste bij jouw prompt. Kies het om verder te gaan:'
                : 'Deze frameworks passen het beste bij jouw prompt. Kies welke je wilt toepassen:'}
          </p>
          {recommendations.map((rec, idx) => {
            const fw = techniqueById(rec.id);
            if (!fw) return null;
            const active = fw.id === techniqueId;
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => void handleSelectFramework(fw.id)}
                aria-pressed={active}
                className={clsx(
                  'flex w-full flex-col rounded-xl border p-4 text-left shadow-sm transition-all duration-150',
                  'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                    {idx === 0 && !provisional && <Sparkles size={15} className="text-rijksoranje" />}
                    {fw.name}
                    {/* "Beste match" pas claimen als het AI-oordeel binnen is; de
                        voorlopige gok is trefwoord-overlap, geen rangschikking. */}
                    {idx === 0 && !provisional && recommendations.length > 1 && (
                      <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">
                        Beste match
                      </span>
                    )}
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                {rec.reason && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {stripMarkdown(rec.reason)}
                  </span>
                )}
                {rec.value && (
                  <span className="mt-2 rounded-lg border border-rijksoranje/30 bg-rijksoranje/5 p-2.5 text-xs leading-relaxed text-slate-600 dark:border-rijksoranje/20 dark:bg-rijksoranje/10 dark:text-slate-300">
                    <span className="font-semibold text-rijksoranje">Waarom voor jouw vraagstuk: </span>
                    {stripMarkdown(rec.value)}
                  </span>
                )}
                {fw.strength && (
                  <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Doel: </span>
                    {fw.strength}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* "Kies een ander framework": het AI-advies toont maar 1–3 opties, maar soms
          wil de gebruiker bewust een ander framework. Deze nadrukkelijke, oranje
          uitklapknop toont ALLE frameworks, elk met een vraagstuk-specifieke uitleg
          ("Waarom voor jouw vraagstuk") — of, als het niet past, waaróm niet én wat
          er nog bij zou moeten om het wél te laten matchen. De aanbevolen frameworks
          krijgen een groen "Aanbevolen" label; de overige staan er zonder label bij.
          Een keuze loopt via dezelfde handleSelectFramework, dus de velden worden óók
          automatisch voor-ingevuld. De fit-uitleg halen we op bij het uitklappen. */}
      {recommendations && frameworks.length > 0 && (
        <details
          className="group/choose"
          ref={chooseRef}
          onToggle={(e) => {
            // Alleen de open-stand registreren: loopt de aanbeveling nog, dan
            // haalt het effect het fit-oordeel op zodra die klaar is.
            setFitsRequested((e.currentTarget as HTMLDetailsElement).open);
          }}
        >
          {/* Uitklap-knop, nadrukkelijk als oranje knop vormgegeven zodat meteen
              duidelijk is dat hij aanklikbaar is: oranje rand + getinte vulling,
              oranje tekst en een gevulde oranje pijl-cirkel die meedraait bij openen. */}
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border-2 border-rijksoranje/60 bg-rijksoranje/10 px-4 py-3 text-sm font-semibold text-rijksoranje shadow-sm transition-all hover:border-rijksoranje hover:bg-rijksoranje/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rijksoranje/40 dark:border-rijksoranje/50 dark:bg-rijksoranje/15 dark:hover:bg-rijksoranje/20">
            <span className="flex items-center gap-2">
              <Layers size={18} className="text-rijksoranje" />
              Kies een ander framework
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rijksoranje text-white shadow-sm transition-transform group-open/choose:rotate-180">
              <ChevronDown size={16} />
            </span>
          </summary>

          <div className="mt-3">
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Per framework zie je waarom het (wel of niet) past bij jouw vraagstuk. Klik op een
              framework om het toe te passen; we vullen de velden dan automatisch voor.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {frameworks.map((fw) => {
                const active = fw.id === techniqueId;
                const rec = recommendations.find((r) => r.id === fw.id);
                const isRecommended = Boolean(rec);
                const fit = frameworkFits[fw.id];
                // "Waarom voor jouw vraagstuk"-zin: bij de aanbevolen frameworks
                // gebruiken we de vraagstuk-specifieke waarde uit de eerste analyse
                // (rec.value); voor de rest het fit-oordeel (fetchFrameworkFits).
                const whyForCase =
                  (rec?.value ? stripMarkdown(rec.value) : fit?.value ? stripMarkdown(fit.value) : '') ?? '';
                // Een framework "past niet" alleen als het niet aanbevolen is én de
                // fit-analyse fits=false teruggaf (met wat er nog bij zou moeten).
                const doesNotFit = !isRecommended && fit && !fit.fits;
                const missing = fit?.missing ? stripMarkdown(fit.missing) : '';
                const stillLoading = !isRecommended && !fit && fitLoading;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => void handleSelectFramework(fw.id)}
                    aria-pressed={active}
                    disabled={prefilling || generating}
                    className={clsx(
                      'group/other flex flex-col rounded-lg border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60',
                      active
                        ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                        : 'border-slate-200 bg-white hover:border-rijksoranje/50 hover:bg-rijksoranje/5 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-rijksoranje/40 dark:hover:bg-slate-800',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                        {fw.name}
                      </span>
                      {active ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                          <Check size={13} />
                        </span>
                      ) : (
                        // Alleen aanbevolen frameworks krijgen een label (groen
                        // "Aanbevolen"). De overige frameworks blijven wél in de
                        // lijst staan, maar zonder label.
                        isRecommended && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rijksgroen/15 px-2 py-0.5 text-xs font-semibold text-rijksgroen dark:bg-rijksgroen/20">
                            <Sparkles size={11} />
                            Aanbevolen
                          </span>
                        )
                      )}
                    </span>

                    {/* Vraagstuk-specifieke uitleg. Tijdens het ophalen een spinner;
                        daarna "Waarom voor jouw vraagstuk" (past) of "Past minder
                        goed" + wat er nog bij moet (past niet). */}
                    <span className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {stillLoading ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                          <Loader2 size={12} className="animate-spin" /> We bekijken of dit ook past…
                        </span>
                      ) : whyForCase ? (
                        <>
                          <span className="font-semibold text-rijksoranje">
                            {doesNotFit ? 'Past minder goed: ' : 'Waarom voor jouw vraagstuk: '}
                          </span>
                          {whyForCase}
                        </>
                      ) : (
                        fw.strength || fw.description
                      )}
                    </span>

                    {/* Alleen als het niet past: wat er nog bij zou moeten om het
                        raamwerk wél zinvol te maken voor dit vraagstuk. */}
                    {doesNotFit && missing && (
                      <span className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                        <span className="font-semibold">Nodig om te matchen: </span>
                        {missing}
                      </span>
                    )}

                    {!active && (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-rijksoranje">
                        Toepassen
                        <ChevronRight
                          size={13}
                          className="transition-transform group-hover/other:translate-x-0.5"
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      )}

      {/* Anker voor het laad-/voor-invulblok; hier scrollen we na een keuze naartoe. */}
      <div ref={analysisRef} className="scroll-mt-24">
        {/* 4. Mooi laadscherm: de AI ontleedt de prompt en vult de velden voor.
            De velden lopen één voor één vol terwijl de modellen werken. */}
        {prefilling && (
          <PrefillLoader
            techniqueName={technique?.name}
            source="je prompt"
            fields={technique?.follow_up_questions.map((q) => ({ id: q.id, label: q.label }))}
            filled={prefillProgress.fields}
            models={prefillProgress.models}
            winner={prefillProgress.winner}
            phase={prefillProgress.phase}
          />
        )}

        {/* Mooi laadscherm tijdens het genereren van de uiteindelijke prompt. */}
        {generating && (
          <OptimizingLoader
            techniqueName={technique?.name}
            streamText={streamText}
            models={genProgress.models}
            winner={genProgress.provider}
            phase={genProgress.phase}
          />
        )}

        {/* 5. Voor-ingevulde velden — controleer en pas aan. Indeling (stap voor
            stap of alles tegelijk) is een persoonlijke voorkeur in FollowUpQuestions. */}
        {prefill && !prefilling && !generating && technique && (
          <div className="animate-fade-in space-y-4 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {stripMarkdown(prefill.summary) ||
                'We hebben de velden alvast voor je ingevuld op basis van je prompt.'}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Controleer en pas aan waar nodig — vooral de AI-suggesties met het oranje label{' '}
              <span className="font-medium">Controleren</span>. Wat je leeg laat, blijft een
              plaatshouder in de uiteindelijke prompt.
            </p>
            <FollowUpQuestions
              technique={technique}
              answers={answers}
              onChange={setAnswers}
              fieldMeta={fieldMeta}
              onUserEdit={(id) =>
                setFieldMeta((prev) => {
                  if (!prev[id]) return prev;
                  const next = { ...prev };
                  delete next[id];
                  return next;
                })
              }
              onFinish={handleGenerate}
            />

            {/* Chain-of-thought-lus voor DIT framework: de velden die de AI zelf
                moest invullen (source 'ai') zijn precies wat je prompt nog niet gaf
                voor dit raamwerk. We tonen die als "wat mist nog", laten de gebruiker
                toelichten, en vullen dan opnieuw voor (runPrefill) zodat die velden
                concreet worden. Herhaalbaar; genereren kan altijd al. */}
            {(() => {
              // Velden die de AI heeft moeten gokken (niet uit de prompt afgeleid):
              // dat is wat dit framework nog mist. Koppel elk aan zijn veld-label.
              const missingForFramework = prefill.fields
                .filter((f) => f.source === 'ai')
                .map((f) => technique.follow_up_questions.find((q) => q.id === f.id)?.label)
                .filter((label): label is string => Boolean(label));
              return (
                <div className="rounded-xl border border-rijksblauw-200 bg-white/70 p-4 dark:border-rijksblauw-500/30 dark:bg-slate-800/60">
                  <div className="flex items-start gap-2">
                    <Lightbulb size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Maak de prompt scherper voor {technique.name}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                        {missingForFramework.length > 0
                          ? `Voor ${technique.name} heeft je prompt deze onderdelen nog niet aangeleverd — de AI heeft ze nu ingeschat. Licht ze toe voor een scherpere prompt:`
                          : 'Wil je nog iets verduidelijken? Vul het aan en we vullen de velden opnieuw voor.'}
                      </p>
                    </div>
                  </div>

                  {/* De ontbrekende onderdelen van dit framework als concrete vragen. */}
                  {missingForFramework.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 pl-1">
                      {missingForFramework.map((label, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"
                        >
                          <HelpCircle size={15} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Toelichtingsveld: aanvullende context voor dit framework. */}
                  <label className="opl-label mb-1 mt-3 block" htmlFor="prefill-clarify-input">
                    Jouw toelichting
                  </label>
                  <textarea
                    id="prefill-clarify-input"
                    className="opl-input min-h-[80px] resize-y text-sm"
                    value={clarification}
                    placeholder="Bijv. de doelgroep is nieuwe medewerkers, de tekst mag max. 200 woorden zijn, toon informeel…"
                    onChange={(e) => setClarification(e.target.value)}
                    disabled={prefilling}
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="opl-btn-primary"
                      onClick={() => void runPrefill(technique, clarification)}
                      disabled={prefilling || generating || !clarification.trim()}
                    >
                      {prefilling ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Opnieuw invullen…
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} /> Velden opnieuw invullen met mijn toelichting
                        </>
                      )}
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Of genereer hieronder direct.
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Onduidelijke-invoer-melding: de AI nam de input serieus en kon er geen
          zinvolle prompt van maken. Geen verzonnen casus, wél uitleg. */}
      {unclearReason && (
        <div
          role="alert"
          className="animate-fade-in flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Je invoer is nog niet duidelijk genoeg</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">{stripMarkdown(unclearReason)}</p>
          </div>
        </div>
      )}

      {/* 6. Genereren — pas zichtbaar nadat de velden zijn voor-ingevuld
          (verborgen tijdens het genereren; dan toont OptimizingLoader de status) */}
      {prefill && !prefilling && !generating && (
        <div className="flex justify-end">
          <button
            type="button"
            className="opl-btn-primary px-6 py-2.5"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Optimaliseren…
              </>
            ) : (
              <>
                <Sparkles size={18} /> Genereren en optimaliseren prompt
              </>
            )}
          </button>
        </div>
      )}
        </div>
      </div>

      {!recommendations && !recommending && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Wand2 size={13} /> Laat eerst het beste framework zoeken; daarna vul je aan en
          optimaliseer je.
        </p>
      )}
    </div>
  );
}
