import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectContextSlot } from '@/components/optimizer/ProjectContextPicker';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Blocks,
  Bot,
  ClipboardCopy,
  CodeXml,
  Eraser,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  RefreshCw,
  Route,
  Sparkles,
  Wand2,
  type LucideIcon,
} from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import VerantwoordGebruikHint from '@/components/optimizer/VerantwoordGebruikHint';
import StepHeading from '@/components/optimizer/StepHeading';
import AanpakKaart, { type AanpakOptie } from '@/components/optimizer/AanpakKaart';
import MakeProgress from '@/components/optimizer/MakeProgress';
import { compactFieldLabel } from '@/lib/fieldLabel';
import { techniekKaart } from '@/lib/techniekDoelen';
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
  generatePrompt,
  prefillFields,
  recommendFramework,
  type FrameworkSearchPhase,
  type PrefillPhase,
  type VraagHerkomst,
  aanvullingenVoorVelden,
  voegAanvullingToe,
  vragenUitVoorbereiding,
} from '@/services/optimizeService';
import OptimizingLoader from './OptimizingLoader';
import PrefillLoader from './PrefillLoader';
import FollowUpQuestions, { type FieldMeta } from './FollowUpQuestions';
import { overheidsContext, type AiSettings } from '@/services/settingsService';
import type { StreamStatus } from '@/lib/ndjsonStream';
import type {
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
   * De tabbladen (Ik heb al een prompt, Ik heb een idee) boven het invulvlak.
   */
  header?: ReactNode;
  /** De knoppen Denken en Internet, naast de actieknop. */
  toggles?: ReactNode;
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
 * Wat de knop toont terwijl de AI zoekt. Een spinner die 10 seconden stilstaat
 * voelt kapot; benoemen wát er gebeurt maakt dezelfde wachttijd draaglijk.
 */
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
 * Flow om een EIGEN prompt te optimaliseren. De gebruiker plakt zijn prompt; de AI
 * kiest het best passende framework en vult de velden alvast in. Daarna kijkt de
 * gebruiker na, vult aan wat ontbreekt en bouwt de prompt. Zelf een framework kiezen
 * hoeft hier niet: dat kan op /technieken, en "Andere aanpak" vangt een misser op.
 */
export default function OwnPromptOptimizer({
  settings,
  onResult,
  header,
  initialPrompt,
  projectContext,
  renderProjectContext,
  thinking,
  webSearch,
  toggles,
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
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<TechniqueRecommendation[] | null>(null);
  // Waar de zoekactie mee bezig is; voedt de voortgangstekst op de knop.
  const [searchPhase, setSearchPhase] = useState<FrameworkSearchPhase>('analyzing');
  // Staat het invulvlak open? Na "Maak mijn prompt" klapt het in tot één regel, zodat
  // de ingevulde velden meteen in beeld staan. "Aanpassen" opent het weer; de velden
  // blijven eronder staan tot de tekst echt verandert.
  const [composerOpen, setComposerOpen] = useState(true);
  // Staat de toelichting voor een nieuwe invulronde open?
  const [clarifyOpen, setClarifyOpen] = useState(false);
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
  const topRef = useRef<HTMLDivElement>(null);

  const technique = frameworks.find((t) => t.id === techniqueId) ?? null;

  /** Reset alles wat van de (oude) prompt afhangt: aanbevelingen, keuze, voor-invulling. */
  function resetDownstream() {
    setRecommendations(null);
    setPickedByKind(false);
    setClarifyOpen(false);
    setClarification('');
    setTechniqueId(null);
    setPrefill(null);
    setAnswers({});
    setFieldMeta({});
    setAanvullingen({});
    setUnclearReason(null);
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
    setComposerOpen(true);
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
  function applyExample(text: string) {
    setOwnPrompt(text);
    resetDownstream(); // nieuwe inhoud = oude aanbeveling/analyse vervalt
    setShowExamples(false);
    toast.success('Voorbeeld ingevuld.');
  }

  // Loopt het invullen van de vragen uit de voorbereide tekst?
  const [vragenVullen, setVragenVullen] = useState(false);
  // Waar elk antwoord vandaan komt na "Vul de vragen in uit je tekst".
  const [vraagHerkomst, setVraagHerkomst] = useState<Record<string, VraagHerkomst>>({});
  // Na "Velden invullen" bij de routekaart: per veld een voorgestelde aanvulling
  // van de AI, die de gebruiker toevoegt of verwerpt. null = wordt nog gezocht.
  const [aanvullingen, setAanvullingen] = useState<Record<string, string> | null>({});

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

  /** Klap het invulvlak in en breng de voortgang in beeld. */
  function closeComposer() {
    setComposerOpen(false);
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /**
   * "Maak mijn prompt": de AI kiest het best passende framework en gaat meteen door
   * met invullen. De gebruiker kiest hier niets; de alternatieven blijven achter
   * "Andere aanpak" beschikbaar voor als de keuze ernaast zit.
   */
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
      closeComposer();
      void handleSelectFramework(directFramework.id);
      return;
    }
    resetDownstream();
    setRecommending(true);
    setSearchPhase('analyzing');
    closeComposer();

    let keuze: string | undefined;
    try {
      const res = await recommendFramework({
        ownPrompt: ownPrompt.trim(),
        frameworks: candidates,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        projectContext,
        onPhase: setSearchPhase,
      });
      setRecommendations(res.recommendations);
      if (res.error) toast(res.error, { icon: '⚠️' });
      // Geen duidelijke match: geen lijst tonen, maar de trefwoorden laten beslissen.
      // Is de tekst echt onduidelijk, dan zegt het invullen dat hierna zelf.
      keuze =
        res.recommendations[0]?.id ??
        localFrameworkGuess(ownPrompt, candidates)[0]?.id ??
        candidates[0]?.id;
    } catch {
      toast.error('De AI kon je tekst niet verwerken. Probeer het opnieuw.');
      setComposerOpen(true);
    } finally {
      setRecommending(false);
    }
    if (keuze) void handleSelectFramework(keuze);
  }

  /** Vul de velden van dit framework voor: de keuze van de AI, of "Andere aanpak". */
  async function handleSelectFramework(id: string) {
    setTechniqueId(id);
    setPrefill(null);
    setAnswers({});
    setFieldMeta({});
    setUnclearReason(null);
    // Nieuw framework = een nieuwe "wat mist nog"-lus; oude toelichting vervalt.
    setClarification('');
    setClarifyOpen(false);
    const chosen = frameworks.find((t) => t.id === id);
    if (!chosen) return;
    setAanvullingen({});
    // Routekaart met beantwoorde vragen: die antwoorden gaan letterlijk in de
    // velden, de AI stelt alleen aanvullingen voor (zie startSjabloonVelden).
    if (isSjabloon(chosen) && Object.values(sjabloonAntwoorden).some((v) => v.trim())) {
      void startSjabloonVelden(chosen);
      return;
    }
    // Wacht tot het laadblok is gerenderd en scroll het rustig in beeld.
    requestAnimationFrame(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    void runPrefill(chosen);
  }

  /**
   * Routekaart: de antwoorden op de vragen gaan letterlijk in de velden; de AI
   * schrijft ze niet opnieuw. Daarna stelt de AI per veld hooguit een aanvulling
   * voor, die pas iets verandert als de gebruiker haar toevoegt.
   */
  async function startSjabloonVelden(chosen: Technique) {
    const overgenomen = Object.fromEntries(
      chosen.follow_up_questions
        .filter((q) => sjabloonAntwoorden[q.id]?.trim())
        .map((q) => [q.id, sjabloonAntwoorden[q.id].trim()]),
    );
    const note = 'Jouw antwoord, ongewijzigd overgenomen.';
    setPrefill({
      summary: 'Je antwoorden staan ongewijzigd in de velden.',
      fields: Object.entries(overgenomen).map(([id, value]) => ({
        id,
        value,
        source: 'prompt' as const,
        note,
      })),
      success: true,
      provider: 'local-template',
    });
    setAnswers(overgenomen);
    setFieldMeta(
      Object.fromEntries(Object.keys(overgenomen).map((id) => [id, { source: 'prompt' as const, note }])),
    );
    setAanvullingen(null);
    try {
      setAanvullingen(
        await aanvullingenVoorVelden({
          technique: chosen,
          tekst: promptText,
          antwoorden: overgenomen,
          preferredProvider: settings.provider,
          preferredModel: settings.model,
        }),
      );
    } catch {
      // Aanvullen is een extraatje; zonder blijven de antwoorden gewoon staan.
      setAanvullingen({});
    }
  }

  /** Voeg een voorgestelde aanvulling toe aan het veld, of verwerp haar. */
  function handleAanvulling(id: string, toevoegen: boolean) {
    const extra = aanvullingen?.[id];
    if (toevoegen && extra) {
      setAnswers((prev) => ({ ...prev, [id]: voegAanvullingToe(prev[id] ?? '', extra) }));
      setFieldMeta((prev) => ({
        ...prev,
        [id]: {
          source: 'ai',
          note: prev[id]
            ? 'Jouw antwoord, met de aanvulling van de AI eronder.'
            : 'Aanvulling van de AI; dit veld had je nog niet ingevuld.',
        },
      }));
    }
    setAanvullingen((prev) => {
      if (!prev) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
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
        setTechniqueId(null);
        setRecommendations(null);
        setUnclearReason(
          res.reason?.trim() ||
            'Je prompt is nog niet duidelijk genoeg om de velden voor te vullen. Beschrijf concreet wat je wilt bereiken.',
        );
        // De melding en het tekstvak horen bij elkaar: hier vul je aan.
        setComposerOpen(true);
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
      setComposerOpen(true);
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
        // Bij de routekaart staan de antwoorden al in de velden; als context gaat
        // dan alleen de voorbereide tekst mee, zodat niets dubbel binnenkomt.
        promptContent: isSjabloon(technique)
          ? ownPrompt.trim() || '(geen voorbereide tekst; alles staat in de velden)'
          : promptText || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
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

  // De melding bij onduidelijke invoer staat bij het tekstvak als dat open is, anders
  // onder de velden (dan kwam ze van het bouwen zelf).
  const unclearBlock = unclearReason && (
    <div
      role="alert"
      className="animate-fade-in flex items-start gap-3 rounded-xl bg-rijksoranje/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200"
    >
      <HelpCircle size={18} className="mt-0.5 shrink-0 text-rijksoranje" />
      <div>
        <p className="font-semibold text-slate-900 dark:text-slate-100">
          Je tekst is nog niet duidelijk genoeg
        </p>
        <p className="mt-0.5">{stripMarkdown(unclearReason)}</p>
      </div>
    </div>
  );

  const chosenRec = recommendations?.find((r) => r.id === techniqueId);
  // Andere aanpak: de alternatieven die de AI al gaf, dus geen extra aanroep. Gaf hij
  // er geen, dan de andere frameworks die bij de gekozen soort passen.
  const andereRecs = (recommendations ?? []).filter((r) => r.id !== techniqueId);
  const aanpakOpties: AanpakOptie[] =
    pickedByKind || !technique
      ? []
      : andereRecs.length > 0
        ? andereRecs.flatMap((r) => {
            const fw = techniqueById(r.id);
            return fw ? [{ id: fw.id, naam: fw.name, waarom: stripMarkdown(r.reason) }] : [];
          })
        : candidates
            .filter((t) => t.id !== technique.id)
            .slice(0, 4)
            .map((t) => ({ id: t.id, naam: t.name, waarom: techniekKaart(t).kort }));

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-4">
      {!composerOpen ? (
        <section
          aria-label="Jouw tekst"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-1.5 dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
            <strong className="font-semibold text-slate-900 dark:text-slate-100">Jouw tekst: </strong>
            {promptText}
          </p>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            disabled={recommending || prefilling || generating}
            className="min-h-11 shrink-0 font-semibold text-rijksblauw-500 transition-colors hover:underline disabled:opacity-50 dark:text-rijksblauw-200"
          >
            Aanpassen
          </button>
        </section>
      ) : (
      <div>
        {header}
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:rounded-t-none dark:border-slate-700 dark:bg-slate-800">
          {unclearBlock}
          <div>
            <StepHeading
              step={1}
              title="Wat wordt het?"
              info={
                kindOption
                  ? kindOption.hint
                  : 'Kies niets, dan kiest de AI het framework dat bij je tekst past.\nSkill en Routekaart kies je zelf.'
              }
            />
            <div
              role="group"
              aria-label="Wat wil je maken? Kies je niets, dan bepaalt de AI het zelf."
              className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
            >
              {[null, ...PROMPT_KINDS].map((k) => {
                const option = k ? KIND_OPTIONS[k] : { label: 'AI kiest', icon: Sparkles };
                const Icon = option.icon;
                const active = kind === k;
                return (
                  <button
                    key={k ?? 'auto'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (k) handleKind(k);
                      else if (kind) handleKind(kind); // de gekozen soort uitzetten
                    }}
                    disabled={recommending || prefilling}
                    className={clsx(
                      'flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[15px] font-semibold transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:focus-visible:ring-offset-slate-800',
                      active
                        ? 'border-rijksblauw-700 bg-rijksblauw-50 text-rijksblauw-700 ring-1 ring-rijksblauw-700 dark:border-rijksblauw-200 dark:bg-rijksblauw-500/15 dark:text-white dark:ring-rijksblauw-200'
                        : 'border-slate-200 bg-slate-50 text-rijksblauw-700 hover:border-rijksblauw-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-rijksblauw-200 dark:hover:border-rijksblauw-200',
                    )}
                  >
                    <Icon size={26} strokeWidth={1.5} />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <StepHeading step={2} title="Jouw tekst" htmlFor="own-prompt-input">
          <button
            type="button"
            onClick={() => setShowExamples((v) => !v)}
            aria-expanded={showExamples}
            aria-controls="prompt-examples"
            title="Bekijk voorbeeldprompts"
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-sm font-medium text-rijksblauw-500 transition-colors hover:underline dark:text-rijksblauw-200',
            )}
          >
            <Lightbulb size={16} className="text-rijksoranje" />
            <span>Voorbeelden</span>
          </button>
          {/* Opschonen: alleen tonen als er iets te wissen valt. */}
          {(ownPrompt.trim() || promptText) && (
            <button
              type="button"
              onClick={handleClearAll}
              title="Wis je prompt en begin opnieuw"
              className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-sm font-medium text-slate-700 transition-colors hover:underline dark:text-slate-200"
            >
              <Eraser size={15} />
              <span>Opschonen</span>
            </button>
          )}
            </StepHeading>

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
                  // onleesbaar lang); wie hem wil lezen, zet hem met "Gebruik"
                  // in het veld.
                  <div
                    key={ex.title}
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
                          onClick={() => applyExample(ex.prompt)}
                          title="Gebruik dit voorbeeld in het invoerveld"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-rijksblauw-600 transition-colors hover:bg-rijksblauw-50 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/15"
                        >
                          <Wand2 size={13} /> Gebruik
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Het invoerveld met "Wat wil je maken?" als balk erboven en de
            schakelaar, de opzet en de zoekknop eronder: één geheel. */}
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-50 transition-colors focus-within:border-rijksblauw-500 focus-within:ring-2 focus-within:ring-rijksblauw-500/20 dark:border-slate-600 dark:bg-slate-900/40">
          {renderProjectContext?.({
            text: ownPrompt,
            stripMention: () => setOwnPrompt(ownPrompt.replace(/@$/, '')),
            className: 'border-b border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800',
          })}
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
            className="block min-h-[6.5rem] w-full resize-y border-0 bg-white px-3.5 py-3 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            value={ownPrompt}
            placeholder={
              sjabloon
                ? 'Plak hier je voorbereide tekst.'
                : kindOption
                ? (!variantOn && kindOption.placeholderOff) || kindOption.placeholder
                : 'Plak hier de prompt of stel hier je vraag. Typ @ voor een project.'
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

        </div>
        <VerantwoordGebruikHint text={promptText} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {kind === 'skill'
              ? 'Opzet: Skill Creator'
              : kind === 'template' && !sjabloon
                ? 'Nog geen sjabloon beschikbaar'
                : directFramework
                  ? `Opzet: ${directFramework.name}`
                  : `De AI kiest uit ${candidates.length} frameworks`}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {toggles}
            <button
              type="button"
              className="opl-btn-primary min-h-12 px-5 text-base"
              onClick={() => void handleRecommend()}
              disabled={recommending || prefilling || !promptText || (kind === 'template' && !sjabloon)}
            >
              {kind === 'skill' ? (
                <>
                  Verder in de Skill Creator <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <Sparkles size={20} className="text-rijksoranje-vast" />
                  {kind === 'template' ? 'Velden invullen' : 'Maak mijn prompt'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
        </section>
      </div>
      )}

      {/* De AI kiest en vult in: de stappen, en de velden die vollopen. */}
      {(recommending || prefilling) && (
        <MakeProgress
          stage={recommending ? (searchPhase === 'analyzing' ? 'lezen' : 'kiezen') : 'invullen'}
          aanpak={technique?.name}
        />
      )}

      {/* Anker voor het laad-/voor-invulblok; hier scrollen we na een keuze naartoe. */}
      <div ref={analysisRef} className="scroll-mt-24 space-y-4">
        {/* 4. Mooi laadscherm: de AI ontleedt de prompt en vult de velden voor.
            De velden lopen één voor één vol terwijl de modellen werken. */}
        {prefilling && (
          <PrefillLoader
            plain
            techniqueName={technique?.name}
            source="je prompt"
            fields={technique?.follow_up_questions.map((q) => ({
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

        {/* De ingevulde velden: kijk na en vul aan. */}
        {prefill && !prefilling && !generating && technique && (
          <div className="animate-fade-in space-y-4">
            <AanpakKaart
              technique={technique}
              titel={
                isSjabloon(technique)
                  ? 'Je antwoorden staan in de velden'
                  : 'De AI heeft je prompt alvast ingevuld'
              }
              reden={stripMarkdown(chosenRec?.value || chosenRec?.reason || '')}
              opties={aanpakOpties}
              onKies={(id) => void handleSelectFramework(id)}
              disabled={prefilling || generating}
            />

            {/* Kwam er niets terug (AI-dienst druk of niet bereikbaar), dan zeggen
                we dat, met een knop om het opnieuw te proberen. Een leeg formulier
                onder de tekst "we hebben alles ingevuld" is misleidend. */}
            {prefill.fields.length === 0 && (
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
            )}

            <PrefillSources prefill={prefill} />

            {isSjabloon(technique) && (
              <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                {aanvullingen === null && (
                  <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-rijksblauw-500" />
                )}
                {aanvullingen === null
                  ? 'De AI kijkt nog of er per veld iets aan te vullen is.'
                  : Object.keys(aanvullingen).length > 0
                    ? `De AI stelt bij ${Object.keys(aanvullingen).length} ${
                        Object.keys(aanvullingen).length === 1 ? 'veld' : 'velden'
                      } een aanvulling voor; die staat oranje onder het veld. Voeg toe wat klopt, de rest verwerp je.`
                    : 'De AI had niets aan te vullen. Wat je leeg laat, blijft een plaatshouder in de prompt.'}
              </p>
            )}

            <section className="opl-card p-5">
              <FollowUpQuestions
                projectContext={projectContext}
                technique={technique}
                answers={answers}
                onChange={setAnswers}
                aanvullingen={isSjabloon(technique) ? (aanvullingen ?? undefined) : undefined}
                onAanvulling={isSjabloon(technique) ? handleAanvulling : undefined}
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
                finishLabel="Bouw prompt"
                heading={<StepHeading title="Kijk na en vul aan" />}
                showLetters={false}
                askIfEmpty={prefill.fields.length > 0}
              />

              {/* Een nieuwe invulronde met extra uitleg: handig als de AI op het
                  verkeerde spoor zit. Bij de routekaart niet, daar zou een nieuwe
                  ronde de velden opnieuw laten schrijven. */}
              {!isSjabloon(technique) && (
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <button
                    type="button"
                    aria-expanded={clarifyOpen}
                    onClick={() => setClarifyOpen((v) => !v)}
                    className="inline-flex min-h-8 items-center gap-1.5 text-sm font-medium text-rijksblauw-500 transition-colors hover:underline dark:text-rijksblauw-200"
                  >
                    <RefreshCw size={15} /> Opnieuw laten invullen met een toelichting
                  </button>
                  {clarifyOpen && (
                    <div className="animate-fade-in mt-2">
                      <label className="opl-label" htmlFor="prefill-clarify-input">
                        Jouw toelichting
                      </label>
                      <textarea
                        id="prefill-clarify-input"
                        className="opl-input min-h-[5rem] resize-y text-[15px]"
                        value={clarification}
                        placeholder="Bijv. de doelgroep is nieuwe medewerkers, de toon is informeel"
                        onChange={(e) => setClarification(e.target.value)}
                        disabled={prefilling}
                      />
                      <button
                        type="button"
                        className="opl-btn-secondary mt-2"
                        onClick={() => void runPrefill(technique, clarification)}
                        disabled={prefilling || generating || !clarification.trim()}
                      >
                        <RefreshCw size={16} /> Velden opnieuw invullen
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {!composerOpen && unclearBlock}

      {/* Denken, Internet en bouwen op één regel, net als op Technieken. */}
      {prefill && !prefilling && !generating && (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {toggles}
          <button
            type="button"
            className="opl-btn-primary min-h-12 px-6 text-base"
            onClick={handleGenerate}
          >
            <Sparkles size={20} className="text-rijksoranje-vast" /> Bouw prompt
          </button>
        </div>
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
