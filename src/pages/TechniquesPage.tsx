import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Check,
  Compass,
  Eraser,
  Layers,
  Loader2,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import TechniqueAdvisor from '@/components/optimizer/TechniqueAdvisor';
import FollowUpQuestions, { type FieldMeta } from '@/components/optimizer/FollowUpQuestions';
import PersonaBuilder from '@/components/optimizer/PersonaBuilder';
import FewShotBuilder from '@/components/optimizer/FewShotBuilder';
import MetaBuilder from '@/components/optimizer/MetaBuilder';
import PromptExamplePicker from '@/components/optimizer/PromptExamplePicker';
import VerificationBuilder from '@/components/optimizer/VerificationBuilder';
import StepBackBuilder from '@/components/optimizer/StepBackBuilder';
import RubricBuilder from '@/components/optimizer/RubricBuilder';
import DocumentUpload from '@/components/optimizer/DocumentUpload';
import InterviewFlow from '@/components/optimizer/InterviewFlow';
import OptimizableTextarea from '@/components/common/OptimizableTextarea';
import OptimizingLoader from '@/components/optimizer/OptimizingLoader';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { generatePrompt, prefillFields } from '@/services/optimizeService';
import { trackEvent } from '@/services/analyticsService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import {
  contextExample,
  isContextPrompt,
  structureFormat,
  techniqueStarter,
} from '@/lib/techniques';
import { activityIdentifier, stripMarkdown } from '@/lib/utils';
import type { OptimizeResult, Technique } from '@/types';

/**
 * Vult deze techniek zich via de gewone vragenlijst (FollowUpQuestions)? Alle
 * andere formats hebben een eigen bouwer of een interview. Bepaalt waar de
 * bouw-knop staat: in de balk van de vragenlijst, of los onder het invulblok.
 */
function usesQuestionnaire(t: Technique): boolean {
  const fmt = structureFormat(t);
  return (
    t.follow_up_questions.length > 0 &&
    fmt !== 'persona' &&
    fmt !== 'multi-persona' &&
    fmt !== 'few-shot' &&
    fmt !== 'meta' &&
    fmt !== 'chain-of-verification' &&
    fmt !== 'step-back' &&
    fmt !== 'rubric' &&
    fmt !== 'chain-of-thought' &&
    fmt !== 'socratic'
  );
}

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

  // Alle invoer op deze pagina is sessie-state, bewust niet bewaard: wie de
  // pagina opent begint bij de keuze, met een schone lijst. In een training
  // gaat dit scherm van hand tot hand — dan is achtergebleven werk van de
  // vorige oefening storender dan een verloren concept.
  //
  // Waar het over gaat: optioneel startpunt. Is dit gevuld, dan vult de AI de
  // velden van de gekozen techniek alvast voor en voedt het het interview.
  const [context, setContext] = useState('');
  const [techniqueId, setTechniqueId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Geserialiseerde output van een gespecialiseerde bouwer (Persona/Few-Shot/
  // Meta) of de conclusie van het interview. Gaat als context mee bij het bouwen.
  const [builderText, setBuilderText] = useState('');
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
      if (active) settingsRef.current = s;
    });
    return () => {
      active = false;
    };
  }, []);

  const technique = techniques.find((t) => t.id === techniqueId) ?? null;

  /**
   * Kies een techniek: antwoorden van de vorige techniek vervallen en het
   * invulblok scrollt in beeld. Staat er al iets in "waar gaat het over", dan
   * vult de AI de velden alvast voor — anders begin je met lege velden.
   */
  function handleSelectTechnique(id: string, contextOverride?: string) {
    // Opnieuw op de actieve techniek klikken mag geen werk weggooien. Komt de
    // keuze van de adviseur, dan is er wél iets nieuws (de context uit het
    // gesprek), dus die mag de techniek opnieuw zetten.
    if (id === techniqueId && contextOverride === undefined) return;
    setTechniqueId(id);
    setAnswers({});
    setFieldMeta({});
    setBuilderText('');
    setUnclearReason(null);
    // Nieuwe techniek = het contextveld weer open (zie setEditingContext hierboven).
    setEditingContext(true);
    // Het invulblok staat bóven de lijst; scroll er naartoe zodat de gekozen
    // techniek meteen in beeld staat in plaats van boven de vouw te verschijnen.
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const chosen = techniques.find((t) => t.id === id);
    // `context` in de state is hier nog de oude waarde (setState is async), dus
    // het voor-invullen gaat uit van de meegegeven tekst als die er is.
    const draft = (contextOverride ?? context).trim();
    if (chosen && chosen.follow_up_questions.length > 0 && draft) {
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
    const toCheck = [context, builderText, ...Object.values(answers)]
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
    setOptimizing(true);
    requestAnimationFrame(() => {
      optimizingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    try {
      const s = settingsRef.current;
      // Leeg = de generator gebruikt een neutrale plaatshouder voor de eigen inhoud.
      const draft = context.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]';
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
        temperature: s.temperature,
        onChunk: setStreamText,
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
  }

  /** Alles leeg voor een frisse start (volgende oefening in de training). */
  function handleClearAll() {
    setContext('');
    setTechniqueId('');
    setAdvisorOpen(false);
    setAnswers({});
    setEditingContext(false);
    setFieldMeta({});
    setBuilderText('');
    setUnclearReason(null);
    setGuardrailFindings(null);
    setVersions([]);
    setActiveVersion(0);
    setPhase('input');
    toast.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  // Ook een lopend adviesgesprek telt als invoer: anders staat de knop er juist
  // niet op het moment dat je er middenin zit en eruit wilt.
  const hasContent =
    Boolean(context.trim()) ||
    Boolean(techniqueId) ||
    advisorOpen ||
    Object.keys(answers).length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            <Layers className="text-rijksoranje" /> Werken met Prompt Engineering
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Prompt engineering is je opdracht zo opschrijven dat de AI hem ook echt uitvoert zoals
            jij bedoelt.
          </p>
        </div>
        {phase === 'input' && hasContent && (
          <button
            type="button"
            onClick={handleClearAll}
            title="Wis je invoer en begin opnieuw"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-rijksoranje/40 hover:bg-rijksoranje/5 hover:text-rijksoranje dark:border-slate-700 dark:text-slate-200 dark:hover:border-rijksoranje/40 dark:hover:bg-rijksoranje/10"
          >
            <Eraser size={15} /> Opschonen
          </button>
        )}
      </div>

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
          />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-700 ${
            phase === 'transition' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          {/* Startsituatie: er is nog niets gekozen. Deze plek is gereserveerd
              voor het invulblok van de techniek — tot die keuze er is, staat
              hier de opdracht die naar de lijst eronder wijst. */}
          {!technique && !advisorOpen && (
            <section className="rounded-2xl border-2 border-dashed border-rijksblauw-200 bg-white/60 px-6 py-6 text-center dark:border-rijksblauw-500/30 dark:bg-slate-800/40">
              <p className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
                Klik hieronder voor je prompttechniek of framework.
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                De invulvelden verschijnen daarna hier, op deze plek.
              </p>
              {/* Twintig technieken zijn er twintig te veel als je er nog geen
                  één kent. Deze weg eromheen staat daarom in hetzelfde blok als
                  de opdracht om te kiezen: precies waar je vastloopt. */}
              <div className="mx-auto mt-6 max-w-md border-t border-slate-200 pt-6 dark:border-slate-700">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  Weet je niet welk framework?
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Laten we je helpen om de beste techniek erbij te pakken.
                </p>
                <button
                  type="button"
                  className="opl-btn-primary mt-4"
                  onClick={() => setAdvisorOpen(true)}
                >
                  <Compass size={17} /> Start het onderzoek
                </button>
              </div>

              {/* Het pijltje hoort onderaan, ná de adviseur: het wijst naar de
                  lijst hieronder. Stond het boven de adviseurknop, dan leek het
                  díé aan te wijzen — terwijl dat juist de omweg is voor wie het
                  niet weet, en de lijst de gewone weg voor wie het wel weet. */}
              <ArrowDown
                size={22}
                className="mx-auto mt-6 animate-bounce text-rijksoranje"
                aria-hidden
              />
            </section>
          )}

          {/* De adviseur neemt dezelfde plek in als het invulblok. Staat er al
              een techniek open, dan komt hij eróver: het advies kiezen mag geen
              half ingevuld formulier onaangekondigd weggooien. */}
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

          {/* Het invulblok van de gekozen techniek — op dezelfde plek als het
              startpunt-veld, dus bovenaan: kiezen in de lijst eronder vult dit
              blok, in beeld, in plaats van iets onder de lijst te openen. */}
          {technique && (
            <section
              key={technique.id}
              ref={builderRef}
              className="animate-fade-in scroll-mt-24 overflow-hidden rounded-2xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800"
            >
              <div className="h-1 w-full bg-gradient-to-r from-rijksblauw-400 to-rijksblauw-700" />
              <div className="p-6">
                <div className="mb-4 flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                    <Check size={14} />
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                      Bouw je prompt
                    </h2>
                    {(() => {
                      const fmt = structureFormat(technique);
                      const intro =
                        fmt === 'chain-of-thought'
                          ? 'De AI denkt hier stap voor stap met je mee en vraagt door tot het beeld compleet is. Je antwoorden worden meteen uitgewerkt tot een kant-en-klare prompt.'
                          : fmt === 'socratic'
                            ? 'De AI vraagt hier socratisch door om je aannames bloot te leggen. Je inzichten worden meteen uitgewerkt tot een kant-en-klare prompt.'
                            : 'Vul de velden met je eigen gegevens; zo ontstaat een herbruikbare prompt. Kopieer hem, of laat hem direct uitvoeren.';
                      return (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Voor{' '}
                          <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                            {technique.name}
                          </span>
                          : {intro}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                {/* Zo begin je: waar de techniek over moet gaan. Alleen bij
                    technieken die anders lopen dan verwacht, zoals Socratic:
                    die geeft vragen terug in plaats van antwoorden. Zie
                    techniqueStarter. */}
                {(() => {
                  const starter = techniqueStarter(technique);
                  if (!starter) return null;
                  return (
                    <div className="mb-4 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/60 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
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
                    fmt === 'rubric'
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
                  return (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                      {editingContext ? (
                        <>
                          <label htmlFor="techniek-context" className="opl-label">
                            Geef wat context mee (optioneel)
                          </label>
                          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                            {usesQuestionnaire
                              ? 'Vul je hier iets in, dan kan de AI de velden van deze techniek alvast voor je invullen; je past ze daarna zelf aan. Leeg laten mag.'
                              : isInterview
                                ? 'Vul je hier iets in, dan begint het gesprek bij jouw onderwerp in plaats van bij nul. Leeg laten mag; de AI vraagt er dan zelf naar.'
                                : 'Vul je hier iets in, dan begint deze techniek met jouw onderwerp in plaats van bij nul. Leeg laten mag.'}
                          </p>
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
                          {/* Ruim bemeten en op leestekstgrootte: hier komt een
                              hele opdracht in te staan, geen zoekterm. Een veld
                              van drie regels dwong tot scrollen in een tekst
                              die je juist wilt nalezen voordat je hem gebruikt.

                              Met het oranje sterretje uit de chat erbij: wat de
                              gebruiker in steekwoorden neerzet, staat op deze
                              plek vaak nog niet uitgeschreven, en juist hier
                              bepaalt die tekst wat de AI van de techniek maakt. */}
                          <OptimizableTextarea
                            id="techniek-context"
                            ref={contextRef}
                            rows={6}
                            value={context}
                            onValueChange={setContext}
                            placeholder={contextExample(technique)}
                            className="opl-input min-h-[9rem] resize-y px-4 py-3 text-[15px] leading-relaxed"
                            optimizeTitle="Schrijf mijn context uit met AI; je oorspronkelijke tekst kun je daarna terughalen"
                          />
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className={isInterview ? 'opl-btn-primary' : 'opl-btn-secondary'}
                              onClick={() => setEditingContext(false)}
                            >
                              {isInterview ? 'Start het gesprek' : 'Klaar'}
                            </button>
                            {usesQuestionnaire && context.trim() && (
                              <button
                                type="button"
                                className="opl-btn-primary"
                                title="Vervangt de huidige antwoorden door een voorstel van de AI"
                                // Zolang er een voor-invulling loopt geen tweede starten: elke
                                // klik was een extra aanroep, en de laatste die klaar was
                                // overschreef de velden, ook als die niets opleverde.
                                disabled={prefilling}
                                onClick={() => {
                                  setEditingContext(false);
                                  void runPrefill(technique, context.trim());
                                }}
                              >
                                <Sparkles size={16} />{' '}
                                {Object.keys(answers).length > 0
                                  ? 'Velden opnieuw voorinvullen'
                                  : 'Velden voorinvullen'}
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
                              'Geef wat context mee (optioneel)'
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
                    </div>
                  );
                })()}

                {/* Gespecialiseerde bouwers per techniek; anders de vragenlijst.
                    De bouwer levert geserialiseerde input die bij het bouwen
                    van de prompt wordt meegewogen. */}
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
                  // Chain-of-Thought / Socratic: het vraag-na-vraag-interview.
                  // De conclusie voedt het bouwen van de prompt. Het gesprek
                  // start pas als het contextveld dicht is — anders stelt de AI
                  // zijn eerste vraag terwijl de gebruiker nog context typt.
                  if (fmt === 'chain-of-thought' || fmt === 'socratic') {
                    if (editingContext) {
                      return (
                        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                          Het gesprek begint zodra je hierboven op &quot;Start het gesprek&quot;
                          klikt.
                        </p>
                      );
                    }
                    return (
                      <InterviewFlow
                        technique={technique}
                        settings={s}
                        goal={context}
                        onComplete={setBuilderText}
                      />
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
                      <FollowUpQuestions
                        technique={technique}
                        answers={answers}
                        onChange={setAnswers}
                        fieldMeta={fieldMeta}
                        onUserEdit={handleFieldEdit}
                        prefilling={prefilling}
                        preferredProvider={settingsRef.current.provider}
                        preferredModel={settingsRef.current.model}
                        onBuild={optimizing ? undefined : handleGenerate}
                      />
                    </div>
                  );
                })()}
              </div>
            </section>
          )}

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

          {optimizing && (
            <div ref={optimizingRef} className="scroll-mt-24">
              <OptimizingLoader techniqueName={technique?.name} streamText={streamText} />
            </div>
          )}

          {/* De vragenlijst zet de bouw-knop zelf in zijn knoppenbalk, naast
              "Volgende". Alleen de andere bouwers houden hem hier onder het
              blok, want die hebben geen eigen balk. */}
          {!optimizing && technique && !usesQuestionnaire(technique) && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button className="opl-btn-primary px-6 py-2.5" onClick={handleGenerate}>
                {optimizing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Prompt bouwen…
                  </>
                ) : (
                  <>
                    <Sparkles size={18} /> Bouw prompt
                  </>
                )}
              </button>
            </div>
          )}

          {/* De volledige lijst: frameworks links, losse technieken rechts. Blijft
              onder het invulblok staan, zodat je zonder omweg een andere techniek
              kunt pakken — die vult dan opnieuw het blok bovenaan. */}
          <section className="opl-card p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {technique
                  ? 'Een andere techniek proberen? Klik erop; je vult hem hierboven in.'
                  : 'Kies een prompt framework of techniek. Klik erop en je vult hem hierboven in.'}
              </p>
              {/* Ook hier bereikbaar: wie de lijst doorleest en er niet uitkomt,
                  zit op dit moment onderaan de pagina en niet bij het startblok. */}
              {!advisorOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setAdvisorOpen(true);
                    requestAnimationFrame(() => {
                      advisorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-rijksblauw-600 transition-colors hover:text-rijksoranje hover:underline dark:text-rijksblauw-300"
                >
                  <Compass size={15} /> Weet je niet welke?
                </button>
              )}
            </div>
            <TechniqueSelector selectedId={techniqueId} onSelect={handleSelectTechnique} />
          </section>
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
