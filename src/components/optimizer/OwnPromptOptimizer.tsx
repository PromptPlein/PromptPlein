import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProjectContextSlot } from '@/components/optimizer/ProjectContextPicker';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
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
  ImageIcon,
  Pencil,
  RefreshCw,
  Sparkles,
  Wand2,
  type LucideIcon,
} from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useProjectSources } from '@/hooks/useProjectSources';
import VerantwoordGebruikHint from '@/components/optimizer/VerantwoordGebruikHint';
import StepHeading from '@/components/optimizer/StepHeading';
import AanpakKaart, { type AanpakOptie } from '@/components/optimizer/AanpakKaart';
import MakeProgress from '@/components/optimizer/MakeProgress';
import { compactFieldLabel } from '@/lib/fieldLabel';
import { techniekKaart } from '@/lib/techniekDoelen';
import PrefillSources from '@/components/optimizer/PrefillSources';
import BeeldSpiekkaart from '@/components/optimizer/BeeldSpiekkaart';
import VoorbeeldStijl, { type Voorbeeld } from '@/components/optimizer/VoorbeeldStijl';
import BewaarStijlDialog from '@/components/optimizer/BewaarStijlDialog';
import { fileToJpegDataUrl } from '@/lib/imageResize';
import { PROMPT_CATEGORIES } from '@/data/promptCategories';
import { PROMPT_EXAMPLES } from '@/data/promptExamples';
import {
  KIND_VARIANTS,
  PROMPT_KINDS,
  frameworksForKind,
  isContextPrompt,
  localFrameworkGuess,
  type PromptKind,
} from '@/lib/techniques';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { stripMarkdown, copyToClipboard } from '@/lib/utils';
import {
  applyImageOption,
  fetchImageOptions,
  generatePrompt,
  readImageStyle,
  prefillFields,
  recommendFramework,
  type BeeldKeuze,
  type FrameworkSearchPhase,
  type PrefillPhase,
  type VeldKeuzes,
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

/**
 * De stand van de bouwer op het moment dat de prompt werd gebouwd: het gekozen
 * framework met de velden zoals de gebruiker ze naliet. Met "Velden aanpassen"
 * onder het resultaat komt de bouwer precies zo terug.
 */
export interface OwnPromptRestore {
  kind: PromptKind | null;
  variantOn: boolean;
  /** Bij Afbeelding: de gekozen beeldstijl. */
  beeldStijl?: BeeldStijl;
  pickedByKind: boolean;
  recommendations: TechniqueRecommendation[] | null;
  techniqueId: string;
  prefill: PrefillResult | null;
  answers: Record<string, string>;
  fieldMeta: FieldMeta;
  /** Bij Afbeelding: de keuzes per veld. */
  keuzes?: VeldKeuzes | null;
}

/** De stijl bij Afbeelding: vrij, de Rijkshuisstijl, uit een project of van een voorbeeldbeeld. */
type BeeldStijl = BeeldKeuze['stijl'];

/** Per browser onthouden, zodat wie altijd in huisstijl werkt dat één keer kiest. */
const BEELD_STIJL_KEY = 'opl.beeld.stijl';

function readBeeldStijl(): BeeldStijl {
  try {
    const v = localStorage.getItem(BEELD_STIJL_KEY);
    return v === 'rijkshuisstijl' || v === 'project' || v === 'voorbeeld' ? v : 'vrij';
  } catch {
    return 'vrij';
  }
}

/**
 * De stijl die uit een voorbeeldbeeld is gelezen, per browser onthouden. Alleen
 * de tekst: het beeld zelf bewaren we niet.
 */
const BEELD_VOORBEELD_KEY = 'opl.beeld.voorbeeld';

function readVoorbeeld(): Voorbeeld | null {
  try {
    const raw = localStorage.getItem(BEELD_VOORBEELD_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { naam?: unknown; tekst?: unknown };
    return typeof v.tekst === 'string' && v.tekst.trim()
      ? { naam: typeof v.naam === 'string' ? v.naam : '', tekst: v.tekst }
      : null;
  } catch {
    return null;
  }
}

function writeVoorbeeld(v: Voorbeeld | null) {
  try {
    if (v) localStorage.setItem(BEELD_VOORBEELD_KEY, JSON.stringify({ naam: v.naam, tekst: v.tekst }));
    else localStorage.removeItem(BEELD_VOORBEELD_KEY);
  } catch {
    // Zonder opslag geldt de stijl alleen voor nu.
  }
}

const BEELD_STIJLEN: { value: BeeldStijl; label: string; detail: string }[] = [
  { value: 'vrij', label: 'Vrij', detail: 'de AI kiest wat bij je beeld past' },
  { value: 'rijkshuisstijl', label: 'Pleinhuisstijl', detail: 'kleuren en beeldtaal van PromptPlein' },
  { value: 'project', label: 'Uit een project', detail: 'je eigen vaste stijl' },
  { value: 'voorbeeld', label: 'Van een voorbeeld', detail: 'lijkt op een beeld dat je mooi vindt' },
];

interface OwnPromptOptimizerProps {
  /** Admin-bepaalde AI-instellingen (provider, systeemprompt, toon, temperatuur). */
  settings: AiSettings;
  /**
   * Aangeroepen met het geoptimaliseerde resultaat, de gekozen techniek en de
   * stand van de bouwer, zodat de pagina die later kan terugzetten.
   */
  onResult: (result: OptimizeResult, technique: Technique, restore: OwnPromptRestore) => void;
  /** Terugkomen uit het resultaat: begin met deze velden in plaats van leeg. */
  restore?: OwnPromptRestore | null;
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
  /**
   * Zoekt bij de opdracht de passende passages uit de gekozen bronbestanden en
   * zet ze onder de analyse. Zonder deze functie gaat alleen `projectContext` mee.
   */
  projectSources?: (task: string) => Promise<string | undefined>;
  /** De knop "Context" met zijn labels, boven het tekstvak. */
  renderProjectContext?: (slot: ProjectContextSlot) => ReactNode;
  /**
   * Het aangehaakte project als beeldstijl: de naam en de projectinstructie. Bij
   * Afbeelding gaat die instructie woord voor woord mee als vaste stijl, zodat
   * elk beeld uit dat project dezelfde stijl krijgt met een ander onderwerp.
   */
  projectStyle?: { name: string; text: string } | null;
  /**
   * Bewaar de stijl van een voorbeeldbeeld als nieuw project en haak dat aan.
   * Geeft false terug als het niet lukte (of als de gebruiker eerst moet inloggen).
   */
  onSaveStyleProject?: (name: string, instructions: string) => Promise<boolean>;
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
      'Bijv. geef feedback op conceptbrieven aan burgers, elke keer volgens de schrijfwijzer van onze organisatie.',
  },
  image: {
    label: 'Afbeelding',
    icon: ImageIcon,
    hint: 'Een prompt voor een beeldgenerator, zoals ChatGPT of Copilot. PromptPlein maakt zelf geen beeld. Kies een vrije stijl, de Pleinhuisstijl of de vaste stijl van een project.',
    placeholder:
      'Bijv. een illustratie bij ons intranetbericht over de nieuwe thuiswerkregeling: een medewerker aan de keukentafel met een laptop, rustig en licht.',
  },
};

/**
 * Flow om een EIGEN prompt te optimaliseren. De gebruiker plakt zijn prompt; de AI
 * kiest het best passende framework en vult de velden alvast in. Daarna kijkt de
 * gebruiker na, vult aan wat ontbreekt en bouwt de prompt. Zelf een framework kiezen
 * hoeft hier niet: dat kan onder Wat wil je bereiken?, en "Andere aanpak" vangt een misser op.
 */
export default function OwnPromptOptimizer({
  settings,
  onResult,
  header,
  initialPrompt,
  projectContext: projectBrief,
  projectSources,
  renderProjectContext,
  projectStyle,
  onSaveStyleProject,
  thinking,
  webSearch: webSearchSetting,
  toggles,
  restore,
}: OwnPromptOptimizerProps) {
  const { techniques, techniqueById } = useReferenceData();
  // De analyse van het project, aangevuld met de passages die bij deze prompt passen.
  const { resolve: resolveProjectContext, current: projectContext } = useProjectSources(
    projectBrief,
    projectSources,
  );
  const navigate = useNavigate();
  const frameworks = techniques.filter(isContextPrompt);

  // "Wat wil je maken?": de gekozen soort (null = de AI kiest uit alles) en de
  // stand van de schakelaar eronder. Die staat bij een nieuwe soort weer aan,
  // want aan is de aanbevolen stand (iets nieuws, eerst een prototype).
  const [kind, setKind] = useState<PromptKind | null>(restore?.kind ?? null);
  // Bij Afbeelding nooit zoeken op internet: een beeldgenerator heeft niets aan
  // webbronnen, en de treffers gingen over het merk of het auteursrecht in plaats
  // van over hoe het beeld eruitziet.
  const webSearch = Boolean(webSearchSetting) && kind !== 'image';
  const [variantOn, setVariantOn] = useState(restore?.variantOn ?? true);
  const variant = kind ? KIND_VARIANTS[kind] : undefined;
  const candidates = frameworksForKind(frameworks, kind, variantOn);
  const kindOption = kind ? KIND_OPTIONS[kind] : null;
  // De soort wees precies één framework aan: dan zoeken we niet, maar gaan we
  // meteen door naar de velden. Bij Afbeelding is dat altijd zo.
  const directFramework =
    kind && kind !== 'skill' && candidates.length === 1 ? candidates[0] : null;
  // Bij Afbeelding: welke stijl vast meegaat. "Uit een project" werkt pas als er
  // een project aanhangt; tot dan gaat er geen vaste stijl mee.
  const [beeldStijl, setBeeldStijlState] = useState<BeeldStijl>(
    restore?.beeldStijl ?? readBeeldStijl(),
  );
  const projectStijl = projectStyle?.text.trim() ? projectStyle : null;
  // Van een voorbeeld: de stijl die de AI uit het toegevoegde beeld las.
  const [voorbeeld, setVoorbeeldState] = useState<Voorbeeld | null>(readVoorbeeld);
  const [voorbeeldBezig, setVoorbeeldBezig] = useState(false);
  const [bewaarStijlOpen, setBewaarStijlOpen] = useState(false);
  const voorbeeldInput = useRef<HTMLInputElement>(null);
  const voorbeeldTekst = voorbeeld?.tekst.trim() ?? '';
  const beeld: BeeldKeuze | undefined =
    kind !== 'image'
      ? undefined
      : beeldStijl === 'project'
        ? projectStijl
          ? { stijl: 'project', stijlTekst: projectStijl.text }
          : { stijl: 'vrij' }
        : beeldStijl === 'voorbeeld'
          ? voorbeeldTekst
            ? { stijl: 'voorbeeld', stijlTekst: voorbeeldTekst }
            : { stijl: 'vrij' }
          : { stijl: beeldStijl };
  // Wie bij Afbeelding een project aanhaakt, wil daar de stijl van.
  const projectNaam = projectStijl?.name;
  useEffect(() => {
    if (projectNaam && kind === 'image') setBeeldStijlState('project');
  }, [projectNaam, kind]);
  // De aanbeveling kwam uit de soortkeuze, niet uit een AI-afweging.
  const [pickedByKind, setPickedByKind] = useState(restore?.pickedByKind ?? false);

  // De geplakte prompt wordt in localStorage bewaard, zodat hij niet verloren
  // gaat bij een fout of herlaadactie. "Opschonen" maakt hem (en de rest) leeg.
  const [ownPrompt, setOwnPrompt, clearOwnPromptDraft] = usePersistentDraft('ownPromptFlow');
  // Bij Sjabloon: de antwoorden op de vragen van het sjabloon, net als de prompt
  // bewaard zodat een herlaadactie ze niet wist (als JSON in één concept).
  // Wat er als context naar de AI gaat.
  const promptText = ownPrompt.trim();
  const [showExamples, setShowExamples] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<TechniqueRecommendation[] | null>(
    restore?.recommendations ?? null,
  );
  // Waar de zoekactie mee bezig is; voedt de voortgangstekst op de knop.
  const [searchPhase, setSearchPhase] = useState<FrameworkSearchPhase>('analyzing');
  // Staat het invulvlak open? Na "Maak mijn prompt" klapt het in tot één regel, zodat
  // de ingevulde velden meteen in beeld staan. "Aanpassen" opent het weer; de velden
  // blijven eronder staan tot de tekst echt verandert.
  const [composerOpen, setComposerOpen] = useState(!restore);
  // Staat de toelichting voor een nieuwe invulronde open?
  const [clarifyOpen, setClarifyOpen] = useState(false);
  // Toelichting die de gebruiker typt om, ná het kiezen van een framework, de
  // velden aan te vullen die voor DIT raamwerk nog ontbraken. Voedt een nieuwe
  // voor-invulronde (chain-of-thought): menselijke input maakt de template scherper.
  // In localStorage bewaard, zodat een half getypte toelichting niet verloren
  // gaat bij een fout of herlaadactie. resetDownstream() (leeg → verwijderd) en
  // "Opschonen" maken hem weer leeg.
  const [clarification, setClarification] = usePersistentDraft('ownPromptClarification');
  const [techniqueId, setTechniqueId] = useState<string | null>(restore?.techniqueId ?? null);
  // Voor-invulling van de velden op basis van de eigen prompt (null = nog niet gedaan).
  const [prefill, setPrefill] = useState<PrefillResult | null>(restore?.prefill ?? null);
  // Bewust NIET in localStorage bewaard: deze velden worden door de AI voor-
  // ingevuld zodra een framework wordt gekozen, en die keuze + prefill herstellen
  // we niet over een herlaadactie heen. De geplakte prompt en de toelichting (het
  // eigenlijke handwerk) worden wél bewaard; die volstaan om verder te gaan.
  const [answers, setAnswers] = useState<Record<string, string>>(restore?.answers ?? {});
  // Herkomst per voor-ingevuld veld (origin-badges); vervalt zodra de gebruiker zelf typt.
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>(restore?.fieldMeta ?? {});
  // Bij Afbeelding: per veld een vraag en keuzes, bedacht naast het voor-invullen.
  const [keuzes, setKeuzes] = useState<VeldKeuzes | null>(restore?.keuzes ?? null);
  const [keuzesLoading, setKeuzesLoading] = useState(false);
  // Alleen het antwoord op de laatste aanvraag telt; een oudere komt te laat.
  const keuzesRun = useRef(0);
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
    clearKeuzes();
    setUnclearReason(null);
  }

  function clearKeuzes() {
    keuzesRun.current += 1;
    setKeuzes(null);
    setKeuzesLoading(false);
  }

  /**
   * Bij Afbeelding: bedenk per veld keuzes die bij deze soort beeld passen. Loopt
   * naast het voor-invullen en houdt dat niet op; lukt het niet, dan blijven de
   * velden gewoon zonder keuzes.
   */
  function loadKeuzes(chosen: Technique) {
    const run = ++keuzesRun.current;
    setKeuzes(null);
    setKeuzesLoading(true);
    void fetchImageOptions({
      ownPrompt: promptText,
      technique: chosen,
      beeld,
      preferredProvider: settings.provider,
      preferredModel: settings.model,
    }).then((result) => {
      if (keuzesRun.current !== run) return;
      setKeuzes(result);
      setKeuzesLoading(false);
    });
  }

  // Komt de gebruiker binnen via /genereren/:promptId, dan zetten we die prompt
  // in het invoerveld en laten we alles wat van een vorige prompt afhing
  // vervallen. Eén keer per aangeleverde tekst (ref-bewaakt), zodat wat de
  // gebruiker daarna zelf typt blijft staan.
  // Komt de gebruiker terug uit het resultaat, dan is die tekst al verwerkt: de
  // velden die hij terugkrijgt mogen er niet door worden gewist.
  const appliedInitialRef = useRef<string | null>(restore ? (initialPrompt?.trim() ?? null) : null);
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
    setComposerOpen(true);
    setShowExamples(false);
    toast.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  /** Kopieer een voorbeeldprompt naar het klembord. */
  async function copyExample(text: string) {
    try {
      await copyToClipboard(text);
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

  /** Kies een soort bij "Wat wil je maken?". Dezelfde soort nog eens kiezen doet niets. */
  function handleKind(clicked: PromptKind) {
    // Nog eens op de gekozen soort klikken zet hem uit: zonder soort kiest de
    // AI zelf uit alle frameworks. Een aparte knop daarvoor is er niet meer.
    const next = clicked === kind ? null : clicked;
    setKind(next);
    setVariantOn(true);
    resetDownstream(); // andere soort = andere frameworks, het oude advies vervalt
  }

  function handleBeeldStijl(next: BeeldStijl) {
    if (next === beeldStijl) return;
    setBeeldStijlState(next);
    try {
      localStorage.setItem(BEELD_STIJL_KEY, next);
    } catch {
      // Zonder opslag geldt de keuze alleen voor nu.
    }
    resetDownstream();
  }

  function setVoorbeeld(next: Voorbeeld | null) {
    setVoorbeeldState(next);
    writeVoorbeeld(next);
  }

  /**
   * Opent de bestandskeuze voor een voorbeeldbeeld. Synchroon in de klik, anders
   * houdt de browser het venster tegen; daarom staat het invoerveld hier en niet
   * in VoorbeeldStijl, die er bij de eerste klik nog niet is.
   */
  function kiesVoorbeeld() {
    handleBeeldStijl('voorbeeld');
    voorbeeldInput.current?.click();
  }

  /** Een beeld gekozen: verkleinen, de stijl laten lezen en die tonen. */
  async function handleVoorbeeldBestand(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Kies een afbeelding, zoals een jpg of png.');
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await fileToJpegDataUrl(file);
    } catch {
      toast.error('Dit beeld kan de browser niet openen. Probeer een jpg of png.');
      return;
    }
    setVoorbeeldBezig(true);
    setVoorbeeldState({ naam: '', tekst: '', beeld: dataUrl });
    const res = await readImageStyle(dataUrl);
    setVoorbeeldBezig(false);
    if ('error' in res) {
      toast.error(res.error);
      setVoorbeeld(voorbeeld);
      return;
    }
    setVoorbeeld({ naam: res.naam, tekst: res.stijlTekst, beeld: dataUrl });
    resetDownstream();
  }

  function handleVariant(on: boolean) {
    if (on === variantOn) return;
    setVariantOn(on);
    resetDownstream();
  }

  /**
   * Skill kiest geen framework: de Skill Creator onder Wat wil je bereiken? heeft
   * een eigen bouwer. Wat de gebruiker hier typte, gaat mee als eerste antwoord.
   */
  function openSkillCreator() {
    navigate('/genereren', { state: { skillContext: ownPrompt.trim() } });
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
      toast.error(kind === 'image' ? 'Beschrijf eerst het beeld.' : 'Plak eerst je eigen prompt.');
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
        projectContext: await resolveProjectContext(promptText),
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
    clearKeuzes();
    setUnclearReason(null);
    // Nieuw framework = een nieuwe "wat mist nog"-lus; oude toelichting vervalt.
    setClarification('');
    setClarifyOpen(false);
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
    if (beeld) loadKeuzes(chosen);
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
        // Bij een afbeelding is het project de stijl, en die gaat via `beeld` mee.
        beeld,
        projectContext: beeld ? undefined : await resolveProjectContext(promptText),
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
        clearKeuzes();
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
        promptContent: promptText || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: answers,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
        beeld,
        projectContext: beeld ? undefined : await resolveProjectContext(promptText),
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
      onResult(res, technique, {
        kind,
        variantOn,
        beeldStijl,
        pickedByKind,
        recommendations,
        techniqueId: technique.id,
        prefill,
        answers,
        fieldMeta,
        keuzes,
      });
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
      className="animate-fade-in flex items-start gap-3 rounded-xl bg-nadruk/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200"
    >
      <HelpCircle size={18} className="mt-0.5 shrink-0 text-nadruk" />
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
                  : 'Kies niets, dan kiest de AI het framework dat bij je tekst past.\nSkill en Afbeelding kies je zelf.'
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
                      'flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[0.9375rem] font-semibold transition-colors',
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
            <Lightbulb size={16} className="text-nadruk" />
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
              Voorbeeldprompts uit de praktijk. Klik op "Gebruik" om er een in het invoerveld te
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
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-rijksblauw-600 dark:text-rijksblauw-300">
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
          {/* Bij Afbeelding gaat een project alleen mee als stijl; de knop staat dan
              bij "Uit een project", onder de stijlkeuze. */}
          {kind !== 'image' &&
            renderProjectContext?.({
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

          {/* Bij Afbeelding: welke stijl vast meegaat. Uit een project gebruikt de
              projectinstructie van het project dat bij Context is gekozen. */}
          {kind === 'image' && (
            <div className="border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Welke stijl?
                </span>
                <div
                  role="radiogroup"
                  aria-label="Welke stijl?"
                  className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
                >
                  {BEELD_STIJLEN.map((option) => {
                    const active = beeldStijl === option.value;
                    const detail =
                      option.value === 'project' && projectStijl
                        ? projectStijl.name
                        : option.value === 'voorbeeld' && voorbeeld?.naam
                          ? voorbeeld.naam
                          : option.detail;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleBeeldStijl(option.value)}
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
                          <span className="block break-words text-xs text-slate-500 dark:text-slate-400">
                            {detail}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {beeldStijl === 'project' && (
                <div className="mt-2.5">
                  {!projectStijl && (
                    <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                      Kies het project met je beeldstijl. Tot je dat doet, gaat er geen vaste stijl
                      mee.
                    </p>
                  )}
                  {renderProjectContext?.({
                    text: ownPrompt,
                    stripMention: () => setOwnPrompt(ownPrompt.replace(/@$/, '')),
                    label: 'Project kiezen',
                    instructionOnly: true,
                    info:
                      'De projectinstructie is je beeldstijl: illustratie of foto, de kleuren met hun code en wat er altijd in moet of nooit in mag. Elk beeld uit dit project krijgt die stijl, met een ander onderwerp.\nBronbestanden gaan bij een beeld niet mee.',
                  })}
                </div>
              )}
              {beeldStijl === 'voorbeeld' && (
                <VoorbeeldStijl
                  voorbeeld={voorbeeld}
                  bezig={voorbeeldBezig}
                  onKies={kiesVoorbeeld}
                  onTekst={(tekst) => setVoorbeeld(voorbeeld ? { ...voorbeeld, tekst } : { naam: '', tekst })}
                  onWis={() => setVoorbeeld(null)}
                  onBewaar={onSaveStyleProject ? () => setBewaarStijlOpen(true) : undefined}
                />
              )}
              {onSaveStyleProject && voorbeeld && (
                <BewaarStijlDialog
                  open={bewaarStijlOpen}
                  voorbeeldNaam={voorbeeld.naam}
                  voorbeeldTekst={voorbeeld.tekst}
                  ai={{ provider: settings.provider, model: settings.model }}
                  onClose={() => setBewaarStijlOpen(false)}
                  onSave={async (name, instructions) => {
                    const ok = await onSaveStyleProject(name, instructions);
                    // Het nieuwe project hangt nu aan: vanaf hier geldt die stijl.
                    if (ok) handleBeeldStijl('project');
                    return ok;
                  }}
                />
              )}
              <input
                ref={voorbeeldInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleVoorbeeldBestand(file);
                }}
              />
            </div>
          )}

          {/* Bij Afbeelding een eigen kop boven het tekstvak. Na een voorbeeldbeeld
              met zijn analyse was niet meer te zien dat hier je eigen wens hoort:
              eerst de stijl, dan wat er op het beeld moet. */}
          {kind === 'image' && (
            <div className="border-t-2 border-rijksblauw-100 bg-white px-3.5 pt-3.5 dark:border-rijksblauw-500/30 dark:bg-slate-800">
              <label
                htmlFor="own-prompt-input"
                className="flex items-center gap-1.5 text-base font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
              >
                <Pencil size={16} aria-hidden="true" />
                Wat moet er op je beeld?
              </label>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {beeld && beeld.stijl !== 'vrij'
                  ? 'De stijl staat hierboven. Beschrijf hier het onderwerp en waar het beeld voor is.'
                  : 'Beschrijf het onderwerp, de stijl en waar het beeld voor is.'}
              </p>
            </div>
          )}
          <textarea
            id="own-prompt-input"
            className="block min-h-[6.5rem] w-full resize-y border-0 bg-white px-3.5 py-3 text-[0.9375rem] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            value={ownPrompt}
            placeholder={
              kind === 'image' && beeld && beeld.stijl !== 'vrij'
                ? 'Bijv. een vuurtoren aan zee bij storm, voor de kop van onze nieuwsbrief.'
                : kindOption
                ? (!variantOn && kindOption.placeholderOff) || kindOption.placeholder
                : 'Plak hier de prompt of stel hier je vraag. Typ @ voor een project.'
            }
            onChange={(e) => {
              setOwnPrompt(e.target.value);
              resetDownstream(); // gewijzigde prompt = aanbeveling en analyse vervallen
            }}
          />

        </div>
        <VerantwoordGebruikHint text={promptText} />
        {kind === 'image' && <BeeldSpiekkaart onVoorbeeld={kiesVoorbeeld} />}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {kind === 'skill'
              ? 'Opzet: Skill Creator'
              : kind === 'image' && !directFramework
                ? 'Nog geen beeldprompt beschikbaar'
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
              disabled={recommending || prefilling || !promptText || (kind === 'image' && !directFramework)}
            >
              {kind === 'skill' ? (
                <>
                  Verder in de Skill Creator <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <Sparkles size={20} className="text-nadruk-vast" />
                  {kind === 'image' ? 'Maak mijn beeldprompt' : 'Maak mijn prompt'}
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
                beeld ? 'De AI heeft je beeld alvast ingevuld' : 'De AI heeft je prompt alvast ingevuld'
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

            {beeld && beeld.stijl !== 'vrij' && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <strong className="font-semibold text-slate-800 dark:text-slate-100">
                  {beeld.stijl === 'voorbeeld' ? 'Voorbeeld: ' : 'Vaste stijl: '}
                </strong>
                {beeld.stijl === 'rijkshuisstijl'
                  ? 'Pleinhuisstijl. Die gaat altijd mee; jij kiest het onderwerp.'
                  : beeld.stijl === 'voorbeeld'
                    ? `${voorbeeld?.naam || 'je beeld'}. Je nieuwe beeld gaat daarop lijken; wat jij vraagt, gaat voor.`
                    : `de stijl van ${projectStijl?.name ?? 'je project'}. Die gaat altijd mee; jij kiest het onderwerp.`}
              </p>
            )}

            <section className="opl-card p-5">
              <FollowUpQuestions
                projectContext={beeld ? undefined : projectContext}
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
                finishLabel="Bouw prompt"
                heading={<StepHeading title="Kijk na en vul aan" />}
                showLetters={false}
                askIfEmpty={prefill.fields.length > 0}
                choices={beeld ? keuzes : null}
                choicesLoading={Boolean(beeld) && keuzesLoading}
                onApplyChoice={
                  beeld
                    ? (id, option, current) => {
                        const fields = technique.follow_up_questions;
                        const field = fields.find((f) => f.id === id);
                        if (!field) return Promise.resolve(null);
                        return applyImageOption({
                          field: { id, label: field.label },
                          currentValue: current[id] ?? '',
                          keuze: option,
                          ownPrompt: promptText,
                          siblings: fields
                            .filter((f) => f.id !== id && (current[f.id] ?? '').trim())
                            .map((f) => ({ label: f.label, value: current[f.id] ?? '' })),
                          beeld,
                          preferredProvider: settings.provider,
                          preferredModel: settings.model,
                        });
                      }
                    : undefined
                }
              />

              {/* Een nieuwe invulronde met extra uitleg: handig als de AI op het
                  verkeerde spoor zit. */}
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
                        className="opl-input min-h-[5rem] resize-y text-[0.9375rem]"
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
            <Sparkles size={20} className="text-nadruk-vast" /> Bouw prompt
          </button>
        </div>
      )}
    </div>
  );
}
