import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
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
import '@nldd/design-system/banner';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

/**
 * Werken mét de prompttechnieken zelf: de volledige lijst frameworks en losse
 * technieken, en per techniek de velden die je zelf invult. Bedoeld voor de
 * training, deelnemers zien welke technieken er zijn, kiezen er één, vullen
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
  // gaat dit scherm van hand tot hand, dan is achtergebleven werk van de
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
  // tot duidelijk is welke techniek past, voor wie de lijst niet overziet.
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
  const advisorRef = useRef<HTMLElement>(null);
  const optimizingRef = useRef<HTMLElement>(null);

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
  // De context zoals hij naar het voor-invullen en het bouwen gaat. Bij een
  // sjabloon: de antwoorden op de vragen, elk onder zijn vraag, plus het losse vak.
  const contextText =
    technique && sjabloonMode
      ? sjabloonContextTekst(technique, sjabloonAntwoorden, context)
      : context.trim();

  /**
   * Kies een techniek: antwoorden van de vorige techniek vervallen en het
   * invulblok scrollt in beeld. Staat er al iets in "waar gaat het over", dan
   * vult de AI de velden alvast voor, anders begin je met lege velden.
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
   * gelijk aan zelf klikken in de lijst, alleen staat de context uit het
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
        notify(onduidelijk, { icon: 'ℹ️' });
        return;
      }
      const nieuw = Object.entries(antwoorden).filter(([id]) => !sjabloonAntwoorden[id]?.trim());
      if (nieuw.length === 0) {
        notify('Je tekst gaf geen antwoord op de vragen die nog leeg waren.', { icon: 'ℹ️' });
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
      notify.success(
        leeg > 0
          ? `${nieuw.length} vragen ingevuld uit je tekst. Kijk ze na; ${leeg} vragen zijn nog leeg.`
          : `${nieuw.length} vragen ingevuld uit je tekst. Kijk na wat de AI heeft aangevuld en klik dan op Klaar.`,
      );
    } catch {
      notify.error('Vragen invullen uit je tekst mislukt. Probeer het opnieuw.');
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
      if (res.error) notify(res.error, { icon: 'ℹ️' });
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
        notify(
          fromDocument
            ? 'Geen velden ingevuld uit het document. Vul ze zelf aan.'
            : 'Geen velden ingevuld op basis van je omschrijving. Vul ze zelf aan.',
          { icon: 'ℹ️' },
        );
        return false;
      }
      if (res.error) notify(res.error, { icon: '⚠️' });
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
      notify.error(
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
      notify.error('Kies eerst een techniek.');
      return;
    }
    if (structureFormat(technique) === 'skill' && !skillData?.kern.trim()) {
      notify.error('Beschrijf eerst wat je de AI telkens opnieuw uitlegt.');
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
      // meer "aan te zetten", de generator maakt een uitgewerkte prompt.
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
      notify.error(err instanceof Error ? err.message : 'Prompt bouwen mislukt');
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
    notify.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  // Ook een lopend adviesgesprek telt als invoer: anders staat de knop er juist
  // niet op het moment dat je er middenin zit en eruit wilt.
  const hasContent =
    Boolean(context.trim()) ||
    Object.values(sjabloonAntwoorden).some((v) => v.trim()) ||
    Boolean(techniqueId) ||
    advisorOpen ||
    Object.keys(answers).length > 0;

  function openAdvisor() {
    setAdvisorOpen(true);
    requestAnimationFrame(() => {
      advisorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const clearButton = (
    <nldd-button
      appearance="neutral-transparent"
      start-icon="trash"
      text="Opschonen"
      accessible-label="Opschonen: wis je invoer en begin opnieuw"
      onClick={handleClearAll}
    ></nldd-button>
  );

  return (
    <nldd-simple-section>
      {/* Je keuze staat bovenaan, ook bij het resultaat: zo blijft zichtbaar waar
          je mee werkt en is de weg terug naar de kiezer één klik. */}
      <nldd-title
        slot="header"
        heading-level={1}
        size={2}
        overline={technique ? (isContextPrompt(technique) ? 'Framework gekozen' : 'Techniek gekozen') : undefined}
        text={technique ? technique.name : 'Wat wil je bereiken?'}
        supporting-text={
          technique
            ? chosenInfo(technique)
            : 'Kies eerst je doel en daarna een framework of techniek. Weet je het niet, laat je dan helpen kiezen.'
        }
      ></nldd-title>
      <nldd-container gap="24">
        {technique && phase === 'input' && (
          <nldd-container layout="wrap" gap="8">
            <nldd-button
              appearance="neutral-transparent"
              start-icon={chooserOpen ? 'dismiss' : 'list'}
              text={chooserOpen ? 'Sluiten' : 'Andere kiezen'}
              expanded={chooserOpen || undefined}
              onClick={() => {
                setChooserOpen((open) => !open);
                setAdvisorOpen(false);
              }}
            ></nldd-button>
          </nldd-container>
        )}
        {phase === 'output' && result ? (
          <nldd-card>
            <nldd-container padding="24" sm-padding="16">
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
            </nldd-container>
          </nldd-card>
        ) : (
          <nldd-container gap="24">
            {/* De kiezer: het eerste scherm zonder techniek, en wat "Andere kiezen"
                opent. De adviseur hoort erbij, voor wie er zelf niet uitkomt. */}
            {(!technique || chooserOpen) && (
              <nldd-container gap="24">
                {technique && <nldd-title heading-level={2} size={4} text="Wat wil je bereiken?"></nldd-title>}
                {advisorOpen && (
                  <nldd-container ref={advisorRef}>
                    <TechniqueAdvisor
                      techniques={techniques}
                      settings={settingsRef.current}
                      start={context}
                      onChoose={applyAdvice}
                      onClose={() => setAdvisorOpen(false)}
                    />
                  </nldd-container>
                )}
                <TechniqueChooser
                  selectedId={techniqueId}
                  onSelect={handleSelectTechnique}
                  help={
                    (!advisorOpen || (!technique && hasContent)) && (
                      <nldd-container layout="wrap" gap="8">
                        {!advisorOpen && (
                          <nldd-button
                            size="sm"
                            appearance="accent-transparent"
                            start-icon="signpost"
                            text="Help mij kiezen"
                            onClick={openAdvisor}
                          ></nldd-button>
                        )}
                        {!technique && hasContent && clearButton}
                      </nldd-container>
                    )
                  }
                />
              </nldd-container>
            )}

            {/* Het invulblok van de gekozen techniek. */}
            {technique && (
              <nldd-container ref={builderRef} key={technique.id} gap="32">
                {/* Het oordeel van de voor-invulling hoort bovenaan het blok, waar
                    de blik na het kiezen van een techniek al is: onder de knop
                    "Bouw prompt" viel het pas op na scrollen. */}
                {unclearReason && (
                  <nldd-banner
                    variant="warning"
                    text="Je invoer is nog niet duidelijk genoeg"
                    supporting-text={stripMarkdown(unclearReason)}
                  ></nldd-banner>
                )}

                {/* Zo begin je: waar de techniek over moet gaan. Alleen bij
                    technieken die anders lopen dan verwacht, zoals Socratic:
                    die geeft vragen terug in plaats van antwoorden. Zie
                    techniqueStarter. */}
                {(() => {
                  const starter = techniqueStarter(technique);
                  if (!starter) return null;
                  return (
                    <nldd-box background="accent-tinted">
                      <nldd-container padding="12" gap="6">
                        <nldd-container layout="row" gap="6" vertical-alignment="center">
                          <nldd-icon icon="signpost" size="16" color="accent"></nldd-icon>
                          <nldd-text size="sm" weight="bold">
                            Zo begin je
                          </nldd-text>
                        </nldd-container>
                        <nldd-text size="sm">{starter}</nldd-text>
                      </nldd-container>
                    </nldd-box>
                  );
                })()}

                {/* Waar het over gaat, compact. Het losse startpunt-veld is door
                    dit blok vervangen, maar de tekst voedt nog steeds het
                    voor-invullen en het bouwen, dus blijft hij hier zichtbaar
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
                      <>
                        <nldd-container gap="16">
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
                              <nldd-box background="tinted">
                                <nldd-container padding="12" gap="8">
                                  <nldd-container layout="row" gap="4" vertical-alignment="center">
                                    <nldd-text size="sm" weight="bold">
                                      Heb je al iets voorbereid?
                                    </nldd-text>
                                    <InfoDot
                                      label="Uitleg over voorbereide tekst"
                                      text="Plak wat je al hebt, zoals aantekeningen of een planning. Per vraag zie je wat uit je tekst komt en wat de AI heeft bedacht."
                                    />
                                  </nldd-container>
                                  <OptimizableTextarea
                                    id="techniek-context"
                                    aria-label="Heb je al iets voorbereid?"
                                    ref={contextRef}
                                    rows={5}
                                    value={context}
                                    onValueChange={setContext}
                                    placeholder="Plak hier je voorbereide tekst."
                                    optimizeTitle="Schrijf mijn context uit met AI; je oorspronkelijke tekst kun je daarna terughalen"
                                  />
                                  <nldd-container>
                                    <nldd-button
                                      appearance="secondary"
                                      start-icon="arrow-down"
                                      text="Vul de vragen in uit deze tekst"
                                      loading={vragenVullen || undefined}
                                      loading-text="Vragen invullen"
                                      disabled={!context.trim() || prefilling || undefined}
                                      onClick={() => void handleVragenUitTekst()}
                                    ></nldd-button>
                                  </nldd-container>
                                </nldd-container>
                              </nldd-box>
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
                              <nldd-container layout="wrap" gap="8">
                                <nldd-button
                                  appearance="secondary"
                                  start-icon="sparkles"
                                  text="Klaar, vul de velden in"
                                  disabled={prefilling || vragenVullen || !contextText || undefined}
                                  onClick={() => void startSjabloonVelden()}
                                ></nldd-button>
                                <nldd-button
                                  appearance="secondary"
                                  text="Zelf invullen"
                                  accessible-label="Zelf invullen: sla de vragen over"
                                  onClick={() => setEditingContext(false)}
                                ></nldd-button>
                              </nldd-container>
                            </>
                          ) : (
                            <nldd-container layout="row" gap="12" vertical-alignment="center">
                              <nldd-text size="sm" color="secondary">
                                <strong>Context:</strong> {beantwoord} van{' '}
                                {technique.follow_up_questions.length} vragen beantwoord
                                {context.trim() ? ', met voorbereide tekst' : ''}.
                              </nldd-text>
                              <nldd-spacer size="flexible"></nldd-spacer>
                              <nldd-button
                                size="sm"
                                appearance="neutral-transparent"
                                text="Aanpassen"
                                onClick={() => setEditingContext(true)}
                              ></nldd-button>
                            </nldd-container>
                          )}
                        </nldd-container>
                      </>
                    );
                  }
                  return (
                    <>
                      <nldd-container gap="12">
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
                            />
                            <nldd-text size="sm" color="secondary">
                              Mag leeg blijven.
                            </nldd-text>
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
                            {/* Met het oranje sterretje uit de chat erbij: wat de gebruiker in
                                steekwoorden neerzet, staat hier vaak nog niet uitgeschreven,
                                en juist deze tekst bepaalt wat de AI van de techniek maakt. */}
                            <OptimizableTextarea
                              id="techniek-context"
                              ref={contextRef}
                              rows={3}
                              value={context}
                              onValueChange={setContext}
                              placeholder={contextExample(technique)}
                              optimizeTitle="Schrijf mijn context uit met AI; je oorspronkelijke tekst kun je daarna terughalen"
                            />
                            <nldd-container>
                              {usesQuestionnaire ? (
                                // Zolang er een voor-invulling loopt geen tweede starten: elke
                                // klik was een extra aanroep, en de laatste die klaar was
                                // overschreef de velden, ook als die niets opleverde.
                                <nldd-button
                                  appearance="secondary"
                                  start-icon="sparkles"
                                  text={
                                    Object.keys(answers).length > 0
                                      ? 'Velden opnieuw voorinvullen'
                                      : 'Velden voorinvullen'
                                  }
                                  supporting-text={
                                    Object.keys(answers).length > 0
                                      ? 'Vervangt de huidige antwoorden'
                                      : undefined
                                  }
                                  loading={prefilling || undefined}
                                  onClick={() => {
                                    if (!context.trim()) {
                                      notify.error('Schrijf eerst waar het over gaat, dan vult de AI de velden voor.');
                                      return;
                                    }
                                    void runPrefill(technique, context.trim());
                                  }}
                                ></nldd-button>
                              ) : (
                                <nldd-button
                                  appearance="secondary"
                                  text={isInterview ? 'Start het gesprek' : 'Klaar'}
                                  onClick={() => setEditingContext(false)}
                                ></nldd-button>
                              )}
                            </nldd-container>
                          </>
                        ) : (
                          <nldd-container layout="row" gap="12" vertical-alignment="center">
                            <nldd-text size="sm" color="secondary">
                              {context.trim() ? (
                                <>
                                  <strong>Context:</strong> {context.trim()}
                                </>
                              ) : (
                                'Waar gaat het over? Mag leeg blijven.'
                              )}
                            </nldd-text>
                            <nldd-spacer size="flexible"></nldd-spacer>
                            <nldd-button
                              size="sm"
                              appearance="neutral-transparent"
                              text={context.trim() ? 'Aanpassen' : 'Toevoegen'}
                              onClick={() => setEditingContext(true)}
                            ></nldd-button>
                          </nldd-container>
                        )}
                      </nldd-container>
                    </>
                  );
                })()}

                {/* Gespecialiseerde bouwers per techniek; anders de vragenlijst.
                    De bouwer levert geserialiseerde input die bij het bouwen
                    van de prompt wordt meegewogen. */}
                <>
                  <nldd-container>
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
                          <VerificationBuilder settings={s} context={context} onSerialized={setBuilderText} />
                        );
                      }
                      if (fmt === 'step-back') {
                        return <StepBackBuilder settings={s} context={context} onSerialized={setBuilderText} />;
                      }
                      if (fmt === 'rubric') {
                        return <RubricBuilder settings={s} context={context} onSerialized={setBuilderText} />;
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
                      // start pas als het contextveld dicht is, anders stelt de AI
                      // zijn eerste vraag terwijl de gebruiker nog context typt.
                      if (fmt === 'chain-of-thought' || fmt === 'socratic') {
                        return (
                          <nldd-container gap="12">
                            <StepHeading step={2} title="Het gesprek" />
                            {editingContext ? (
                              <nldd-inline-dialog
                                icon="comment"
                                text="Het gesprek begint zodra je hierboven op Start het gesprek klikt."
                              ></nldd-inline-dialog>
                            ) : (
                              <InterviewFlow
                                technique={technique}
                                settings={s}
                                goal={context}
                                onComplete={setBuilderText}
                              />
                            )}
                          </nldd-container>
                        );
                      }
                      // Sjabloon: de velden pas na de contextstap, zodat de gebruiker
                      // niet meteen in het eerste veld begint.
                      if (sjabloonMode && editingContext) {
                        return (
                          <nldd-container gap="12">
                            <StepHeading step={2} title="Vul de velden in" />
                            <nldd-inline-dialog
                              icon="text-document"
                              text="De velden van het sjabloon verschijnen zodra je hierboven op Klaar klikt."
                            ></nldd-inline-dialog>
                          </nldd-container>
                        );
                      }
                      // Template-based: upload-zone (document → velden voor-invullen)
                      // bovenop de vragenlijst; anders alleen de vragenlijst.
                      return (
                        <nldd-container gap="16">
                          {fmt === 'template-based' && (
                            <DocumentUpload
                              onPrefill={(text) => prefillFromStructure(text, 'document')}
                              onDescribe={(brief) => prefillFromStructure(brief, 'brief')}
                              disabled={prefilling}
                            />
                          )}
                          {sjabloonMode && (
                            <nldd-banner
                              variant="accent"
                              size="sm"
                              icon={aanvullingen === null ? 'clock' : 'check-mark'}
                              text="Je antwoorden staan ongewijzigd in de velden."
                              supporting-text={
                                aanvullingen === null
                                  ? 'De AI kijkt nog of er per veld iets aan te vullen is.'
                                  : Object.keys(aanvullingen).length > 0
                                    ? `De AI stelt bij ${Object.keys(aanvullingen).length} ${
                                        Object.keys(aanvullingen).length === 1 ? 'veld' : 'velden'
                                      } een aanvulling voor; die staat onder het veld. Voeg toe wat klopt, de rest verwerp je.`
                                    : 'De AI had niets aan te vullen.'
                              }
                            ></nldd-banner>
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
                        </nldd-container>
                      );
                    })()}
                  </nldd-container>
                </>
              </nldd-container>
            )}

            {/* Denken, zoeken en bouwen op één regel, voor elke techniek. */}
            {!optimizing && technique && (
              <nldd-container layout="wrap" gap="8" vertical-alignment="center">
                <nldd-button
                  appearance="primary"
                  start-icon="sparkles"
                  text={structureFormat(technique) === 'skill' ? 'Bouw skill' : 'Bouw prompt'}
                  onClick={handleGenerate}
                ></nldd-button>
                <ThinkingToggle value={thinking} onChange={setThinking} unavailableReason={thinkingUnavailable} />
                {searchAvailable && <WebSearchToggle value={webSearch} onChange={setWebSearch} />}
                <nldd-spacer size="flexible"></nldd-spacer>
                {clearButton}
              </nldd-container>
            )}

            {optimizing && (
              <nldd-container ref={optimizingRef}>
                <OptimizingLoader
                  techniqueName={technique?.name}
                  streamText={streamText}
                  phase={genProgress.phase}
                  models={genProgress.models}
                  winner={genProgress.provider ?? null}
                />
              </nldd-container>
            )}
          </nldd-container>
        )}

        {guardrailFindings && (
          <GuardrailDialog
            findings={guardrailFindings}
            piiWarning={settingsRef.current.pii.warning}
            onConfirm={() => void runGenerate()}
            onCancel={() => setGuardrailFindings(null)}
          />
        )}
      </nldd-container>
    </nldd-simple-section>
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
