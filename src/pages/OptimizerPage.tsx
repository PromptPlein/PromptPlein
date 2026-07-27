import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  Compass,
  Check,
  Wand2,
  AlertTriangle,
  Eraser,
} from 'lucide-react';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import GoalDialog from '@/components/optimizer/GoalDialog';
import EntryTab from '@/components/optimizer/EntryTab';
import OwnPromptOptimizer from '@/components/optimizer/OwnPromptOptimizer';
import FollowUpQuestions from '@/components/optimizer/FollowUpQuestions';
import PersonaBuilder from '@/components/optimizer/PersonaBuilder';
import FewShotBuilder from '@/components/optimizer/FewShotBuilder';
import MetaBuilder from '@/components/optimizer/MetaBuilder';
import DocumentUpload from '@/components/optimizer/DocumentUpload';
import InterviewFlow from '@/components/optimizer/InterviewPanel';
import OptimizingLoader from '@/components/optimizer/OptimizingLoader';
import { structureFormat } from '@/lib/techniques';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { generatePrompt, prefillFields } from '@/services/optimizeService';
import type { FieldMeta } from '@/components/optimizer/FollowUpQuestions';
import { trackEvent } from '@/services/analyticsService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { activityIdentifier, stripMarkdown } from '@/lib/utils';
import { usePersistentDraft, usePersistentObject, clearAllDrafts } from '@/lib/usePersistentDraft';
import type { OptimizeResult, Technique } from '@/types';

/** Instapwijze: zelf kiezen/aanbevelen, óf de eigen prompt optimaliseren. */
type TechniqueMode = 'manual' | 'smart';
/** Welke flow er actief is: de techniek-keuze, of het optimaliseren van een eigen prompt. */
type EntryMode = 'techniques' | 'own-prompt';

export default function OptimizerPage() {
  const { promptId } = useParams<{ promptId?: string }>();
  const { techniques } = useReferenceData();
  // De ingelogde gebruiker, zodat analytics-events op naam/e-mail worden gelogd
  // en een beheerder in "Recente activiteit" ziet wie iets deed (niet "Anoniem").
  const { profile, user } = useAuth();

  // Eigen prompt/startpunt en doel worden in localStorage bewaard, zodat de tekst
  // niet verloren gaat bij een fout of herlaadactie. "Opschonen" maakt ze leeg.
  const [promptContent, setPromptContent, clearPromptDraft] = usePersistentDraft('ownPrompt');
  const [sourcePromptId, setSourcePromptId] = useState<string | null>(null);
  // De doel-flow (GoalDialog) beheert dit veld zelf via dezelfde 'goal'-sleutel;
  // de pagina leest het alleen nog (titel-fallback, hasDraftContent, opschonen).
  const [goal, , clearGoalDraft] = usePersistentDraft('goal');
  // Standaard staat de eigen-prompt-flow uitgeklapt: dat is het meest gebruikte
  // startpunt. 'smart' (complex vraagstuk) wordt pas actief als de gebruiker daar
  // bewust op klikt; daarom is techniqueMode standaard 'smart' zodat de tweede
  // tab meteen de juiste flow toont.
  const [techniqueMode, setTechniqueMode] = useState<TechniqueMode>('smart');
  const [entryMode, setEntryMode] = useState<EntryMode>('own-prompt');
  // De gekozen techniek + de ingevulde antwoorden worden in localStorage bewaard,
  // zodat de gebruiker bij een fout, herlaadactie of per ongeluk gesloten tab
  // terugkeert op de vragenlijst mét zijn werk. Beide delen het opl.draft.-prefix,
  // dus "Opschonen" (clearAllDrafts) wist ze mee. Een lege string = geen techniek
  // (technique-lookup faalt dan → null, precies zoals voorheen bij `null`).
  const [techniqueId, setTechniqueId] = usePersistentDraft('builderTechniqueId');
  const [answers, setAnswers] = usePersistentObject<Record<string, string>>('builderAnswers', {});
  // Geserialiseerde output van een gespecialiseerde bouwer (Persona/Few-Shot/Meta)
  // wanneer de gebruiker zo'n techniek handmatig kiest. Gaat als context mee bij het
  // genereren; leeg voor gewone technieken (die de vragenlijst gebruiken).
  const [builderText, setBuilderText] = useState('');
  // Herkomst per voor-ingevuld veld (origin-badges) + laadstaat tijdens prefill.
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>({});
  const [prefilling, setPrefilling] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  // Admin-bepaalde AI-instellingen; gebruikers kiezen niet meer zelf.
  const settingsRef = useRef<AiSettings>(DEFAULT_AI_SETTINGS);
  const [guardrailFindings, setGuardrailFindings] = useState<GuardrailFinding[] | null>(null);
  // Terugkoppeling wanneer de AI de input als onzin beoordeelt: geen output,
  // maar een blokkerende uitleg zodat de gebruiker zijn invoer kan verduidelijken.
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  // 'input' = invoerpaneel zichtbaar, 'transition' = uitfaden, 'output' = resultaat
  const [phase, setPhase] = useState<'input' | 'transition' | 'output'>('input');
  const followUpRef = useRef<HTMLElement>(null);
  // Anker voor het laadscherm zodat we er bij het genereren naartoe scrollen
  // (de genereerknop staat onderaan een lang formulier; zonder scroll mist de
  // gebruiker de analyse die boven de vouw plaatsvindt).
  const optimizingRef = useRef<HTMLDivElement>(null);

  // Laad de bronprompt als er via de URL een prompt is meegegeven.
  useEffect(() => {
    if (!promptId) return;
    let active = true;
    getPrompt(promptId)
      .then((p) => {
        if (!active) return;
        if (p) {
          setPromptContent(p.content);
          setSourcePromptId(p.id);
        }
      });
    return () => {
      active = false;
    };
  }, [promptId]);

  // Laad de door de admin ingestelde AI-instellingen (geldt voor alle gebruikers).
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
   * Kies een techniek. `source` bepaalt UIT WELK zichtbaar veld we eventueel
   * voor-invullen, zodat we nooit analyseren op basis van een verborgen draft:
   *  - 'goal'   → de doel-flow (het "Wat wil je bereiken?"-veld)
   *  - 'manual' → de handmatige keuzelijst; vul alleen voor als het zichtbare
   *               startpunt-veld (promptContent) ingevuld is.
   * Belangrijk: we vallen NIET terug op een ander veld. Eerder leidde dat tot
   * de bug dat een leeg zichtbaar veld toch analyseerde, omdat een oude draft
   * (goal of promptContent) nog in localStorage stond.
   */
  function handleSelectTechnique(id: string, source: 'goal' | 'manual' = 'manual') {
    // Opnieuw op de reeds actieve techniek klikken (of terugkomen op een uit
    // localStorage herstelde techniek): antwoorden NIET wissen en niet opnieuw
    // voor-invullen — dan zou het herstelde/ingevulde werk verloren gaan.
    if (id === techniqueId) return;
    setTechniqueId(id);
    setAnswers({}); // antwoorden resetten bij nieuwe techniek
    setFieldMeta({});
    setBuilderText(''); // output van de vorige bouwer wissen
    // Wacht tot het vervolgvragen-paneel is gerenderd en scroll het in beeld.
    requestAnimationFrame(() => {
      followUpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const chosen = techniques.find((t) => t.id === id);
    const draft = (source === 'goal' ? goal : promptContent).trim();
    if (chosen && chosen.follow_up_questions.length > 0 && draft) {
      void runPrefill(chosen, draft);
    }
  }

  /** Vul de velden van de gekozen techniek voor op basis van de eigen prompt. */
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
      // De prompt was onzin → toon de terugkoppeling i.p.v. velden voor te vullen.
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je invoer is nog niet duidelijk genoeg om de velden voor te vullen. Beschrijf concreet wat je wilt bereiken.',
        );
        return;
      }
      if (res.error) toast(res.error, { icon: 'ℹ️' });
      // Alleen overnemen als de gebruiker ondertussen niet van techniek wisselde.
      setAnswers(Object.fromEntries(res.fields.map((f) => [f.id, f.value])));
      setFieldMeta(
        Object.fromEntries(res.fields.map((f) => [f.id, { source: f.source, note: f.note }])),
      );
    } catch {
      // Voor-invullen is best-effort; bij een fout begint de gebruiker met lege velden.
    } finally {
      setPrefilling(false);
    }
  }

  /**
   * Vul de velden van de gekozen techniek voor op basis van een geüpload document
   * (Template-based Output): de AI leest het document volledig door en leidt de
   * layout (format, rubrieken, regels) af. Hergebruikt hetzelfde prefill-mechanisme
   * als de plan-bouwer. Bestaande, door de gebruiker ingevulde velden blijven staan.
   */
  async function prefillFromStructure(
    text: string,
    source: 'document' | 'brief',
  ): Promise<boolean> {
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
      // Afgeleide waarden toevoegen; door de gebruiker ingevulde velden niet overschrijven.
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

  /** Controleert eerst de guardrails; bij een treffer wordt om bevestiging gevraagd. */
  function handleGenerate() {
    if (!technique) {
      toast.error('Kies eerst een techniek.');
      return;
    }

    // De meegegeven inhoud (eigen tekst + bouwer-output) op guardrails toetsen (mag
    // leeg zijn: de generator levert een herbruikbare template met plaatshouders).
    const toCheck = [promptContent, builderText].map((v) => v.trim()).filter(Boolean).join('\n');
    if (toCheck) {
      const s = settingsRef.current;
      const findings: GuardrailFinding[] = [
        ...(s.pii.enabled ? detectPii(toCheck) : []),
        ...detectBlockedTopics(toCheck, s.blockedTopics),
      ];
      if (findings.length > 0) {
        setGuardrailFindings(findings); // toon bevestigingsdialoog; blokkeer tot bevestiging
        return;
      }
    }
    void runGenerate();
  }

  async function runGenerate() {
    if (!technique) return;
    setGuardrailFindings(null);
    setUnclearReason(null); // nieuwe poging: oude onduidelijk-melding wissen
    setOptimizing(true);
    // Wacht tot het laadscherm is gerenderd en scroll het rustig in beeld, zodat
    // de gebruiker de analyse ziet i.p.v. naar de onderkant van het formulier te staren.
    requestAnimationFrame(() => {
      optimizingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    try {
      const s = settingsRef.current;
      // Leeg = de generator gebruikt een neutrale plaatshouder voor de eigen inhoud.
      const draft = promptContent.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]';
      // Chain-of-Thought/Socratic: is het vraag-na-vraag-interview al in de tool
      // gevoerd (de conclusie staat in builderText)? Dan hoeft de prompt de
      // dialoog niet meer "aan te zetten" — de generator maakt een uitgewerkte,
      // direct uitvoerbare prompt.
      const fmt = structureFormat(technique);
      const interviewResolved =
        (fmt === 'chain-of-thought' || fmt === 'socratic') && Boolean(builderText.trim());
      const res = await generatePrompt({
        technique,
        promptContent: draft,
        followUpAnswers: answers,
        // Output van een gespecialiseerde bouwer (Persona/Few-Shot/Meta) als
        // gelabelde context meesturen, zodat die de template mede bepaalt.
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
      });

      // Clarity-gate: de AI vond de input onzin en maakte bewust geen template.
      // Toon de uitleg in plaats van door te gaan naar het resultaatscherm.
      if (res.unclear) {
        setUnclearReason(
          res.reason?.trim() ||
            'Je invoer is niet duidelijk genoeg om er een zinvolle prompt van te maken. ' +
              'Beschrijf concreet wat je wilt bereiken en vul de velden inhoudelijk in.',
        );
        return;
      }

      void trackEvent({
        event_type: 'optimization_run',
        user_identifier: activityIdentifier(profile, user?.email),
        prompt_id: sourcePromptId,
        technique_id: technique.id,
        metadata: { provider: res.provider },
      });

      // Fade-out van het invoerpaneel (0.8s), dan resultaat tonen.
      setPhase('transition');
      setTimeout(() => {
        setResult(res);
        setPhase('output');
      }, 400);

      // Sla de optimalisatie op als deze bij een bestaande prompt hoort.
      if (sourcePromptId) {
        await saveOptimization({
          prompt_id: sourcePromptId,
          technique_id: technique.id,
          optimized_content: res.optimized_content,
          follow_up_answers: answers,
        }).catch(() => {
          /* opslaan is best-effort; faal de UX niet */
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Optimaliseren mislukt';
      toast.error(msg);
    } finally {
      setOptimizing(false);
    }
  }

  /**
   * Resultaat van de eigen-prompt-flow óf de plan-bouwer: toon het via dezelfde
   * uitvoer-fase. Een aanwezig `recipe` markeert een plan-wizard-run: dan loggen
   * we `flow:'plan-wizard'` met het aantal stappen en bewaren we het recept bij
   * een optimalisatie (herleidbaarheid/herhaling).
   */
  function handleOwnPromptResult(res: OptimizeResult, usedTechnique: Technique) {
    const isPlanWizard = Boolean(res.recipe);
    // De doel-flow levert een `dialogue` mee (het gevoerde gesprek); zo blijft in
    // de analytics zichtbaar via welke instap de prompt tot stand kwam.
    const flow = isPlanWizard ? 'plan-wizard' : res.dialogue ? 'goal' : 'own-prompt';
    void trackEvent({
      event_type: 'optimization_run',
      user_identifier: activityIdentifier(profile, user?.email),
      prompt_id: null,
      technique_id: usedTechnique.id,
      metadata: {
        provider: res.provider,
        flow,
        ...(res.recipe ? { steps: res.recipe.plan.steps.length } : {}),
        ...(res.dialogue ? { answered: res.dialogue.transcript.length } : {}),
      },
    });
    // Plan-wizard: bewaar het recept bij een optimalisatie-rij (prompt_id mag leeg).
    if (res.recipe) {
      void saveOptimization({
        prompt_id: null,
        technique_id: usedTechnique.id,
        optimized_content: res.optimized_content,
        follow_up_answers: {},
        recipe: res.recipe,
      }).catch(() => {
        /* opslaan van het recept is best-effort; faal de UX niet */
      });
    }
    setTechniqueId(usedTechnique.id); // zodat OptimizedOutput de juiste techniek toont
    setPhase('transition');
    setTimeout(() => {
      setResult(res);
      setPhase('output');
    }, 400);
  }

  function handleReset() {
    setResult(null);
    setPhase('input');
  }

  /**
   * "Opschonen": maak alles leeg voor een frisse start. Wist zowel de bewaarde
   * tekst (drafts in localStorage) als alle afgeleide state in deze sessie —
   * gekozen techniek, voor-ingevulde antwoorden, meldingen en het resultaat.
   * Belangrijk: clearAllDrafts() haalt óók drafts weg van velden die nu niet
   * gemonteerd zijn (bijv. de eigen prompt in de andere flow), zodat er
   * gegarandeerd niets blijft staan.
   */
  function handleClearAll() {
    clearPromptDraft();
    clearGoalDraft();
    clearAllDrafts();
    setSourcePromptId(null);
    setTechniqueId('');
    setAnswers({});
    setFieldMeta({});
    setBuilderText('');
    setUnclearReason(null);
    setGuardrailFindings(null);
    setResult(null);
    setPhase('input');
    toast.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  // Is er iets om op te schonen? Toon de knop alleen als dat zo is.
  const hasDraftContent =
    Boolean(promptContent.trim()) ||
    Boolean(goal.trim()) ||
    Boolean(techniqueId) ||
    Object.keys(answers).length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            <Sparkles className="text-rijksoranje" /> Prompt genereren
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Genereer een herbruikbare prompt. De inhoud vul je zelf aan in je eigen chat.
            Kopieer en plak de prompt telkens wanneer je hem nodig hebt.
          </p>
        </div>
        {/* Opschonen: maakt de bewaarde tekst en alle voortgang leeg voor een
            frisse start. Alleen zichtbaar in de invoerfase als er iets te wissen is. */}
        {phase === 'input' && hasDraftContent && (
          <button
            type="button"
            onClick={handleClearAll}
            title="Wis je tekst en begin opnieuw"
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
            goal={goal}
            onReset={handleReset}
          />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-700 ${
            phase === 'transition' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          {/* De volledige techniekenlijst (handmatige keuze). In de doel-flow valt
              dit als losse kaart buiten de oranje rand; in de handmatige flow staat
              het gewoon op de pagina. */}
          {(() => {
            const manualListNode = (
              <section className="opl-card p-6">
                <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                  Of kies zelf direct een prompt framework of techniek en vul de velden handmatig in:
                </p>
                <TechniqueSelector
                  selectedId={techniqueId}
                  onSelect={(id) => handleSelectTechnique(id, 'manual')}
                />
              </section>
            );

            // De "Bouw je template"-velden + meldingen + genereerknop. Verschijnen
            // pas zodra er een techniek gekozen is. In de doel-flow vallen ze binnen
            // de oranje rand (via GoalRecommender); in de handmatige flow op de pagina.
            const templateBuilderNode = (
              <>
                {technique && (
                  <section
                    key={technique.id}
                    ref={followUpRef}
                    className="animate-fade-in scroll-mt-24 overflow-hidden rounded-2xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800"
                  >
                    {/* Accentbalk bovenaan */}
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
                            // Chain-of-Thought/Socratic voeren het gesprek ÍN de
                            // tool; de conclusie wordt meteen uitgewerkt tot een
                            // direct uitvoerbare prompt — maak dat expliciet.
                            const intro =
                              fmt === 'chain-of-thought'
                                ? 'De AI denkt hier stap voor stap met je mee en vraagt door tot het beeld compleet is. Je antwoorden worden meteen uitgewerkt tot een kant-en-klare prompt — voer hem direct uit of sla hem op.'
                                : fmt === 'socratic'
                                  ? 'De AI vraagt hier socratisch door om je aannames bloot te leggen. Je inzichten worden meteen uitgewerkt tot een kant-en-klare prompt — voer hem direct uit of sla hem op.'
                                  : 'Beantwoord de vragen; zo ontstaat een herbruikbare prompt — kopieer hem, of laat hem direct uitvoeren voor een kant-en-klaar resultaat.';
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
                      {/* Gespecialiseerde bouwers per techniek; anders de gewone
                          vragenlijst. De bouwer levert geserialiseerde input aan die
                          bij het genereren wordt meegewogen. */}
                      {(() => {
                        const fmt = structureFormat(technique);
                        const s = settingsRef.current;
                        if (fmt === 'persona' || fmt === 'multi-persona') {
                          return (
                            <PersonaBuilder
                              multi={fmt === 'multi-persona'}
                              settings={s}
                              technique={technique}
                              context={promptContent || goal}
                              onSerialized={setBuilderText}
                            />
                          );
                        }
                        if (fmt === 'few-shot') {
                          return <FewShotBuilder settings={s} onSerialized={setBuilderText} />;
                        }
                        if (fmt === 'meta') {
                          return (
                            <MetaBuilder
                              settings={s}
                              goal={promptContent || goal}
                              onSerialized={setBuilderText}
                            />
                          );
                        }
                        // Chain-of-Thought / Socratic: het interactieve vraag-na-vraag-
                        // interview (zoals in de plan-bouwer). De conclusie voedt het
                        // genereren.
                        if (fmt === 'chain-of-thought' || fmt === 'socratic') {
                          // Bewust GEEN goal meegeven: in de losse keuze is er nog geen
                          // context. Het interview vraagt zelf eerst wat de gebruiker wil
                          // bereiken (niet lenen uit het doel-veld van de andere flow).
                          return (
                            <InterviewFlow
                              technique={technique}
                              settings={s}
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
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </section>
                )}

                {/* Onduidelijke-invoer-melding */}
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

                {/* Laadscherm tijdens het bouwen van de template; anker voor de
                    auto-scroll bij genereren. */}
                {optimizing && (
                  <div ref={optimizingRef} className="scroll-mt-24">
                    <OptimizingLoader techniqueName={technique?.name} />
                  </div>
                )}

                {/* Genereerknop */}
                {!optimizing && technique && (
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      className="opl-btn-primary px-6 py-2.5"
                      onClick={handleGenerate}
                      disabled={optimizing || !technique}
                    >
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
              </>
            );

            const ownActive = entryMode === 'own-prompt';

            return (
              <div className="space-y-6">
          {/* 1. Segmented control: kies eerst je instap (twee gescheiden knoppen),
              daarna verschijnt de bijbehorende chat naadloos binnen hetzelfde
              oranje-omrande element — zo valt de oranje rand alléén om de chat.
              De tabs (header) gaan in beide flows mee in datzelfde element. */}
          {(() => {
            const smartActive = entryMode === 'techniques' && techniqueMode === 'smart';
            const tabs = (
              <div
                role="tablist"
                aria-label="Kies hoe je wilt starten"
                className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-slate-700 dark:border-slate-700"
              >
                <EntryTab
                  active={ownActive}
                  onClick={() => setEntryMode('own-prompt')}
                  icon={<Wand2 size={20} />}
                  title="Optimaliseer jouw eigen prompt"
                  description="Heb je al een prompt? Wij zoeken het best passende prompt framework, analyseren je prompt en vullen aan wat nog ontbreekt."
                />
                <EntryTab
                  active={smartActive}
                  accent="blauw"
                  onClick={() => {
                    setEntryMode('techniques');
                    setTechniqueMode('smart');
                  }}
                  icon={<Compass size={20} />}
                  title="Help mij met het bereiken van mijn doel"
                  description="Beschrijf wat je wilt bereiken, dan vinden we de techniek waarmee je je prompt opbouwt."
                />
              </div>
            );

            // De eigen-prompt-flow rendert de tabs zelf als header (oranje rand om
            // chat + advies; frameworklijst eronder). De doel-flow toont de
            // vragen-dialoog (GoalDialog) met de tabs als header: de gebruiker
            // beschrijft zijn doel, de AI denkt stap voor stap mee met één vraag
            // per keer, analyseert daarna het gesprek en stelt het best passende
            // framework voor. De handmatige techniekenlijst + template-velden
            // vallen daaronder (buiten de rand), net als bij de eigen-prompt-flow.
            return ownActive ? (
              <OwnPromptOptimizer
                settings={settingsRef.current}
                onResult={handleOwnPromptResult}
                header={tabs}
              />
            ) : (
              <GoalDialog
                settings={settingsRef.current}
                onResult={handleOwnPromptResult}
                header={tabs}
              />
            );
          })()}

          {/* Handmatige keuzelijst — onder de eigen-prompt-flow, de doel-flow
              (PlanWizard) én de handmatige techniek-flow. Frameworks links,
              technieken rechts; klik op één opent de invulbare velden eronder
              (met auto-scroll). Biedt in de doel-flow een handmatige uitweg naast
              het slimme plan. */}
          {manualListNode}
          {templateBuilderNode}
              </div>
            );
          })()}

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
