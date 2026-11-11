import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import type { ProjectContextSlot } from '@/components/optimizer/ProjectContextPicker';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
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
import { stripMarkdown, copyToClipboard } from '@/lib/utils';
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
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/banner';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/divider';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/page';
import '@nldd/design-system/radio-button';
import '@nldd/design-system/sheet';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';
import '@nldd/design-system/toggle-button';
import '@nldd/design-system/toggle-button-group';
import '@nldd/design-system/tooltip';
import '@nldd/design-system/top-title-bar';

/**
 * De stand van de bouwer op het moment dat de prompt werd gebouwd: het gekozen
 * framework met de velden zoals de gebruiker ze naliet. Met "Velden aanpassen"
 * onder het resultaat komt de bouwer precies zo terug.
 */
export interface OwnPromptRestore {
  kind: PromptKind | null;
  variantOn: boolean;
  sjabloonId: string | null;
  pickedByKind: boolean;
  recommendations: TechniqueRecommendation[] | null;
  techniqueId: string;
  prefill: PrefillResult | null;
  answers: Record<string, string>;
  fieldMeta: FieldMeta;
  vraagHerkomst: Record<string, VraagHerkomst>;
}

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
  { label: string; icon: string; hint: string; placeholder: string; placeholderOff?: string }
> = {
  text: {
    label: 'Tekst',
    icon: 'file-text',
    hint: 'Een brief, nota, verslag of samenvatting.',
    placeholder:
      'Bijv. zet mijn ruwe vergaderaantekeningen om in een verslag met besluiten, actiepunten en open vragen.',
  },
  code: {
    label: 'Code',
    icon: 'code',
    hint: 'Vibecoden: een tool, script of pagina laten bouwen, of bestaande code laten aanpassen.',
    placeholder:
      'Bijv. een webpagina die een Excel-export uit het zaaksysteem inleest en per afdeling de open zaken telt.',
    placeholderOff:
      'Bijv. de export in ons rapportagescherm negeert het actieve filter; alleen de gefilterde rijen moeten mee.',
  },
  dashboard: {
    label: 'Dashboard',
    icon: 'chart-bar-x-axis',
    hint: 'Cijfers, grafieken en filters op één scherm.',
    placeholder:
      'Bijv. een overzicht van de doorlooptijden van Woo-verzoeken per directie, met een filter op kwartaal.',
  },
  agent: {
    label: 'Agent',
    icon: 'ai',
    hint: 'Een AI die zelfstandig een taak in stappen uitvoert.',
    placeholder:
      'Bijv. een agent die binnenkomende Woo-verzoeken leest, per onderwerp sorteert en een ontvangstbevestiging klaarzet.',
  },
  skill: {
    label: 'Skill',
    icon: 'building-blocks',
    hint: 'Een vaste werkwijze die een AI-assistent elke keer opnieuw toepast. Je bouwt hem verder in de Skill Creator.',
    placeholder:
      'Bijv. geef feedback op conceptbrieven aan burgers, elke keer volgens de schrijfwijzer van ons ministerie.',
  },
  template: {
    label: 'Routekaart',
    icon: 'path',
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
  restore,
}: OwnPromptOptimizerProps) {
  const { techniques, techniqueById } = useReferenceData();
  const navigate = useNavigate();
  const frameworks = techniques.filter(isContextPrompt);

  // "Wat wil je maken?": de gekozen soort (null = de AI kiest uit alles) en de
  // stand van de schakelaar eronder. Die staat bij een nieuwe soort weer aan,
  // want aan is de aanbevolen stand (iets nieuws, eerst een prototype).
  const [kind, setKind] = useState<PromptKind | null>(restore?.kind ?? null);
  const [variantOn, setVariantOn] = useState(restore?.variantOn ?? true);
  const variant = kind ? KIND_VARIANTS[kind] : undefined;
  const candidates = frameworksForKind(frameworks, kind, variantOn);
  const kindOption = kind ? KIND_OPTIONS[kind] : null;
  // Bij Sjabloon kiest de gebruiker zelf welk sjabloon; er valt niets te wegen.
  const [sjabloonId, setSjabloonId] = useState<string | null>(restore?.sjabloonId ?? null);
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
  const [pickedByKind, setPickedByKind] = useState(restore?.pickedByKind ?? false);

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
  const analysisRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLElement>(null);

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
    clearSjabloonDraft();
    setVraagHerkomst({});
    resetDownstream();
    setComposerOpen(true);
    setShowExamples(false);
    notify.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  /** Kopieer een voorbeeldprompt naar het klembord. */
  async function copyExample(text: string) {
    try {
      await copyToClipboard(text);
      notify.success('Voorbeeld gekopieerd.');
    } catch {
      notify.error('Kopiëren mislukt.');
    }
  }

  /** Zet een voorbeeldprompt direct in het invoerveld om te testen. */
  function applyExample(text: string) {
    setOwnPrompt(text);
    resetDownstream(); // nieuwe inhoud = oude aanbeveling/analyse vervalt
    setShowExamples(false);
    notify.success('Voorbeeld ingevuld.');
  }

  // Loopt het invullen van de vragen uit de voorbereide tekst?
  const [vragenVullen, setVragenVullen] = useState(false);
  // Waar elk antwoord vandaan komt na "Vul de vragen in uit je tekst".
  const [vraagHerkomst, setVraagHerkomst] = useState<Record<string, VraagHerkomst>>(
    restore?.vraagHerkomst ?? {},
  );
  // Na "Velden invullen" bij de routekaart: per veld een voorgestelde aanvulling
  // van de AI, die de gebruiker toevoegt of verwerpt. null = wordt nog gezocht.
  const [aanvullingen, setAanvullingen] = useState<Record<string, string> | null>({});

  /**
   * Routekaart: haal uit de voorbereide tekst de antwoorden op de vragen. Wat de
   * gebruiker al had ingevuld blijft staan; een vraag waar de tekst niets over
   * zegt blijft leeg.
   */
  async function handleVragenUitTekst() {
    if (!sjabloon || vragenVullen || recommending || prefilling) return;
    if (!ownPrompt.trim()) {
      notify.error('Plak eerst je voorbereide tekst hierboven.');
      return;
    }
    setVragenVullen(true);
    try {
      const { antwoorden, herkomst, onduidelijk } = await vragenUitVoorbereiding({
        technique: sjabloon,
        tekst: ownPrompt.trim(),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (onduidelijk) {
        notify(onduidelijk, { icon: 'ℹ️' });
        return;
      }
      const nieuw = Object.entries(antwoorden).filter(([id]) => !sjabloonAntwoorden[id]?.trim());
      if (nieuw.length === 0) {
        notify('Je tekst gaf geen antwoord op de vragen die nog leeg waren.', { icon: 'ℹ️' });
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
      notify.success(
        leeg > 0
          ? `${nieuw.length} vragen ingevuld uit je tekst. Kijk ze na; ${leeg} vragen zijn nog leeg.`
          : `${nieuw.length} vragen ingevuld uit je tekst. Kijk na wat de AI heeft aangevuld en klik dan op Velden invullen.`,
      );
    } catch {
      notify.error('Vragen invullen uit je tekst mislukt. Probeer het opnieuw.');
    } finally {
      setVragenVullen(false);
    }
  }

  /**
   * Kies een soort bij "Wat wil je maken?". Dezelfde soort nog eens kiezen doet
   * niets; "AI kiest" (null) zet de soort uit, dan kiest de AI zelf uit alle
   * frameworks.
   */
  function handleKind(next: PromptKind | null) {
    if (next === kind) return;
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
    if (recommending || prefilling) return;
    if (kind === 'template' && !sjabloon) {
      notify.error('Er zijn nog geen sjablonen. Vraag een beheerder er één toe te voegen.');
      return;
    }
    if (!promptText) {
      notify.error(sjabloon ? 'Beantwoord eerst een paar vragen.' : 'Plak eerst je eigen prompt.');
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
      if (res.error) notify(res.error, { icon: '⚠️' });
      // Geen duidelijke match: geen lijst tonen, maar de trefwoorden laten beslissen.
      // Is de tekst echt onduidelijk, dan zegt het invullen dat hierna zelf.
      keuze =
        res.recommendations[0]?.id ??
        localFrameworkGuess(ownPrompt, candidates)[0]?.id ??
        candidates[0]?.id;
    } catch {
      notify.error('De AI kon je tekst niet verwerken. Probeer het opnieuw.');
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
      if (res.error) notify(res.error, { icon: 'ℹ️' });
    } catch {
      notify.error('Voor-invullen mislukt. Probeer het opnieuw.');
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
      onResult(res, technique, {
        kind,
        variantOn,
        sjabloonId,
        pickedByKind,
        recommendations,
        techniqueId: technique.id,
        prefill,
        answers,
        fieldMeta,
        vraagHerkomst,
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Optimaliseren mislukt');
    } finally {
      setGenerating(false);
    }
  }

  if (frameworks.length === 0) {
    return (
      <nldd-inline-dialog
        icon="info-circle"
        text="Er zijn nog geen prompt frameworks beschikbaar"
        supporting-text="Vraag een beheerder er één toe te voegen."
      ></nldd-inline-dialog>
    );
  }

  // De melding bij onduidelijke invoer staat bij het tekstvak als dat open is, anders
  // onder de velden (dan kwam ze van het bouwen zelf).
  const unclearBlock = unclearReason && (
    <nldd-banner
      variant="warning"
      icon="question-mark-circle"
      text="Je tekst is nog niet duidelijk genoeg"
      supporting-text={stripMarkdown(unclearReason)}
    ></nldd-banner>
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

  const ownPromptShort = promptText.length > 160 ? `${promptText.slice(0, 160).trimEnd()}…` : promptText;

  return (
    <nldd-container ref={topRef} gap="16">
      {!composerOpen ? (
        <nldd-box role="region" aria-label="Jouw tekst">
          <nldd-container padding-inline="16" padding-block="8" layout="row" gap="12" vertical-alignment="center">
            <nldd-text color="secondary">
              <strong>Jouw tekst: </strong>
              {ownPromptShort}
            </nldd-text>
            <nldd-button
              appearance="neutral-transparent"
              text="Aanpassen"
              onClick={() => setComposerOpen(true)}
              disabled={recommending || prefilling || generating || undefined}
            ></nldd-button>
          </nldd-container>
        </nldd-box>
      ) : (
        <nldd-container>
          {header}
          <nldd-form>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void handleRecommend();
              }}
            >
              {unclearBlock}
              <nldd-form-field label="Wat wordt het?">
                <KindPicker kind={kind} onKind={handleKind} />
                <nldd-form-field-help-text>
                  {kindOption
                    ? kindOption.hint
                    : 'Kies niets, dan kiest de AI het framework dat bij je tekst past. Skill en Routekaart kies je zelf.'}
                </nldd-form-field-help-text>
              </nldd-form-field>

                {/* Vervolgkeuze bij Code en Dashboard: twee opties die elk een eigen
                    framework aanwijzen. Zichtbaar zodra de soort gekozen is, zodat je
                    ziet dát er een keuze is in plaats van hem te moeten ontdekken. */}
                {variant && (
                  <nldd-form-field label={variant.question}>
                    <nldd-list type="radiogroup" appearance="box-base" accessible-label={variant.question}>
                      {[
                        { on: true, option: variant.on },
                        { on: false, option: variant.off },
                      ].map(({ on, option }) => (
                        <RadioRow
                          key={option.modality}
                          checked={variantOn === on}
                          disabled={recommending || prefilling}
                          text={option.label}
                          supportingText={option.detail}
                          onCheck={() => handleVariant(on)}
                        />
                      ))}
                    </nldd-list>
                  </nldd-form-field>
                )}

                {/* Bij Routekaart: welk vast sjabloon. Alleen als er iets te kiezen
                    valt; met één sjabloon zegt de knop zelf al wat je krijgt. */}
                {kind === 'template' && candidates.length !== 1 && (
                  <nldd-form-field label="Welk sjabloon?">
                    {candidates.length === 0 ? (
                      <nldd-text size="sm" color="secondary">
                        Er zijn nog geen sjablonen. Vraag een beheerder er één toe te voegen.
                      </nldd-text>
                    ) : (
                      <nldd-list type="radiogroup" appearance="box-base" accessible-label="Welk sjabloon?">
                        {candidates.map((t) => (
                          <RadioRow
                            key={t.id}
                            checked={sjabloon?.id === t.id}
                            disabled={recommending || prefilling}
                            text={t.name}
                            supportingText={t.description || undefined}
                            onCheck={() => {
                              if (sjabloon?.id === t.id) return;
                              setSjabloonId(t.id);
                              clearSjabloonDraft();
                              setVraagHerkomst({});
                              resetDownstream();
                            }}
                          />
                        ))}
                      </nldd-list>
                    )}
                  </nldd-form-field>
                )}

              {renderProjectContext?.({
                text: ownPrompt,
                stripMention: () => setOwnPrompt(ownPrompt.replace(/@$/, '')),
              })}

              {/* Routekaart: eerst het vak voor wat je al hebt voorbereid, dan de
                  vragen van het sjabloon (onder het tekstvak). */}
              <nldd-form-field
                label={sjabloon ? 'Heb je al iets voorbereid?' : 'Jouw tekst'}
                optional={sjabloon ? true : undefined}
                supporting-label={
                  sjabloon
                    ? 'Plak hier wat je al hebt, bijvoorbeeld een uitwerking uit een andere chat, een planning of aantekeningen. De AI haalt eruit wat bij de vragen hoort en vult aan; per vraag zie je wat uit je tekst komt en wat de AI heeft bedacht.'
                    : undefined
                }
              >
                  <TextArea
                    value={ownPrompt}
                    onValue={(v) => {
                      setOwnPrompt(v);
                      resetDownstream(); // gewijzigde prompt = aanbeveling en analyse vervallen
                    }}
                    rows={4}
                    resize="vertical"
                    placeholder={
                      sjabloon
                        ? 'Plak hier je voorbereide tekst.'
                        : kindOption
                          ? (!variantOn && kindOption.placeholderOff) || kindOption.placeholder
                          : 'Plak hier de prompt of stel hier je vraag. Typ @ voor een project.'
                    }
                  />
                  <nldd-form-field-help-text>
                    {kind === 'skill'
                      ? 'Opzet: Skill Creator'
                      : kind === 'template' && !sjabloon
                        ? 'Nog geen sjabloon beschikbaar'
                        : directFramework
                          ? `Opzet: ${directFramework.name}`
                          : `De AI kiest uit ${candidates.length} frameworks`}
                  </nldd-form-field-help-text>
                {/* Voorbeelden, en Opschonen als er iets te wissen valt. */}
                <nldd-container layout="wrap" gap="4">
                  <nldd-button
                    appearance="neutral-transparent"
                    size="sm"
                    start-icon="lightbulb"
                    text="Voorbeelden"
                    accessible-label="Bekijk voorbeeldprompts"
                    popup-type="dialog"
                    expanded={showExamples || undefined}
                    onClick={() => setShowExamples(true)}
                  ></nldd-button>
                  {(ownPrompt.trim() || promptText) && (
                    <nldd-button
                      appearance="neutral-transparent"
                      size="sm"
                      start-icon="delete"
                      text="Opschonen"
                      accessible-label="Wis je prompt en begin opnieuw"
                      onClick={handleClearAll}
                    ></nldd-button>
                  )}
                </nldd-container>
              </nldd-form-field>

                {/* De vragen van het sjabloon, elk met een eigen vak. Bovenaan de knop
                    die ze invult uit de voorbereide tekst hierboven. */}
                {sjabloon && (
                  <nldd-box>
                    <nldd-container padding="16" gap="8">
                      <nldd-title heading-level={3} size={6} text="De vragen van de routekaart">
                        <nldd-tooltip
                          slot="end"
                          text="Plak eerst je voorbereide tekst hierboven"
                          timing={ownPrompt.trim() ? 'never' : undefined}
                        >
                          <nldd-button
                            appearance="secondary"
                            size="sm"
                            start-icon="arrow-down"
                            text="Vul de vragen in uit je tekst"
                            loading={vragenVullen || undefined}
                            loading-text="Vragen invullen"
                            onClick={() => void handleVragenUitTekst()}
                          ></nldd-button>
                        </nldd-tooltip>
                      </nldd-title>
                      <nldd-text size="xs" color="secondary">
                        Sta bij elke vraag even stil en schrijf op wat je al weet. Met Velden invullen zet
                        de AI je antwoorden in de velden van het sjabloon, laat open wat je niet gaf en
                        vraagt daar naar.
                      </nldd-text>
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
                    </nldd-container>
                  </nldd-box>
                )}

              <VerantwoordGebruikHint text={promptText} />

              {/* Denken en Internet gelden voor het invullen en bouwen. */}
              <nldd-container layout="wrap" gap="4" vertical-alignment="center">
                {toggles}
              </nldd-container>

              <nldd-form-actions>
                <nldd-button-group>
                  <nldd-button
                    appearance="primary"
                    type="submit"
                    loading={recommending || prefilling || undefined}
                    loading-text="De AI is bezig"
                    start-icon={kind === 'skill' ? undefined : 'sparkles'}
                    end-icon={kind === 'skill' ? 'arrow-right' : undefined}
                    text={
                      kind === 'skill'
                        ? 'Verder in de Skill Creator'
                        : kind === 'template'
                          ? 'Velden invullen'
                          : 'Maak mijn prompt'
                    }
                  ></nldd-button>
                </nldd-button-group>
              </nldd-form-actions>
            </form>
          </nldd-form>
        </nldd-container>
      )}

      {/* De AI kiest en vult in: de stappen, en de velden die vollopen. */}
      {(recommending || prefilling) && (
        <MakeProgress
          stage={recommending ? (searchPhase === 'analyzing' ? 'lezen' : 'kiezen') : 'invullen'}
          aanpak={technique?.name}
        />
      )}

      {/* Anker voor het laad-/voor-invulblok; hier scrollen we na een keuze naartoe. */}
      <nldd-container ref={analysisRef} gap="16">
        {/* De AI ontleedt de prompt en vult de velden voor. De velden lopen één
            voor één vol terwijl de modellen werken. */}
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

        {/* Laadscherm tijdens het genereren van de uiteindelijke prompt. */}
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
          <nldd-container gap="16">
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
              <nldd-banner
                variant="warning"
                text="Voor-invullen is niet gelukt"
                supporting-text="De AI-dienst was even niet bereikbaar. Probeer het opnieuw, of vul de velden hieronder zelf in."
              >
                <nldd-button
                  slot="actions"
                  appearance="secondary"
                  start-icon="refresh"
                  text="Opnieuw proberen"
                  onClick={() => void runPrefill(technique, clarification)}
                ></nldd-button>
              </nldd-banner>
            )}

            <PrefillSources prefill={prefill} />

            {isSjabloon(technique) && (
              <nldd-container layout="row" gap="8" vertical-alignment="center">
                {aanvullingen === null && <nldd-activity-indicator size="16" timing="instant"></nldd-activity-indicator>}
                <nldd-text size="sm" color="secondary">
                  {aanvullingen === null
                    ? 'De AI kijkt nog of er per veld iets aan te vullen is.'
                    : Object.keys(aanvullingen).length > 0
                      ? `De AI stelt bij ${Object.keys(aanvullingen).length} ${
                          Object.keys(aanvullingen).length === 1 ? 'veld' : 'velden'
                        } een aanvulling voor; die staat oranje onder het veld. Voeg toe wat klopt, de rest verwerp je.`
                      : 'De AI had niets aan te vullen. Wat je leeg laat, blijft een plaatshouder in de prompt.'}
                </nldd-text>
              </nldd-container>
            )}

            <nldd-container gap="16">
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
                  <>
                    <nldd-divider></nldd-divider>
                    <nldd-container gap="8">
                      <nldd-button
                        appearance="neutral-transparent"
                        start-icon="refresh"
                        text="Opnieuw laten invullen met een toelichting"
                        expanded={clarifyOpen || undefined}
                        onClick={() => setClarifyOpen((v) => !v)}
                      ></nldd-button>
                      {clarifyOpen && (
                        <>
                          <nldd-form-field label="Jouw toelichting">
                            <TextArea
                              value={clarification}
                              onValue={setClarification}
                              rows={3}
                              resize="vertical"
                              placeholder="Bijv. de doelgroep is nieuwe medewerkers, de toon is informeel"
                              disabled={prefilling || undefined}
                            />
                          </nldd-form-field>
                          <nldd-button-group>
                            <nldd-button
                              appearance="secondary"
                              start-icon="refresh"
                              text="Velden opnieuw invullen"
                              onClick={() => void runPrefill(technique, clarification)}
                              disabled={prefilling || generating || !clarification.trim() || undefined}
                            ></nldd-button>
                          </nldd-button-group>
                        </>
                      )}
                    </nldd-container>
                  </>
                )}
            </nldd-container>
          </nldd-container>
        )}
      </nldd-container>

      {!composerOpen && unclearBlock}

      {/* Denken, Internet en bouwen op één regel, net als op Technieken. */}
      {prefill && !prefilling && !generating && (
        <nldd-container layout="wrap" gap="6" vertical-alignment="center" horizontal-alignment="right">
          {toggles}
          <nldd-button appearance="primary" size="lg" start-icon="sparkles" text="Bouw prompt" onClick={handleGenerate}></nldd-button>
        </nldd-container>
      )}

      <ExamplesSheet
        open={showExamples}
        onClose={() => setShowExamples(false)}
        onCopy={(text) => void copyExample(text)}
        onApply={applyExample}
      />
    </nldd-container>
  );
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

/** One choice in an nldd-list type="radiogroup": a row with a name and a line under it. */
function RadioRow({
  checked,
  disabled,
  text,
  supportingText,
  onCheck,
}: {
  checked: boolean;
  disabled?: boolean;
  text: string;
  supportingText?: string;
  onCheck: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => {
    if (e.detail?.checked) onCheck();
  });
  return (
    <nldd-list-item ref={ref} radio checked={checked || undefined} disabled={disabled || undefined}>
      <nldd-cell vertical-alignment="top">
        <nldd-radio-button decorative checked={checked || undefined}></nldd-radio-button>
      </nldd-cell>
      <nldd-spacer-cell size="12"></nldd-spacer-cell>
      <nldd-text-cell text={text} supporting-text={supportingText}></nldd-text-cell>
    </nldd-list-item>
  );
}

/** "Wat wil je maken?": "AI kiest" plus de soorten, één keuze tegelijk. */
function KindPicker({ kind, onKind }: { kind: PromptKind | null; onKind: (kind: PromptKind | null) => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ selected: boolean; value: string }>>(ref, 'change', (e) => {
    if (!e.detail?.selected) return;
    onKind(e.detail.value === 'auto' ? null : (e.detail.value as PromptKind));
  });
  return (
    <nldd-toggle-button-group
      ref={ref}
      type="radio"
      accessible-label="Wat wordt het?"
    >
      {[null, ...PROMPT_KINDS].map((k) => {
        const option = k ? KIND_OPTIONS[k] : { label: 'AI kiest', icon: 'sparkles' };
        return (
          <nldd-toggle-button
            key={k ?? 'auto'}
            value={k ?? 'auto'}
            icon={option.icon}
            text={option.label}
            selected-icon="check-mark"
            selected={kind === k || undefined}
          ></nldd-toggle-button>
        );
      })}
    </nldd-toggle-button-group>
  );
}

/**
 * Voorbeeldprompts uit het rijkswerk in een zijpaneel. De prompt zelf staat niet
 * in de lijst (dan wordt die onleesbaar lang); wie hem wil lezen, zet hem met
 * "Gebruik" in het veld.
 */
function ExamplesSheet({
  open,
  onClose,
  onCopy,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onCopy: (text: string) => void;
  onApply: (text: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'close', () => {
    if (open) onClose();
  });
  return createPortal(
    <nldd-sheet ref={ref} open={open || undefined} placement="right" width="36rem" accessible-label="Voorbeeldprompts">
      <nldd-page>
        <nldd-top-title-bar slot="header" text="Voorbeeldprompts" heading-level={2} dismiss-text="Sluit"></nldd-top-title-bar>
        <nldd-simple-section>
          <nldd-text size="sm" color="secondary">
            Voorbeeldprompts uit het rijkswerk. Kies er een om hem in het invoerveld te zetten, en pas hem
            aan naar je eigen dossier. Met het kopieericoon zet je hem op het klembord.
          </nldd-text>
          <nldd-spacer size="12"></nldd-spacer>
          <nldd-list accessible-label="Voorbeeldprompts" appearance="box-tinted">
            {PROMPT_EXAMPLES.map((ex) => {
              const category = PROMPT_CATEGORIES[ex.category];
              return (
                <nldd-list-item key={ex.title}>
                  <nldd-list-item-segment button width="full" onClick={() => onApply(ex.prompt)}>
                    <nldd-icon-cell icon={category.iconName} size="20" color="accent" vertical-alignment="top"></nldd-icon-cell>
                    <nldd-spacer-cell size="12"></nldd-spacer-cell>
                    <nldd-text-cell overline={category.label} text={ex.title} supporting-text={ex.subtitle}></nldd-text-cell>
                  </nldd-list-item-segment>
                  <nldd-list-item-segment
                    button
                    accessible-label={`Kopieer voorbeeld: ${ex.title}`}
                    onClick={() => onCopy(ex.prompt)}
                  >
                    <nldd-icon-cell icon="copy" size="20" color="secondary"></nldd-icon-cell>
                  </nldd-list-item-segment>
                </nldd-list-item>
              );
            })}
          </nldd-list>
        </nldd-simple-section>
      </nldd-page>
    </nldd-sheet>,
    document.body,
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
