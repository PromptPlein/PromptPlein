import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  Check,
  Compass,
  Eraser,
  Loader2,
  Sparkles,
} from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import TechniqueChooser from '@/components/optimizer/TechniqueChooser';
import TechniqueAdvisor from '@/components/optimizer/TechniqueAdvisor';
import FollowUpQuestions, { type FieldMeta } from '@/components/optimizer/FollowUpQuestions';
import PersonaBuilder from '@/components/optimizer/PersonaBuilder';
import FewShotBuilder from '@/components/optimizer/FewShotBuilder';
import MetaBuilder from '@/components/optimizer/MetaBuilder';
import PromptExamplePicker from '@/components/optimizer/PromptExamplePicker';
import VerificationBuilder from '@/components/optimizer/VerificationBuilder';
import StepBackBuilder from '@/components/optimizer/StepBackBuilder';
import RubricBuilder from '@/components/optimizer/RubricBuilder';
import SkillBuilder from '@/components/optimizer/SkillBuilder';
import DocumentUpload from '@/components/optimizer/DocumentUpload';
import InterviewFlow from '@/components/optimizer/InterviewFlow';
import SjabloonVragen from '@/components/optimizer/SjabloonVragen';
import InfoDot from '@/components/common/InfoDot';
import OptimizableTextarea from '@/components/common/OptimizableTextarea';
import StepHeading from '@/components/optimizer/StepHeading';
import OptimizingLoader from '@/components/optimizer/OptimizingLoader';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';
import useThinking from '@/lib/useThinking';
import useWebSearch from '@/lib/useWebSearch';
import type { StreamStatus } from '@/lib/ndjsonStream';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  aanvullingenVoorVelden,
  generatePrompt,
  prefillFields,
  voegAanvullingToe,
  vragenUitVoorbereiding,
  type VraagHerkomst,
} from '@/services/optimizeService';
import { trackEvent } from '@/services/analyticsService';
import {
  getAiSettings,
  getChatSettingsCached,
  overheidsContext,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
} from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import {
  contextExample,
  isContextPrompt,
  isSjabloon,
  isSkillCreator,
  sjabloonContextTekst,
  structureFormat,
  techniqueStarter,
} from '@/lib/techniques';
import { techniekKaart } from '@/lib/techniekDoelen';
import { activityIdentifier, stripMarkdown } from '@/lib/utils';
import type { SkillData } from '@/lib/skill';
import { defaultModelFor, isEnabledProvider, thinkingUnavailableReason } from '@/config/aiModels';
import type { OptimizeResult, Technique } from '@/types';

/**
 * Werken mét de prompttechnieken zelf: de volledige lijst frameworks en losse
 * technieken, en per techniek de velden die je zelf invult. Bedoeld voor de
 * training — deelnemers zien welke technieken er zijn, kiezen er één, vullen
 * hun eigen gegevens in en bouwen daar een prompt van.
 *
 * Bewust naast /genereren: die pagina kiest de techniek zélf op basis van een
 * analyse. Hier kiest de gebruiker en blijft de techniek het onderwerp.
 */
export default function TechniquesPage() {
  const { profile, user } = useAuth();
  const { techniques } = useReferenceData();

  // Denken en zoeken: dezelfde knoppen en dezelfde stand als op /genereren,
  // zodat een skill of prompt die hier wordt gebouwd er net zo gebruik van maakt.
  const [thinking, setThinking] = useThinking();
  const [thinkingUnavailable, setThinkingUnavailable] = useState<string | undefined>();
  const thinkingOn = thinking && !thinkingUnavailable;
  // Zoeken op internet: voor iedereen, zolang het in Beheer aanstaat.
  const [webSearch, setWebSearch] = useWebSearch('builder');
  const [searchAvailable, setSearchAvailable] = useState(false);
  const webSearchOn = searchAvailable && webSearch;
  // Voortgang van het bouwen voor de loader: fase en modellen.
  const [genProgress, setGenProgress] = useState<StreamStatus>({});

  // Alle invoer op deze pagina is sessie-state, bewust niet bewaard: wie de
  // pagina opent begint bij de keuze, met een schone lijst. In een training
  // gaat dit scherm van hand tot hand — dan is achtergebleven werk van de
  // vorige oefening storender dan een verloren concept.
  //
  // Waar het over gaat: optioneel startpunt. Is dit gevuld, dan vult de AI de
  // velden van de gekozen techniek alvast voor en voedt het het interview.
  const [context, setContext] = useState('');
  // Bij een sjabloon komt de context uit de vragen van het sjabloon (zie
  // SjabloonVragen); `context` is dan het vak voor wat er verder nog bij hoort.
  const [sjabloonAntwoorden, setSjabloonAntwoorden] = useState<Record<string, string>>({});
  // Loopt het invullen van de vragen uit de voorbereide tekst?
  const [vragenVullen, setVragenVullen] = useState(false);
  // Waar elk antwoord vandaan komt na "Vul de vragen in uit deze tekst".
  const [vraagHerkomst, setVraagHerkomst] = useState<Record<string, VraagHerkomst>>({});
  // Na "Klaar": per veld een voorgestelde aanvulling van de AI, die de
  // gebruiker toevoegt of verwerpt. null = er wordt nog gezocht.
  const [aanvullingen, setAanvullingen] = useState<Record<string, string> | null>({});
  const [techniqueId, setTechniqueId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Geserialiseerde output van een gespecialiseerde bouwer (Persona/Few-Shot/
  // Meta) of de conclusie van het interview. Gaat als context mee bij het bouwen.
  const [builderText, setBuilderText] = useState('');
  // De Skill Creator houdt naam en beschrijving apart bij: die gaan na het
  // bouwen als kop boven de SKILL.md-download.
  const [skillData, setSkillData] = useState<SkillData | null>(null);
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>({});
  const [prefilling, setPrefilling] = useState(false);
  // Staat het contextveld open binnen het invulblok? Bij een nieuwe techniek
  // staat het altijd open: dat je context mág meegeven moet je zien, niet
  // hoeven ontdekken. Na "Klaar" klapt het samen tot één regel, die je weer
  // kunt openen om aan te passen.
  const [editingContext, setEditingContext] = useState(true);
  // Staat de techniek-adviseur open? Die kiest niet voor je, maar vraagt door
  // tot duidelijk is welke techniek past — voor wie de lijst niet overziet.
  const [advisorOpen, setAdvisorOpen] = useState(false);
  // Staat de kiezer open terwijl er al een techniek gekozen is? Na het kiezen gaat
  // hij dicht, zodat alleen het invulblok overblijft. "Andere kiezen" opent hem
  // weer; het invulblok blijft eronder staan, zodat half werk niet verdwijnt.
  const [chooserOpen, setChooserOpen] = useState(false);

  const [optimizing, setOptimizing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [guardrailFindings, setGuardrailFindings] = useState<GuardrailFinding[] | null>(null);
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  // Versiegeschiedenis: v1 is de gebouwde prompt, elke verbeter-ronde uit de
  // Testkamer voegt er een toe. Alleen in-memory; "Opnieuw" wist de historie.
  const [versions, setVersions] = useState<OptimizeResult[]>([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const result = versions[activeVersion] ?? null;
  const [phase, setPhase] = useState<'input' | 'transition' | 'output'>('input');

  // Admin-bepaalde AI-instellingen; gebruikers kiezen niet zelf.
  const settingsRef = useRef<AiSettings>(DEFAULT_AI_SETTINGS);
  const builderRef = useRef<HTMLElement>(null);
  // Het contextveld zelf, zodat een gekozen voorbeeldprompt meteen de cursor
  // krijgt: de tekst staat er, en de gebruiker kan direct verder typen.
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const advisorRef = useRef<HTMLDivElement>(null);
  const optimizingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getAiSettings().then((s) => {
      if (!active) return;
      settingsRef.current = s;
      setThinkingUnavailable(thinkingUnavailableReason(s.provider, s.model));
    });
    // Of zoeken aanstaat, staat bij de chatinstellingen in Beheer.
    void getChatSettingsCached().then((s) => {
      if (active) setSearchAvailable(s.webSearchEnabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const technique = techniques.find((t) => t.id === techniqueId) ?? null;
  const sjabloonMode = Boolean(technique && isSjabloon(technique));
  const ChosenIcon = technique ? techniekKaart(technique).icon : null;
  // De context zoals hij naar het voor-invullen en het bouwen gaat. Bij een
  // sjabloon: de antwoorden op de vragen, elk onder zijn vraag, plus het losse vak.
  const contextText =
    technique && sjabloonMode
      ? sjabloonContextTekst(technique, sjabloonAntwoorden, context)
      : context.trim();

  /**
   * Kies een techniek: antwoorden van de vorige techniek vervallen en het
   * invulblok scrollt in beeld. Staat er al iets in "waar gaat het over", dan
   * vult de AI de velden alvast voor — anders begin je met lege velden.
   */
  function handleSelectTechnique(id: string, contextOverride?: string) {
    // Opnieuw op de actieve techniek klikken mag geen werk weggooien. Komt de
    // keuze van de adviseur, dan is er wél iets nieuws (de context uit het
    // gesprek), dus die mag de techniek opnieuw zetten.
    setChooserOpen(false);
    if (id === techniqueId && contextOverride === undefined) return;
    setTechniqueId(id);
    setAnswers({});
    setFieldMeta({});
    setBuilderText('');
    setSkillData(null);
    setSjabloonAntwoorden({});
    setVraagHerkomst({});
    setAanvullingen({});
    setUnclearReason(null);
    // Nieuwe techniek = het contextveld weer open (zie setEditingContext hierboven).
    setEditingContext(true);
    // De kiezer klapt dicht, dus het invulblok schuift omhoog: breng het in beeld.
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const chosen = techniques.find((t) => t.id === id);
    // `context` in de state is hier nog de oude waarde (setState is async), dus
    // het voor-invullen gaat uit van de meegegeven tekst als die er is.
    const draft = (contextOverride ?? context).trim();
    // Een sjabloon vult pas voor na "Klaar": eerst beantwoordt de gebruiker
    // de vragen van het sjabloon.
    if (chosen && chosen.follow_up_questions.length > 0 && draft && !isSjabloon(chosen)) {
      void runPrefill(chosen, draft);
    }
  }

  /**
   * De gebruiker neemt het advies van de adviseur over. Vanaf hier loopt alles
   * gelijk aan zelf klikken in de lijst — alleen staat de context uit het
   * gesprek er alvast in. Niet elke techniek toont dat veld (Persona, Few-Shot
   * en Meta vragen hun eigen invoer), maar de tekst voedt daar wél de bouwer,
   * dus hij wordt altijd gezet.
   */
  function applyAdvice(chosen: Technique, adviceContext: string) {
    const draft = adviceContext.trim();
    if (draft) setContext(draft);
    setAdvisorOpen(false);
    handleSelectTechnique(chosen.id, draft || undefined);
  }

  // Doorverwijzing vanaf /genereren: wie daar bij "Wat wil je maken?" Skill
  // koos, komt hier binnen met de Skill Creator gekozen en zijn tekst als
  // eerste antwoord. Eén keer; daarna gaat de state eraf, zodat herladen of
  // terugbladeren niet opnieuw een techniek kiest.
  const location = useLocation();
  const navigate = useNavigate();
  const skillHandoffRef = useRef(false);
  useEffect(() => {
    const skillContext = (location.state as { skillContext?: string } | null)?.skillContext;
    if (skillContext === undefined || skillHandoffRef.current) return;
    const skill = techniques.find(isSkillCreator);
    if (!skill) return; // de technieken zijn nog niet geladen
    skillHandoffRef.current = true;
    if (skillContext) setContext(skillContext);
    handleSelectTechnique(skill.id, skillContext || undefined);
    navigate(location.pathname, { replace: true, state: null });
    // handleSelectTechnique is stabiel genoeg; alleen de geladen lijst en de
    // binnenkomende state bepalen of dit moet lopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techniques, location.state]);

  /**
   * Sjabloon: haal uit de voorbereide tekst (bovenaan de contextstap) de
   * antwoorden op de vragen. Wat de gebruiker al had ingevuld blijft staan; een
   * vraag waar de tekst niets over zegt blijft leeg.
   */
  async function handleVragenUitTekst() {
    if (!technique || !context.trim()) return;
    setVragenVullen(true);
    try {
      const { antwoorden, herkomst, onduidelijk } = await vragenUitVoorbereiding({
        technique,
        tekst: context.trim(),
        preferredProvider: settingsRef.current.provider,
        preferredModel: settingsRef.current.model,
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
      setSjabloonAntwoorden((prev) => ({ ...Object.fromEntries(nieuw), ...prev }));
      setVraagHerkomst((prev) => ({
        ...prev,
        ...Object.fromEntries(nieuw.map(([id]) => [id, herkomst[id] ?? 'tekst'])),
      }));
      const alIngevuld = technique.follow_up_questions.filter((q) =>
        sjabloonAntwoorden[q.id]?.trim(),
      ).length;
      const leeg = technique.follow_up_questions.length - alIngevuld - nieuw.length;
      toast.success(
        leeg > 0
          ? `${nieuw.length} vragen ingevuld uit je tekst. Kijk ze na; ${leeg} vragen zijn nog leeg.`
          : `${nieuw.length} vragen ingevuld uit je tekst. Kijk na wat de AI heeft aangevuld en klik dan op Klaar.`,
      );
    } catch {
      toast.error('Vragen invullen uit je tekst mislukt. Probeer het opnieuw.');
    } finally {
      setVragenVullen(false);
    }
  }

  /**
   * Sjabloon, "Klaar": de antwoorden op de vragen gaan letterlijk in de velden;
   * de AI schrijft ze niet opnieuw. Daarna stelt de AI per veld hooguit een
   * aanvulling voor, die pas iets verandert als de gebruiker haar toevoegt.
   */
  async function startSjabloonVelden() {
    if (!technique) return;
    setEditingContext(false);
    setUnclearReason(null);
    const overgenomen = Object.fromEntries(
      technique.follow_up_questions
        .filter((q) => sjabloonAntwoorden[q.id]?.trim())
        .map((q) => [q.id, sjabloonAntwoorden[q.id].trim()]),
    );
    // Geen enkele vraag beantwoord, alleen een voorbereide tekst: dan is er
    // niets van de gebruiker te bewaren en vult de AI de velden uit die tekst.
    if (Object.keys(overgenomen).length === 0) {
      setAanvullingen({});
      void runPrefill(technique, contextText);
      return;
    }
    setAnswers(overgenomen);
    setFieldMeta(
      Object.fromEntries(
        Object.keys(overgenomen).map((id) => [
          id,
          { source: 'prompt' as const, note: 'Jouw antwoord, ongewijzigd overgenomen.' },
        ]),
      ),
    );
    setAanvullingen(null);
    try {
      setAanvullingen(
        await aanvullingenVoorVelden({
          technique,
          tekst: contextText,
          antwoorden: overgenomen,
          preferredProvider: settingsRef.current.provider,
          preferredModel: settingsRef.current.model,
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

  /** Vul de velden van de gekozen techniek voor op basis van de context. */
  async function runPrefill(chosen: Technique, draft: string) {
    setPrefilling(true);
    setUnclearReason(null);
    try {
      const res = await prefillFields({
        ownPrompt: draft,
        technique: chosen,
        preferredProvider: settingsRef.current.provider,
        preferredModel: settingsRef.current.model,
      });
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je omschrijving is nog niet duidelijk genoeg om de velden voor te vullen. Vul ze zelf in, of beschrijf concreter waar het over gaat.',
        );
        return;
      }
      if (res.error) toast(res.error, { icon: 'ℹ️' });
      setAnswers(Object.fromEntries(res.fields.map((f) => [f.id, f.value])));
      setFieldMeta(
        Object.fromEntries(res.fields.map((f) => [f.id, { source: f.source, note: f.note }])),
      );
    } catch {
      // Voor-invullen is best-effort; bij een fout begin je met lege velden.
    } finally {
      setPrefilling(false);
    }
  }

  /**
   * Template-based: leid de structuur af uit een geüpload document ('document')
   * of uit een omschrijving van het gewenste document ('brief'). Zelf ingevulde
   * velden blijven staan.
   */
  async function prefillFromStructure(text: string, source: 'document' | 'brief'): Promise<boolean> {
    if (!technique) return false;
    const fromDocument = source === 'document';
    setPrefilling(true);
    setUnclearReason(null);
    try {
      const res = await prefillFields({
        ownPrompt: text,
        technique,
        fromDocument,
        fromFormatBrief: !fromDocument,
        preferredProvider: settingsRef.current.provider,
        preferredModel: settingsRef.current.model,
      });
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            (fromDocument
              ? 'Uit het document kon geen bruikbare structuur worden gehaald.'
              : 'Uit deze omschrijving kon geen bruikbare structuur worden afgeleid.'),
        );
        return false;
      }
      if (res.fields.length === 0) {
        toast(
          fromDocument
            ? 'Geen velden ingevuld uit het document. Vul ze zelf aan.'
            : 'Geen velden ingevuld op basis van je omschrijving. Vul ze zelf aan.',
          { icon: 'ℹ️' },
        );
        return false;
      }
      if (res.error) toast(res.error, { icon: '⚠️' });
      setAnswers((prev) => {
        const next = { ...prev };
        for (const f of res.fields) if (!next[f.id]?.trim()) next[f.id] = f.value;
        return next;
      });
      setFieldMeta((prev) => {
        const next = { ...prev };
        for (const f of res.fields) if (!next[f.id]) next[f.id] = { source: f.source, note: f.note };
        return next;
      });
      return true;
    } catch {
      toast.error(
        fromDocument ? 'Document verwerken mislukt.' : 'Voorstellen van een structuur mislukt.',
      );
      return false;
    } finally {
      setPrefilling(false);
    }
  }

  /** Laat de herkomst-badge vervallen zodra de gebruiker een veld zelf aanpast. */
  function handleFieldEdit(id: string) {
    setFieldMeta((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  /** Toetst eerst de guardrails; bij een treffer wordt om bevestiging gevraagd. */
  function handleGenerate() {
    if (!technique) {
      toast.error('Kies eerst een techniek.');
      return;
    }
    if (structureFormat(technique) === 'skill' && !skillData?.kern.trim()) {
      toast.error('Beschrijf eerst wat je de AI telkens opnieuw uitlegt.');
      return;
    }
    const toCheck = [contextText, builderText, ...Object.values(answers)]
      .map((v) => v.trim())
      .filter(Boolean)
      .join('\n');
    if (toCheck) {
      const s = settingsRef.current;
      const findings: GuardrailFinding[] = [
        ...(s.pii.enabled ? detectPii(toCheck) : []),
        ...detectBlockedTopics(toCheck, s.blockedTopics),
      ];
      if (findings.length > 0) {
        setGuardrailFindings(findings); // blokkeer tot bevestiging
        return;
      }
    }
    void runGenerate();
  }

  async function runGenerate() {
    if (!technique) return;
    setGuardrailFindings(null);
    setUnclearReason(null);
    setStreamText('');
    setGenProgress({});
    setOptimizing(true);
    requestAnimationFrame(() => {
      optimizingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    try {
      const s = settingsRef.current;
      // Leeg = de generator gebruikt een neutrale plaatshouder voor de eigen inhoud.
      // Bij een sjabloon staan de antwoorden al in de velden; als context gaat
      // dan alleen de voorbereide tekst mee, zodat niets dubbel binnenkomt.
      const draft = sjabloonMode
        ? context.trim() || '(geen voorbereide tekst; alles staat in de velden)'
        : contextText || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]';
      // Chain-of-Thought/Socratic: is het gesprek al ín de tool gevoerd (de
      // conclusie staat in builderText)? Dan hoeft de prompt de dialoog niet
      // meer "aan te zetten" — de generator maakt een uitgewerkte prompt.
      const fmt = structureFormat(technique);
      const interviewResolved =
        (fmt === 'chain-of-thought' || fmt === 'socratic') && Boolean(builderText.trim());
      const res = await generatePrompt({
        technique,
        promptContent: draft,
        followUpAnswers: answers,
        extraAnsweredFields: builderText.trim()
          ? [
              {
                id: 'builder_input',
                label: interviewResolved ? 'Conclusie van het gesprek' : 'Ingevulde bouwer',
                answer: builderText.trim(),
              },
            ]
          : undefined,
        interviewResolved,
        preferredProvider: s.provider,
        preferredModel: s.model,
        systemPrompt: s.systemPrompt.trim() || undefined,
        toneInstruction: s.toneInstruction.trim() || undefined,
        ...overheidsContext(s),
        temperature: s.temperature,
        thinking: thinkingOn,
        webSearch: webSearchOn,
        webSearchInstruction: s.webSearchInstruction.trim() || undefined,
        onChunk: setStreamText,
        onStatus: (status) => setGenProgress((p) => ({ ...p, ...status })),
      });

      // De AI vond de invoer onzin en maakte bewust geen prompt.
      if (res.unclear || !res.optimized_content?.trim()) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je invoer is niet duidelijk genoeg om er een zinvolle prompt van te maken. ' +
              'Vul de velden inhoudelijk in en probeer het opnieuw.',
        );
        return;
      }

      void trackEvent({
        event_type: 'optimization_run',
        user_identifier: activityIdentifier(profile, user?.email),
        prompt_id: null,
        technique_id: technique.id,
        metadata: { provider: res.provider, flow: 'techniques' },
      });

      setPhase('transition');
      setTimeout(() => {
        setVersions([res]);
        setActiveVersion(0);
        setPhase('output');
      }, 400);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Prompt bouwen mislukt');
    } finally {
      setOptimizing(false);
    }
  }

  /** Terug naar de invoer met dezelfde techniek en antwoorden. */
  function handleReset() {
    setVersions([]);
    setActiveVersion(0);
    setPhase('input');
    // Een nieuwe prompt begint zonder denken en zoeken; de gebruiker zet ze zelf aan.
    setThinking(false);
    setWebSearch(false);
  }

  /** Alles leeg voor een frisse start (volgende oefening in de training). */
  function handleClearAll() {
    setContext('');
    setContext('');
    setSjabloonAntwoorden({});
    setVraagHerkomst({});
    setAanvullingen({});
    setAdvisorOpen(false);
    setAnswers({});
    setEditingContext(false);
    setFieldMeta({});
    setBuilderText('');
    setSkillData(null);
    setUnclearReason(null);
    setGuardrailFindings(null);
    setVersions([]);
    setActiveVersion(0);
    setPhase('input');
    setThinking(false);
    setWebSearch(false);
    toast.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  // Ook een lopend adviesgesprek telt als invoer: anders staat de knop er juist
  // niet op het moment dat je er middenin zit en eruit wilt.
  const hasContent =
    Boolean(context.trim()) ||
    Object.values(sjabloonAntwoorden).some((v) => v.trim()) ||
    Boolean(techniqueId) ||
    advisorOpen ||
    Object.keys(answers).length > 0;

  return (
    <div
      className={clsx(
        'mx-auto px-4 py-8 sm:px-6 lg:px-8',
        technique ? 'max-w-4xl' : 'max-w-5xl',
      )}
    >
      {/* Je keuze staat bovenaan, ook bij het resultaat: zo blijft zichtbaar waar
          je mee werkt en is de weg terug naar de kiezer één klik. */}
      {technique && (
        <section
          ref={builderRef}
          aria-label="Je keuze"
          className="mb-4 flex scroll-mt-24 flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 pb-3 pt-4 shadow-[inset_0_4px_0_0_theme(colors.pleingroen.vast)] dark:border-slate-700 dark:bg-slate-800"
        >
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200"
          >
            {ChosenIcon && <ChosenIcon size={24} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {isContextPrompt(technique) ? 'Framework gekozen' : 'Techniek gekozen'}
            </p>
            <h1 className="text-2xl font-bold leading-tight text-rijksblauw-700 dark:text-rijksblauw-200">
              {technique.name}
            </h1>
          </div>
          <InfoDot label={`Uitleg over ${technique.name}`} text={chosenInfo(technique)} />
          {phase === 'input' && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClearAll}
                title="Wis je invoer en begin opnieuw"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rijksblauw-700 transition-colors hover:text-pleingroen dark:text-rijksblauw-200"
              >
                <Eraser size={15} /> Opschonen
              </button>
              <button
                type="button"
                className="opl-btn-secondary"
                aria-expanded={chooserOpen}
                onClick={() => {
                  setChooserOpen((open) => !open);
                  setAdvisorOpen(false);
                }}
              >
                {chooserOpen ? 'Sluiten' : 'Andere kiezen'}
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'output' && result ? (
        <div className="opl-card p-6">
          <OptimizedOutput
            result={result}
            technique={technique}
            goal={context}
            onReset={handleReset}
            versions={versions}
            activeVersion={activeVersion}
            onSelectVersion={setActiveVersion}
            skill={
              technique && structureFormat(technique) === 'skill' && skillData
                ? {
                    naam: skillData.naam,
                    beschrijving: skillData.beschrijving,
                    bronnen: skillData.velden.bronnen,
                    publicatie: skillData.publicatie,
                    model: skillModel(result.provider, settingsRef.current),
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-700 ${
            phase === 'transition' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          {/* De kiezer: het eerste scherm zonder techniek, en wat "Andere kiezen"
              opent. De adviseur hoort erbij, voor wie er zelf niet uitkomt. */}
          {(!technique || chooserOpen) && (
            <div className="space-y-6">
              {/* Hetzelfde raster als de tegels eronder: de knop is even breed als de
                  laatste tegel. */}
              <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 lg:col-span-4">
                  {technique ? (
                    <h2 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
                      Wat wil je bereiken?
                    </h2>
                  ) : (
                    <h1 className="text-3xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
                      Wat wil je bereiken?
                    </h1>
                  )}
                  {!technique && hasContent && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      title="Wis je invoer en begin opnieuw"
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rijksblauw-700 transition-colors hover:text-pleingroen dark:text-rijksblauw-200"
                    >
                      <Eraser size={15} /> Opschonen
                    </button>
                  )}
                </div>
                {!advisorOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdvisorOpen(true);
                      requestAnimationFrame(() => {
                        advisorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      });
                    }}
                    className="opl-btn-primary min-h-12 w-full justify-center px-3 text-base sm:w-auto sm:justify-self-start lg:w-full"
                  >
                    <Compass size={20} className="text-pleingroen-vast" /> Help mij kiezen
                  </button>
                )}
              </div>
              {advisorOpen && (
                <div ref={advisorRef} className="scroll-mt-24">
                  <TechniqueAdvisor
                    techniques={techniques}
                    settings={settingsRef.current}
                    start={context}
                    onChoose={applyAdvice}
                    onClose={() => setAdvisorOpen(false)}
                  />
                </div>
              )}
              <TechniqueChooser selectedId={techniqueId} onSelect={handleSelectTechnique} />
            </div>
          )}

          {/* Het invulblok van de gekozen techniek. */}
          {technique && (
            <div key={technique.id} className="animate-fade-in space-y-4">
                {/* Het oordeel van de voor-invulling hoort bovenaan het blok, waar
                    de blik na het kiezen van een techniek al is: onder de knop
                    "Bouw prompt" viel het pas op na scrollen. */}
                {unclearReason && (
                  <div
                    role="alert"
                    className="animate-fade-in flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
                  >
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Je invoer is nog niet duidelijk genoeg</p>
                      <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">
                        {stripMarkdown(unclearReason)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Zo begin je: waar de techniek over moet gaan. Alleen bij
                    technieken die anders lopen dan verwacht, zoals Socratic:
                    die geeft vragen terug in plaats van antwoorden. Zie
                    techniqueStarter. */}
                {(() => {
                  const starter = techniqueStarter(technique);
                  if (!starter) return null;
                  return (
                    <div className="rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/60 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                        <Compass size={15} className="shrink-0" /> Zo begin je
                      </p>
                      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{starter}</p>
                    </div>
                  );
                })()}

                {/* Waar het over gaat, compact. Het losse startpunt-veld is door
                    dit blok vervangen, maar de tekst voedt nog steeds het
                    voor-invullen en het bouwen — dus blijft hij hier zichtbaar
                    en aanpasbaar.

                    Niet bij Few-Shot, Persona en Meta: die bouwers vragen zelf
                    om de taak, de voorbeelden of het ruwe verzoek, dus een
                    contextveld ervóór levert daar niets op en verdubbelt alleen
                    de vraag. */}
                {(() => {
                  const fmt = structureFormat(technique);
                  if (
                    fmt === 'few-shot' ||
                    fmt === 'persona' ||
                    fmt === 'multi-persona' ||
                    fmt === 'meta' ||
                    // Deze drie beginnen zelf met de vraag waar het over gaat
                    // (de te controleren tekst, de opdracht, het te beoordelen
                    // stuk); een contextveld ervóór stelt dezelfde vraag nog eens.
                    fmt === 'chain-of-verification' ||
                    fmt === 'step-back' ||
                    fmt === 'rubric' ||
                    // De Skill Creator vraagt als eerste zelf waar het over gaat.
                    fmt === 'skill'
                  ) {
                    return null;
                  }
                  // Alleen de vragenlijst-technieken laten zich voor-invullen;
                  // de interviews (chain-of-thought/socratic) niet.
                  const usesQuestionnaire =
                    technique.follow_up_questions.length > 0 &&
                    fmt !== 'chain-of-thought' &&
                    fmt !== 'socratic';
                  // Bij een interview wacht het gesprek op deze context: het
                  // start pas als het veld dicht is, anders stelt de AI zijn
                  // eerste vraag terwijl de gebruiker nog aan het typen is.
                  const isInterview = fmt === 'chain-of-thought' || fmt === 'socratic';
                  // Sjabloon: eerst de vragen van het sjabloon, elk met een eigen
                  // vak, dan pas de velden. "Klaar" vult de velden voor uit de
                  // antwoorden; de velden staan tot dan dicht (zie hieronder).
                  if (sjabloonMode) {
                    const beantwoord = technique.follow_up_questions.filter((q) =>
                      sjabloonAntwoorden[q.id]?.trim(),
                    ).length;
                    return (
                      <section className="opl-card p-5">
                        {editingContext ? (
                          <>
                            <StepHeading
                              step={1}
                              title="Eerst de context"
                              info="Schrijf bij elke vraag op wat je al weet. Na Klaar zet de AI je antwoorden in de velden en vraagt naar wat ontbreekt."
                            />
                            {/* Voorbereid materiaal bovenaan: wie in een andere chat al
                                iets heeft uitgewerkt, plakt het hier en laat de vragen
                                eronder daaruit invullen. */}
                            <div className="mb-5 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                              <div className="mb-1 flex items-center gap-1">
                                <label htmlFor="techniek-context" className="opl-label mb-0">
                                  Heb je al iets voorbereid?
                                </label>
                                <InfoDot
                                  label="Uitleg over voorbereide tekst"
                                  text="Plak wat je al hebt, zoals aantekeningen of een planning. Per vraag zie je wat uit je tekst komt en wat de AI heeft bedacht."
                                />
                              </div>
                              <OptimizableTextarea
                                id="techniek-context"
                                ref={contextRef}
                                rows={5}
                                value={context}
                                onValueChange={setContext}
                                placeholder="Plak hier je voorbereide tekst."
                                className="opl-input resize-y px-4 py-3 text-sm leading-relaxed"
                                optimizeTitle="Schrijf mijn context uit met AI; je oorspronkelijke tekst kun je daarna terughalen"
                              />
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  className="opl-btn-secondary"
                                  disabled={!context.trim() || vragenVullen || prefilling}
                                  onClick={() => void handleVragenUitTekst()}
                                >
                                  {vragenVullen ? (
                                    <>
                                      <Loader2 size={16} className="animate-spin" /> Vragen invullen…
                                    </>
                                  ) : (
                                    <>
                                      <ArrowDown size={16} /> Vul de vragen in uit deze tekst
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <SjabloonVragen
                              technique={technique}
                              antwoorden={sjabloonAntwoorden}
                              herkomst={vraagHerkomst}
                              onChange={(next, aangepast) => {
                                setSjabloonAntwoorden(next);
                                setVraagHerkomst((prev) => {
                                  if (!prev[aangepast]) return prev;
                                  const rest = { ...prev };
                                  delete rest[aangepast];
                                  return rest;
                                });
                              }}
                              disabled={prefilling || vragenVullen}
                            />
                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                className="opl-btn-secondary"
                                title="Sla de vragen over en vul de velden zelf in"
                                onClick={() => setEditingContext(false)}
                              >
                                Zelf invullen
                              </button>
                              <button
                                type="button"
                                className="opl-btn-primary"
                                disabled={prefilling || vragenVullen || !contextText}
                                onClick={() => void startSjabloonVelden()}
                              >
                                <Sparkles size={16} /> Klaar, vul de velden in
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                Context:
                              </span>{' '}
                              {beantwoord} van {technique.follow_up_questions.length} vragen
                              beantwoord{context.trim() ? ', met voorbereide tekst' : ''}.
                            </p>
                            <button
                              type="button"
                              className="shrink-0 text-sm font-medium text-rijksblauw-600 transition-colors hover:text-rijksblauw-700 hover:underline dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
                              onClick={() => setEditingContext(true)}
                            >
                              Aanpassen
                            </button>
                          </div>
                        )}
                      </section>
                    );
                  }
                  return (
                    <section className="opl-card p-5">
                      {/* Bij een vragenlijst blijft dit veld open; bij een gesprek klapt
                          het dicht zodra het gesprek begint. */}
                      {editingContext || usesQuestionnaire ? (
                        <>
                          <StepHeading
                            step={1}
                            title="Waar gaat het over?"
                            htmlFor="techniek-context"
                            info={
                              usesQuestionnaire
                                ? 'Vul je hier iets in, dan kan de AI de velden alvast voor je invullen.'
                                : isInterview
                                  ? 'Vul je hier iets in, dan begint het gesprek bij jouw onderwerp.'
                                  : 'Vul je hier iets in, dan begint deze techniek met jouw onderwerp.'
                            }
                          >
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              Mag leeg blijven
                            </span>
                          </StepHeading>
                          {/* Voorbeeldprompts als startpunt, alleen bij de
                              frameworks: daar is de context een opdracht in
                              gewone taal, precies wat deze voorbeelden zijn.
                              De losse technieken vragen om iets anders (een
                              te controleren tekst, een rol, een rubric), dus
                              een voorbeeldprompt zou daar niet passen. */}
                          {isContextPrompt(technique) && (
                            <PromptExamplePicker
                              onPick={(prompt) => {
                                setContext(prompt);
                                requestAnimationFrame(() => {
                                  const el = contextRef.current;
                                  if (!el) return;
                                  el.focus();
                                  el.setSelectionRange(prompt.length, prompt.length);
                                });
                              }}
                            />
                          )}
                          {/* Met het groene sterretje uit de chat erbij: wat de gebruiker in
                              steekwoorden neerzet, staat hier vaak nog niet uitgeschreven,
                              en juist deze tekst bepaalt wat de AI van de techniek maakt. */}
                          <OptimizableTextarea
                            id="techniek-context"
                            ref={contextRef}
                            rows={3}
                            value={context}
                            onValueChange={setContext}
                            placeholder={contextExample(technique)}
                            className="opl-input min-h-[5.5rem] resize-y px-4 py-3 text-[0.9375rem] leading-relaxed"
                            optimizeTitle="Schrijf mijn context uit met AI; je oorspronkelijke tekst kun je daarna terughalen"
                          />
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            {usesQuestionnaire ? (
                              <button
                                type="button"
                                className="opl-btn-secondary"
                                title="Vervangt de huidige antwoorden door een voorstel van de AI"
                                // Zolang er een voor-invulling loopt geen tweede starten: elke
                                // klik was een extra aanroep, en de laatste die klaar was
                                // overschreef de velden, ook als die niets opleverde.
                                disabled={prefilling || !context.trim()}
                                onClick={() => void runPrefill(technique, context.trim())}
                              >
                                <Sparkles size={16} />{' '}
                                {Object.keys(answers).length > 0
                                  ? 'Velden opnieuw voorinvullen'
                                  : 'Velden voorinvullen'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={isInterview ? 'opl-btn-primary' : 'opl-btn-secondary'}
                                onClick={() => setEditingContext(false)}
                              >
                                {isInterview ? 'Start het gesprek' : 'Klaar'}
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {context.trim() ? (
                              <>
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                  Context:
                                </span>{' '}
                                {context.trim()}
                              </>
                            ) : (
                              'Waar gaat het over? Mag leeg blijven.'
                            )}
                          </p>
                          <button
                            type="button"
                            className="shrink-0 text-sm font-medium text-rijksblauw-600 transition-colors hover:text-rijksblauw-700 hover:underline dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
                            onClick={() => setEditingContext(true)}
                          >
                            {context.trim() ? 'Aanpassen' : 'Toevoegen'}
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })()}

                {/* Gespecialiseerde bouwers per techniek; anders de vragenlijst.
                    De bouwer levert geserialiseerde input die bij het bouwen
                    van de prompt wordt meegewogen. */}
                <section className="opl-card p-5">
                {(() => {
                  const fmt = structureFormat(technique);
                  const s = settingsRef.current;
                  if (fmt === 'persona' || fmt === 'multi-persona') {
                    return (
                      <PersonaBuilder
                        multi={fmt === 'multi-persona'}
                        settings={s}
                        technique={technique}
                        context={context}
                        onSerialized={setBuilderText}
                      />
                    );
                  }
                  if (fmt === 'few-shot') {
                    return <FewShotBuilder settings={s} onSerialized={setBuilderText} />;
                  }
                  if (fmt === 'meta') {
                    return <MetaBuilder settings={s} goal={context} onSerialized={setBuilderText} />;
                  }
                  // De drie rijksspecifieke technieken: elk een eigen bouwer die
                  // precies ophaalt waar die techniek op staat of valt (zie de
                  // koptekst van elk bestand).
                  if (fmt === 'chain-of-verification') {
                    return (
                      <VerificationBuilder
                        settings={s}
                        context={context}
                        onSerialized={setBuilderText}
                      />
                    );
                  }
                  if (fmt === 'step-back') {
                    return (
                      <StepBackBuilder settings={s} context={context} onSerialized={setBuilderText} />
                    );
                  }
                  if (fmt === 'rubric') {
                    return (
                      <RubricBuilder settings={s} context={context} onSerialized={setBuilderText} />
                    );
                  }
                  if (fmt === 'skill') {
                    return (
                      <SkillBuilder
                        settings={s}
                        context={context}
                        onSerialized={setBuilderText}
                        onChange={setSkillData}
                      />
                    );
                  }
                  // Chain-of-Thought / Socratic: het vraag-na-vraag-interview.
                  // De conclusie voedt het bouwen van de prompt. Het gesprek
                  // start pas als het contextveld dicht is — anders stelt de AI
                  // zijn eerste vraag terwijl de gebruiker nog context typt.
                  if (fmt === 'chain-of-thought' || fmt === 'socratic') {
                    return (
                      <>
                        <StepHeading step={2} title="Het gesprek" />
                        {editingContext ? (
                          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                            Het gesprek begint zodra je hierboven op &quot;Start het gesprek&quot;
                            klikt.
                          </p>
                        ) : (
                          <InterviewFlow
                            technique={technique}
                            settings={s}
                            goal={context}
                            onComplete={setBuilderText}
                          />
                        )}
                      </>
                    );
                  }
                  // Sjabloon: de velden pas na de contextstap, zodat de gebruiker
                  // niet meteen in het eerste veld begint.
                  if (sjabloonMode && editingContext) {
                    return (
                      <>
                        <StepHeading step={2} title="Vul de velden in" />
                        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                          De velden van het sjabloon verschijnen zodra je hierboven op Klaar klikt.
                        </p>
                      </>
                    );
                  }
                  // Template-based: upload-zone (document → velden voor-invullen)
                  // bovenop de vragenlijst; anders alleen de vragenlijst.
                  return (
                    <div className="space-y-4">
                      {fmt === 'template-based' && (
                        <DocumentUpload
                          onPrefill={(text) => prefillFromStructure(text, 'document')}
                          onDescribe={(brief) => prefillFromStructure(brief, 'brief')}
                          disabled={prefilling}
                        />
                      )}
                      {sjabloonMode && (
                        <div className="flex items-start gap-2 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/60 px-3 py-2.5 text-sm text-slate-700 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10 dark:text-slate-200">
                          {aanvullingen === null ? (
                            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-rijksblauw-500" />
                          ) : (
                            <Check size={16} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                          )}
                          <p>
                            Je antwoorden staan ongewijzigd in de velden.{' '}
                            {aanvullingen === null
                              ? 'De AI kijkt nog of er per veld iets aan te vullen is.'
                              : Object.keys(aanvullingen).length > 0
                                ? `De AI stelt bij ${Object.keys(aanvullingen).length} ${
                                    Object.keys(aanvullingen).length === 1 ? 'veld' : 'velden'
                                  } een aanvulling voor; die staat in het groen onder het veld. Voeg toe wat klopt, de rest verwerp je.`
                                : 'De AI had niets aan te vullen.'}
                          </p>
                        </div>
                      )}
                      <FollowUpQuestions
                        technique={technique}
                        answers={answers}
                        onChange={setAnswers}
                        aanvullingen={sjabloonMode ? (aanvullingen ?? undefined) : undefined}
                        onAanvulling={sjabloonMode ? handleAanvulling : undefined}
                        fieldMeta={fieldMeta}
                        onUserEdit={handleFieldEdit}
                        prefilling={prefilling}
                        preferredProvider={settingsRef.current.provider}
                        preferredModel={settingsRef.current.model}
                        heading={<StepHeading step={2} title="Vul de velden in" />}
                      />
                    </div>
                  );
                })()}
                </section>
            </div>
          )}

          {/* Denken, zoeken en bouwen op één regel, voor elke techniek. */}
          {!optimizing && technique && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ThinkingToggle
                value={thinking}
                onChange={setThinking}
                unavailableReason={thinkingUnavailable}
              />
              {searchAvailable && <WebSearchToggle value={webSearch} onChange={setWebSearch} />}
              <button className="opl-btn-primary px-6 py-2.5" onClick={handleGenerate}>
                <Sparkles size={18} />{' '}
                {structureFormat(technique) === 'skill' ? 'Bouw skill' : 'Bouw prompt'}
              </button>
            </div>
          )}

          {optimizing && (
            <div ref={optimizingRef} className="scroll-mt-24">
              <OptimizingLoader
                techniqueName={technique?.name}
                streamText={streamText}
                phase={genProgress.phase}
                models={genProgress.models}
                winner={genProgress.provider ?? null}
              />
            </div>
          )}
        </div>
      )}

      {guardrailFindings && (
        <GuardrailDialog
          findings={guardrailFindings}
          piiWarning={settingsRef.current.pii.warning}
          onConfirm={() => void runGenerate()}
          onCancel={() => setGuardrailFindings(null)}
        />
      )}
    </div>
  );
}

/**
 * De uitleg achter het bolletje bij je keuze: wat de techniek doet en, waar hij
 * anders loopt dan velden invullen, wat je kunt verwachten.
 */
function chosenInfo(t: Technique): string {
  const fmt = structureFormat(t);
  const verloop =
    fmt === 'chain-of-thought' || fmt === 'socratic'
      ? 'Je antwoorden worden meteen uitgewerkt tot een prompt.'
      : fmt === 'skill'
        ? 'Plak het resultaat in je eigen AI-omgeving of download het als SKILL.md.'
        : isSjabloon(t)
          ? 'De vormgeving ligt vast; de AI vult de inhoud.'
          : '';
  return [techniekKaart(t).info, verloop].filter(Boolean).join('\n');
}

/**
 * Het model dat de skill schreef, voor de herkomst in de kop van SKILL.md. De
 * server meldt alleen de provider; was dat de provider uit Beheer, dan draaide
 * het daar gekozen model, anders het standaardmodel van die provider. Leeg als
 * de AI-service niet bereikbaar was en de skill een ingevuld sjabloon is.
 */
function skillModel(provider: OptimizeResult['provider'], settings: AiSettings): string {
  if (!isEnabledProvider(provider)) return '';
  if (settings.provider === provider && settings.model) return settings.model;
  return defaultModelFor(provider);
}
