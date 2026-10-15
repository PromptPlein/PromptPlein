import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  CodeXml,
  Compass,
  Eraser,
  FileText,
  HelpCircle,
  Info,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  RefreshCw,
  Route,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import HoverPreview from '@/components/common/HoverPreview';
import VerantwoordGebruikHint from '@/components/optimizer/VerantwoordGebruikHint';
import PrefillSources from '@/components/optimizer/PrefillSources';
import SjabloonVragen from '@/components/optimizer/SjabloonVragen';
import { PROMPT_CATEGORIES } from '@/data/promptCategories';
import { PROMPT_EXAMPLES } from '@/data/promptExamples';
import {
  KIND_VARIANTS,
  PROMPT_KINDS,
  frameworksForKind,
  isContextPrompt,
  isSjabloon,
  localFrameworkGuess,
  sjabloonContextTekst,
  type PromptKind,
} from '@/lib/techniques';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { stripMarkdown } from '@/lib/utils';
import {
  explainFrameworkFit,
  generatePrompt,
  prefillFields,
  recommendFramework,
  type FrameworkSearchPhase,
  type PrefillPhase,
  type VraagHerkomst,
  vragenUitVoorbereiding,
} from '@/services/optimizeService';
import OptimizingLoader from './OptimizingLoader';
import PrefillLoader from './PrefillLoader';
import FollowUpQuestions, { type FieldMeta } from './FollowUpQuestions';
import { overheidsContext, type AiSettings } from '@/services/settingsService';
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
  /**
   * Context van het aangehaakte chatproject (de projectinstructie van de
   * gebruiker, eventueel met zijn bronbestanden). Gaat mee in de raamwerkkeuze,
   * de voor-invulling en het uiteindelijke schrijven, zodat de prompt over het
   * échte onderwerp gaat in plaats van over een algemeen geval.
   */
  projectContext?: string;
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
 * Wat de knop toont terwijl de AI zoekt. Een spinner die 10 seconden stilstaat
 * voelt kapot; benoemen wát er gebeurt maakt dezelfde wachttijd draaglijk.
 */
const PHASE_LABEL: Record<FrameworkSearchPhase, string> = {
  analyzing: 'Je prompt analyseren…',
  weighing: 'Frameworks tegen je vraagstuk wegen…',
  writing: 'Motivatie schrijven…',
};

/**
 * De keuzes van "Wat wil je maken?" in de balk boven het invoerveld. De volgorde
 * komt uit PROMPT_KINDS. `placeholderOff` hoort bij de schakelaar uit (bestaande
 * code), want daar beschrijf je een verschil en geen nieuw hulpmiddel.
 */
const KIND_OPTIONS: Record<
  PromptKind,
  { label: string; icon: LucideIcon; hint: string; placeholder: string; placeholderOff?: string }
> = {
  text: {
    label: 'Tekst',
    icon: FileText,
    hint: 'Een brief, nota, verslag of samenvatting.',
    placeholder:
      'Bijv. zet mijn ruwe vergaderaantekeningen om in een verslag met besluiten, actiepunten en open vragen.',
  },
  code: {
    label: 'Code',
    icon: CodeXml,
    hint: 'Vibecoden: een tool, script of pagina laten bouwen, of bestaande code laten aanpassen.',
    placeholder:
      'Bijv. een webpagina die een Excel-export uit het zaaksysteem inleest en per afdeling de open zaken telt.',
    placeholderOff:
      'Bijv. de export in ons rapportagescherm negeert het actieve filter; alleen de gefilterde rijen moeten mee.',
  },
  dashboard: {
    label: 'Dashboard',
    icon: LayoutDashboard,
    hint: 'Cijfers, grafieken en filters op één scherm.',
    placeholder:
      'Bijv. een overzicht van de doorlooptijden van Woo-verzoeken per directie, met een filter op kwartaal.',
  },
  agent: {
    label: 'Agent',
    icon: Bot,
    hint: 'Een AI die zelfstandig een taak in stappen uitvoert.',
    placeholder:
      'Bijv. een agent die binnenkomende Woo-verzoeken leest, per onderwerp sorteert en een ontvangstbevestiging klaarzet.',
  },
  skill: {
    label: 'Skill',
    icon: Blocks,
    hint: 'Een vaste werkwijze die een AI-assistent elke keer opnieuw toepast. Je bouwt hem verder in de Skill Creator.',
    placeholder:
      'Bijv. geef feedback op conceptbrieven aan burgers, elke keer volgens de schrijfwijzer van ons ministerie.',
  },
  template: {
    label: 'Routekaart',
    icon: Route,
    hint: 'Een geanimeerde routekaart in rijksstijl: waar je vandaan komt, waar je nu staat en waar je naartoe wilt. Jij geeft de inhoud; de vormgeving is elke keer hetzelfde.',
    placeholder:
      'Bijv. een routekaart van ons opleidingstraject: vijf bijeenkomsten vanaf 3 maart, met per bijeenkomst het thema, het huiswerk en wat het oplevert. We staan nu bij de tweede.',
  },
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
  projectContext,
  thinking,
  webSearch,
}: OwnPromptOptimizerProps) {
  const { techniques, techniqueById } = useReferenceData();
  const navigate = useNavigate();
  const frameworks = techniques.filter(isContextPrompt);

  // "Wat wil je maken?": de gekozen soort (null = de AI kiest uit alles) en de
  // stand van de schakelaar eronder. Die staat bij een nieuwe soort weer aan,
  // want aan is de aanbevolen stand (iets nieuws, eerst een prototype).
  const [kind, setKind] = useState<PromptKind | null>(null);
  const [variantOn, setVariantOn] = useState(true);
  const variant = kind ? KIND_VARIANTS[kind] : undefined;
  const candidates = frameworksForKind(frameworks, kind, variantOn);
  const kindOption = kind ? KIND_OPTIONS[kind] : null;
  // Bij Sjabloon kiest de gebruiker zelf welk sjabloon; er valt niets te wegen.
  const [sjabloonId, setSjabloonId] = useState<string | null>(null);
  const sjabloon =
    kind === 'template' ? (candidates.find((t) => t.id === sjabloonId) ?? candidates[0] ?? null) : null;
  // De soort wees precies één framework aan: dan zoeken we niet, maar gaan we
  // meteen door naar de velden.
  const directFramework =
    kind === 'template'
      ? sjabloon
      : kind && kind !== 'skill' && candidates.length === 1
        ? candidates[0]
        : null;
  // "Kies een ander framework" en het fit-oordeel gaan over gewone frameworks;
  // een sjabloon kies je bij "Wat wil je maken?".
  const generalFrameworks = frameworks.filter((t) => !isSjabloon(t));
  // De aanbeveling kwam uit de soortkeuze, niet uit een AI-afweging.
  const [pickedByKind, setPickedByKind] = useState(false);

  // De geplakte prompt wordt in localStorage bewaard, zodat hij niet verloren
  // gaat bij een fout of herlaadactie. "Opschonen" maakt hem (en de rest) leeg.
  const [ownPrompt, setOwnPrompt, clearOwnPromptDraft] = usePersistentDraft('ownPromptFlow');
  // Bij Sjabloon: de antwoorden op de vragen van het sjabloon, net als de prompt
  // bewaard zodat een herlaadactie ze niet wist (als JSON in één concept).
  const [sjabloonDraft, setSjabloonDraft, clearSjabloonDraft] =
    usePersistentDraft('sjabloonAntwoorden');
  const sjabloonAntwoorden = parseAntwoorden(sjabloonDraft);
  // Wat er als context naar de AI gaat. Bij een sjabloon de antwoorden op de
  // vragen, elk onder zijn vraag, plus het vrije vak eronder.
  const promptText = sjabloon
    ? sjabloonContextTekst(sjabloon, sjabloonAntwoorden, ownPrompt)
    : ownPrompt.trim();
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
  // Live voortgang van het voor-invullen: welk model werkt, welke fase loopt en
  // welke velden al binnen zijn. Voedt het laadscherm, zodat de
  // gebruiker de velden ziet vollopen in plaats van naar skeletten te kijken.
  const [prefillProgress, setPrefillProgress] = useState<{
    models: string[];
    winner: string | null;
    phase: PrefillPhase;
    fields: PrefilledField[];
    /** Gevonden bronnen en zoekvragen (zoeken aan); undefined = nog niet gezocht. */
    sources?: { title: string; url: string }[];
    queries?: string[];
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
    setPickedByKind(false);
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
    clearSjabloonDraft();
    setVraagHerkomst({});
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

  // Loopt het invullen van de vragen uit de voorbereide tekst?
  const [vragenVullen, setVragenVullen] = useState(false);
  // Waar elk antwoord vandaan komt na "Vul de vragen in uit je tekst".
  const [vraagHerkomst, setVraagHerkomst] = useState<Record<string, VraagHerkomst>>({});

  /**
   * Routekaart: haal uit de voorbereide tekst de antwoorden op de vragen. Wat de
   * gebruiker al had ingevuld blijft staan; een vraag waar de tekst niets over
   * zegt blijft leeg.
   */
  async function handleVragenUitTekst() {
    if (!sjabloon || !ownPrompt.trim()) return;
    setVragenVullen(true);
    try {
      const { antwoorden, herkomst, onduidelijk } = await vragenUitVoorbereiding({
        technique: sjabloon,
        tekst: ownPrompt.trim(),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (onduidelijk) {
        toast(onduidelijk, { icon: 'ℹ️' });
        return;
      }
      const nieuw = Object.entries(antwoorden).filter(([id]) => !sjabloonAntwoorden[id]?.trim());
      if (nieuw.length === 0) {
        toast('Je tekst gaf geen antwoord op de vragen die nog leeg waren.', { icon: 'ℹ️' });
        return;
      }
      setSjabloonDraft(JSON.stringify({ ...Object.fromEntries(nieuw), ...sjabloonAntwoorden }));
      setVraagHerkomst((prev) => ({
        ...prev,
        ...Object.fromEntries(nieuw.map(([id]) => [id, herkomst[id] ?? 'tekst'])),
      }));
      resetDownstream();
      const alIngevuld = sjabloon.follow_up_questions.filter((q) =>
        sjabloonAntwoorden[q.id]?.trim(),
      ).length;
      const leeg = sjabloon.follow_up_questions.length - alIngevuld - nieuw.length;
      toast.success(
        leeg > 0
          ? `${nieuw.length} vragen ingevuld uit je tekst. Kijk ze na; ${leeg} vragen zijn nog leeg.`
          : `${nieuw.length} vragen ingevuld uit je tekst. Kijk na wat de AI heeft aangevuld en klik dan op Velden invullen.`,
      );
    } catch {
      toast.error('Vragen invullen uit je tekst mislukt. Probeer het opnieuw.');
    } finally {
      setVragenVullen(false);
    }
  }

  /** Kies een soort bij "Wat wil je maken?". Dezelfde soort nog eens kiezen doet niets. */
  function handleKind(clicked: PromptKind) {
    // Nog eens op de gekozen soort klikken zet hem uit: zonder soort kiest de
    // AI zelf uit alle frameworks. Een aparte knop daarvoor is er niet meer.
    const next = clicked === kind ? null : clicked;
    setKind(next);
    setVariantOn(true);
    resetDownstream(); // andere soort = andere frameworks, het oude advies vervalt
  }

  function handleVariant(on: boolean) {
    if (on === variantOn) return;
    setVariantOn(on);
    resetDownstream();
  }

  /**
   * Skill kiest geen framework: de Skill Creator op /technieken heeft een eigen
   * bouwer. Wat de gebruiker hier typte, gaat mee als eerste antwoord.
   */
  function openSkillCreator() {
    navigate('/technieken', { state: { skillContext: ownPrompt.trim() } });
  }

  /** Stap 1: laat de AI op basis van de geplakte prompt het beste framework kiezen. */
  async function handleRecommend() {
    if (!promptText) {
      toast.error(sjabloon ? 'Beantwoord eerst een paar vragen.' : 'Plak eerst je eigen prompt.');
      return;
    }
    if (kind === 'skill') {
      openSkillCreator();
      return;
    }
    // De soortkeuze wees één framework aan: niets af te wegen, meteen de velden in.
    if (directFramework) {
      resetDownstream();
      setRecommendations([{ id: directFramework.id, reason: '', value: '' }]);
      setPickedByKind(true);
      void handleSelectFramework(directFramework.id);
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
    const guess = localFrameworkGuess(ownPrompt, candidates);
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
        frameworks: candidates,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
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
    if (generalFrameworks.length === 0) return;
    // Nooit gelijktijdig met de framework-aanbeveling: twee zware AI-calls op
    // dezelfde provider vertragen elkaar. Het effect wordt afgehandeld zodra
    // `recommending` weer false is.
    if (recommending) return;
    fitFetchedRef.current = true;
    setFitLoading(true);
    try {
      const res = await explainFrameworkFit({
        ownPrompt: ownPrompt.trim(),
        frameworks: generalFrameworks,
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
    setPrefillProgress({
      models: [],
      winner: null,
      phase: webSearch ? 'searching' : 'reading',
      fields: [],
    });
    try {
      const res = await prefillFields({
        ownPrompt: promptText,
        technique: chosen,
        thinking,
        webSearch,
        onSources: (sources, queries) => setPrefillProgress((p) => ({ ...p, sources, queries })),
        clarification: clarify?.trim() || undefined,
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
        promptContent: promptText || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: answers,
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
          {(ownPrompt.trim() || promptText) && (
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
              Voorbeeldprompts uit het rijkswerk. Klik op "Gebruik" om er een in het invoerveld te
              zetten, en pas hem aan naar je eigen dossier.
            </p>
            {/* Vaste hoogte met eigen schuifbalk: de lijst is bewust lang (er is
                veel verschillend werk), maar mag de pagina niet wegdrukken. */}
            <div className="opl-scroll-slim max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {PROMPT_EXAMPLES.map((ex) => {
                const category = PROMPT_CATEGORIES[ex.category];
                return (
                  // De prompt zelf staat niet op het kaartje (dan wordt de lijst
                  // onleesbaar lang); wie hem vooraf wil lezen, houdt de muis
                  // erboven of zet hem met "Gebruik" in het veld.
                  <HoverPreview key={ex.title} label="Voorbeeldprompt" text={ex.prompt}>
                  <div
                    className="group rounded-lg border border-slate-200 bg-white p-2.5 transition-colors hover:border-rijksblauw-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rijksblauw-500/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rijksblauw-600 dark:text-rijksblauw-300">
                          <category.icon size={12} className="shrink-0" />
                          {category.label}
                        </span>
                        <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {ex.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{ex.subtitle}</p>
                      </div>
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
                  </div>
                  </HoverPreview>
                );
              })}
            </div>
          </div>
        )}

        {/* Het invoerveld met "Wat wil je maken?" als balk erboven en de
            schakelaar, de opzet en de zoekknop eronder: één geheel. */}
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-50 transition-colors focus-within:border-rijksblauw-500 focus-within:ring-2 focus-within:ring-rijksblauw-500/20 dark:border-slate-600 dark:bg-slate-900/40">
          {/* Wat wil je maken? Kies je niets, dan bepaalt de AI het zelf; een
              gekozen soort zet je uit door er nog eens op te klikken. Daarom
              knoppen die aan of uit staan en geen radiogroep: daarin kun je
              niet terug naar niets. */}
          <div
            role="group"
            aria-label="Wat wil je maken? Kies je niets, dan bepaalt de AI het zelf."
            className="opl-scroll-slim flex gap-1 overflow-x-auto border-b border-slate-200 p-1.5 dark:border-slate-700"
          >
            {PROMPT_KINDS.map((k) => {
              const option = KIND_OPTIONS[k];
              const Icon = option.icon;
              const active = kind === k;
              return (
                <Fragment key={k}>
                  {/* Skill en Routekaart staan apart: die kiezen geen framework
                      uit de lijst, maar hebben een eigen bouwer of een vast
                      sjabloon. */}
                  {k === 'skill' && (
                    <span
                      aria-hidden="true"
                      className="mx-1 my-1 w-px shrink-0 self-stretch bg-slate-200 dark:bg-slate-700"
                    />
                  )}
                  <button
                    type="button"
                    aria-pressed={active}
                    title={active ? 'Klik nog eens om de keuze uit te zetten' : undefined}
                    onClick={() => handleKind(k)}
                    disabled={recommending || prefilling}
                    className={clsx(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40 disabled:cursor-not-allowed',
                      active
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-slate-600'
                        : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-100',
                    )}
                  >
                    <Icon
                      size={16}
                      className={clsx(active && 'text-rijksblauw-600 dark:text-rijksblauw-300')}
                    />
                    {option.label}
                  </button>
                </Fragment>
              );
            })}
          </div>

          {/* Vervolgkeuze bij Code en Dashboard: twee opties die elk een eigen
              framework aanwijzen. Zichtbaar zodra de soort gekozen is, zodat je
              ziet dát er een keuze is in plaats van hem te moeten ontdekken. */}
          {variant && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {variant.question}
              </span>
              <div
                role="radiogroup"
                aria-label={variant.question}
                className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {[
                  { on: true, option: variant.on },
                  { on: false, option: variant.off },
                ].map(({ on, option }) => {
                  const active = variantOn === on;
                  return (
                    <button
                      key={option.modality}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleVariant(on)}
                      disabled={recommending || prefilling}
                      className={clsx(
                        'flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40 disabled:cursor-not-allowed',
                        active
                          ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-1 ring-rijksblauw-500 dark:bg-rijksblauw-500/15'
                          : 'border-slate-200 hover:border-rijksblauw-300 dark:border-slate-600 dark:hover:border-rijksblauw-500/50',
                      )}
                    >
                      <span
                        className={clsx(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                          active ? 'border-rijksblauw-500' : 'border-slate-400 dark:border-slate-500',
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-rijksblauw-500" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {option.label}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {option.detail}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bij Routekaart: welk vast sjabloon. Alleen als er iets te kiezen
              valt; met één sjabloon zegt de knop zelf al wat je krijgt. */}
          {kind === 'template' && candidates.length !== 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Welk sjabloon?
              </span>
              {candidates.length === 0 ? (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Er zijn nog geen sjablonen. Vraag een beheerder er één toe te voegen.
                </span>
              ) : (
                <div
                  role="radiogroup"
                  aria-label="Welk sjabloon?"
                  className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2"
                >
                  {candidates.map((t) => {
                    const active = sjabloon?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          if (active) return;
                          setSjabloonId(t.id);
                          clearSjabloonDraft();
                          setVraagHerkomst({});
                          resetDownstream();
                        }}
                        disabled={recommending || prefilling}
                        className={clsx(
                          'flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40 disabled:cursor-not-allowed',
                          active
                            ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-1 ring-rijksblauw-500 dark:bg-rijksblauw-500/15'
                            : 'border-slate-200 hover:border-rijksblauw-300 dark:border-slate-600 dark:hover:border-rijksblauw-500/50',
                        )}
                      >
                        <span
                          className={clsx(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                            active ? 'border-rijksblauw-500' : 'border-slate-400 dark:border-slate-500',
                          )}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full bg-rijksblauw-500" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {t.name}
                          </span>
                          {t.description && (
                            <span className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                              {t.description}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Routekaart: eerst het vak voor wat je al hebt voorbereid, dan de
              vragen van het sjabloon (onder het tekstvak). */}
          {sjabloon && (
            <label
              htmlFor="own-prompt-input"
              className="block border-b border-slate-100 bg-white px-3.5 pt-3 pb-2 dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Heb je al iets voorbereid? (optioneel)
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Plak hier wat je al hebt, bijvoorbeeld een uitwerking uit een andere chat, een
                planning of aantekeningen. De AI haalt eruit wat bij de vragen hoort en vult aan;
                per vraag zie je wat uit je tekst komt en wat de AI heeft bedacht.
              </span>
            </label>
          )}

          <textarea
            id="own-prompt-input"
            className="block min-h-[120px] w-full resize-y border-0 bg-white px-3.5 py-3 font-mono text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            value={ownPrompt}
            placeholder={
              sjabloon
                ? 'Plak hier je voorbereide tekst.'
                : kindOption
                ? (!variantOn && kindOption.placeholderOff) || kindOption.placeholder
                : 'Plak hier de prompt of stel hier je vraag…'
            }
            onChange={(e) => {
              setOwnPrompt(e.target.value);
              resetDownstream(); // gewijzigde prompt = aanbeveling en analyse vervallen
            }}
          />

          {/* De vragen van het sjabloon, elk met een eigen vak. Bovenaan de knop
              die ze invult uit de voorbereide tekst hierboven. */}
          {sjabloon && (
            <div className="border-t border-slate-200 bg-white px-3.5 py-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  De vragen van de routekaart
                </p>
                <button
                  type="button"
                  className="opl-btn-secondary text-sm"
                  disabled={!ownPrompt.trim() || vragenVullen || recommending || prefilling}
                  title={ownPrompt.trim() ? undefined : 'Plak eerst je voorbereide tekst hierboven'}
                  onClick={() => void handleVragenUitTekst()}
                >
                  {vragenVullen ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Vragen invullen…
                    </>
                  ) : (
                    <>
                      <ArrowDown size={15} /> Vul de vragen in uit je tekst
                    </>
                  )}
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Sta bij elke vraag even stil en schrijf op wat je al weet. Met Velden invullen zet
                de AI je antwoorden in de velden van het sjabloon, laat open wat je niet gaf en
                vraagt daar naar.
              </p>
              <SjabloonVragen
                technique={sjabloon}
                antwoorden={sjabloonAntwoorden}
                herkomst={vraagHerkomst}
                onChange={(next, aangepast) => {
                  setSjabloonDraft(JSON.stringify(next));
                  setVraagHerkomst((prev) => {
                    if (!prev[aangepast]) return prev;
                    const rest = { ...prev };
                    delete rest[aangepast];
                    return rest;
                  });
                  resetDownstream(); // andere context = oude voor-invulling vervalt
                }}
                disabled={recommending || prefilling || vragenVullen}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                Opzet:
                <span className="rounded-md bg-rijksblauw-50 px-2 py-0.5 font-mono text-[11px] text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                  {kind === 'skill'
                    ? 'Skill Creator'
                    : kind === 'template' && !sjabloon
                    ? 'nog geen sjabloon beschikbaar'
                    : directFramework
                    ? directFramework.name
                    : `de AI kiest uit ${candidates.length} frameworks`}
                </span>
              </span>
            </div>

            {/* 2. Beste framework laten zoeken op basis van de prompt */}
            <button
              type="button"
              className="opl-btn-primary"
              onClick={() => void handleRecommend()}
              disabled={recommending || prefilling || !promptText || (kind === 'template' && !sjabloon)}
            >
              {recommending ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> {PHASE_LABEL[searchPhase]}
                </>
              ) : kind === 'skill' ? (
                <>
                  Verder in de Skill Creator <ArrowRight size={18} />
                </>
              ) : directFramework ? (
                <>
                  <Wand2 size={18} /> Velden invullen
                </>
              ) : (
                <>
                  <Compass size={18} /> Zoek het beste prompt framework
                </>
              )}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {kindOption
            ? kindOption.hint
            : 'Kies wat je wilt maken, of kies niets: dan bepaalt de AI zelf welk framework past bij je tekst, code, dashboard of agent. Voor een skill of een routekaart in rijksstijl kies je Skill of Routekaart.'}
        </p>
        <VerantwoordGebruikHint text={promptText} />
      </div>
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
        /* Zolang de zoekactie loopt is deze lijst een TUSSENSTAND, geen advies:
           de voorlopige trefwoord-gok en de eerste binnengekomen aanbeveling zien
           er anders exact zo uit als het eindresultaat. Bij een trage verbinding
           lijkt het dan klaar terwijl de AI nog weegt — en een klik zou een keuze
           vastleggen op een lijst die nog verandert. Daarom tijdens het zoeken:
           een duidelijk gemarkeerd voorbeeldvlak, niet klikbaar, met wat er nog
           komt in beeld. Pas als de analyse klaar is worden de kaarten volwaardig
           en aanklikbaar. */
        <div
          className={clsx(
            'space-y-3',
            recommending &&
              'rounded-2xl border border-dashed border-rijksblauw-300 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10',
          )}
          aria-busy={recommending}
        >
          {recommending && (
            <div className="flex items-start gap-2.5">
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-rijksblauw-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Voorbeeld: {PHASE_LABEL[searchPhase]}
                </p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {provisional
                    ? 'Dit is nog een eerste gok op basis van trefwoorden, geen advies. De AI weegt de frameworks nu tegen je vraagstuk.'
                    : 'De AI vult deze lijst nog aan; de volgorde en de onderbouwing kunnen nog veranderen.'}{' '}
                  Kiezen kan zodra de analyse klaar is.
                </p>
              </div>
            </div>
          )}

          {recommendSummary && (
            <div className="rounded-xl border border-l-4 border-rijksoranje/30 border-l-rijksoranje bg-rijksoranje/5 p-3.5 text-sm font-medium leading-relaxed text-slate-700 dark:border-rijksoranje/25 dark:border-l-rijksoranje dark:bg-rijksoranje/10 dark:text-slate-200">
              {stripMarkdown(recommendSummary)}
            </div>
          )}

          {!recommending && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {pickedByKind && kind === 'template'
                ? 'Je vult dit sjabloon in. De velden worden alvast voor je ingevuld:'
                : pickedByKind
                ? 'Bij wat je wilt maken hoort dit framework. De velden worden alvast voor je ingevuld:'
                : recommendations.length === 1
                ? 'Dit framework past het beste bij jouw prompt. Kies het om verder te gaan:'
                : 'Deze frameworks passen het beste bij jouw prompt. Kies welke je wilt toepassen:'}
            </p>
          )}

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
                // Tijdens het zoeken bewust onklikbaar: de lijst is nog niet af.
                // Tijdens het voor-invullen ook: een tweede keuze start een tweede
                // aanroep, en de laatste die klaar is overschrijft de velden.
                disabled={recommending || prefilling}
                className={clsx(
                  'flex w-full flex-col rounded-xl border p-4 text-left transition-all duration-150',
                  prefilling && !recommending && 'cursor-not-allowed opacity-60',
                  recommending
                    ? 'cursor-default border-dashed border-slate-300 bg-white/70 dark:border-slate-600 dark:bg-slate-800/60'
                    : [
                        'shadow-sm hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40',
                        active
                          ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                          : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                      ],
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                    {idx === 0 && !recommending && (
                      <Sparkles size={15} className="text-rijksoranje" />
                    )}
                    {fw.name}
                    {/* "Beste match" pas claimen als het AI-oordeel binnen is; de
                        voorlopige gok is trefwoord-overlap, geen rangschikking. */}
                    {idx === 0 && !recommending && recommendations.length > 1 && (
                      <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">
                        Beste match
                      </span>
                    )}
                    {recommending && (
                      <span className="opl-badge bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                        wordt nog geanalyseerd
                      </span>
                    )}
                  </span>
                  {active && !recommending && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                {rec.reason ? (
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {stripMarkdown(rec.reason)}
                  </span>
                ) : (
                  // Onderbouwing nog onderweg: laat zien dát er nog tekst komt,
                  // in plaats van een kaart die af lijkt maar leeg is.
                  recommending && (
                    <span className="mt-1 block space-y-1.5">
                      <span className="skeleton block h-3 w-full rounded" />
                      <span className="skeleton block h-3 w-4/5 rounded" />
                    </span>
                  )
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

          {/* Plaatshouder voor wat er nog kan komen: de AI levert 1–3 opties, dus
              een lege plek maakt zichtbaar dat de lijst nog niet af is. */}
          {recommending && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
              <div className="skeleton h-3.5 w-1/4 rounded" />
              <div className="mt-2.5 space-y-1.5">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
              <p className="mt-2.5 text-xs text-slate-400 dark:text-slate-500">
                Mogelijk komt hier nog een suggestie bij…
              </p>
            </div>
          )}
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
      {recommendations && generalFrameworks.length > 0 && !isSjabloon(technique ?? {}) && (
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
              {generalFrameworks.map((fw) => {
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
            thinking={thinking}
            webSearch={webSearch}
            sources={prefillProgress.sources}
            queries={prefillProgress.queries}
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
            {/* Kwam er niets terug (AI-dienst druk of niet bereikbaar), dan zeggen
                we dat, met een knop om het opnieuw te proberen. Een leeg formulier
                onder de tekst "we hebben alles ingevuld" is misleidend. */}
            {prefill.fields.length === 0 ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
              >
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Voor-invullen is niet gelukt</p>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">
                    De AI-dienst was even niet bereikbaar. Probeer het opnieuw, of vul de velden
                    hieronder zelf in.
                  </p>
                  <button
                    type="button"
                    className="opl-btn-secondary mt-2"
                    onClick={() => void runPrefill(technique, clarification)}
                    disabled={prefilling || generating}
                  >
                    <RefreshCw size={16} /> Opnieuw proberen
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {stripMarkdown(prefill.summary) ||
                    'We hebben de velden alvast voor je ingevuld op basis van je prompt.'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Controleer en pas aan waar nodig, vooral de AI-suggesties met het oranje label{' '}
                  <span className="font-medium">Controleren</span>. Wat je leeg laat, blijft een
                  plaatshouder in de uiteindelijke prompt.
                </p>
                <PrefillSources prefill={prefill} />
              </>
            )}
            <FollowUpQuestions
              projectContext={projectContext}
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
              // Bij een sjabloon staat in de note een concrete vraag naar het
              // ontbrekende gegeven (datum, naam, onderdeel); die is scherper dan
              // het veldlabel.
              const sjabloonMode = isSjabloon(technique);
              const missingForFramework = prefill.fields
                .filter((f) => f.source === 'ai')
                .map((f) => {
                  const note = f.note?.trim();
                  if (sjabloonMode && note?.endsWith('?')) return note;
                  return technique.follow_up_questions.find((q) => q.id === f.id)?.label;
                })
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
                        {missingForFramework.length > 0 && sjabloonMode
                          ? 'Deze gegevens ontbreken nog. De AI heeft ze niet verzonnen maar opengelaten of als voorstel ingevuld. Beantwoord ze hieronder, dan komen ze kloppend op het sjabloon:'
                          : missingForFramework.length > 0
                          ? `Voor ${technique.name} heeft je prompt deze onderdelen nog niet aangeleverd; de AI heeft ze nu ingeschat. Licht ze toe voor een scherpere prompt:`
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

/** De bewaarde antwoorden van een sjabloon; leeg of kapot concept = geen antwoorden. */
function parseAntwoorden(draft: string): Record<string, string> {
  if (!draft) return {};
  try {
    const parsed = JSON.parse(draft) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}
