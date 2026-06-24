import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  FileText,
  Compass,
  Check,
  Wand2,
  AlertTriangle,
  Eraser,
} from 'lucide-react';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import GoalRecommender from '@/components/optimizer/GoalRecommender';
import EntryTab from '@/components/optimizer/EntryTab';
import OwnPromptOptimizer from '@/components/optimizer/OwnPromptOptimizer';
import FollowUpQuestions from '@/components/optimizer/FollowUpQuestions';
import OptimizingLoader from '@/components/optimizer/OptimizingLoader';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { generatePrompt, prefillFields } from '@/services/optimizeService';
import type { FieldMeta } from '@/components/optimizer/FollowUpQuestions';
import { trackEvent } from '@/services/analyticsService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { getCurrentUser, stripMarkdown } from '@/lib/utils';
import { usePersistentDraft, clearAllDrafts } from '@/lib/usePersistentDraft';
import type { OptimizeResult, Technique } from '@/types';

/** Instapwijze: zelf kiezen/aanbevelen, óf de eigen prompt optimaliseren. */
type TechniqueMode = 'manual' | 'smart';
/** Welke flow er actief is: de techniek-keuze, of het optimaliseren van een eigen prompt. */
type EntryMode = 'techniques' | 'own-prompt';

export default function OptimizerPage() {
  const { promptId } = useParams<{ promptId?: string }>();
  const { techniques } = useReferenceData();

  // Eigen prompt/startpunt en doel worden in localStorage bewaard, zodat de tekst
  // niet verloren gaat bij een fout of herlaadactie. "Opschonen" maakt ze leeg.
  const [promptContent, setPromptContent, clearPromptDraft] = usePersistentDraft('ownPrompt');
  const [sourcePromptId, setSourcePromptId] = useState<string | null>(null);
  const [goal, setGoal, clearGoalDraft] = usePersistentDraft('goal');
  // Standaard staat de eigen-prompt-flow uitgeklapt: dat is het meest gebruikte
  // startpunt. 'smart' (complex vraagstuk) wordt pas actief als de gebruiker daar
  // bewust op klikt; daarom is techniqueMode standaard 'smart' zodat de tweede
  // tab meteen de juiste flow toont.
  const [techniqueMode, setTechniqueMode] = useState<TechniqueMode>('smart');
  const [entryMode, setEntryMode] = useState<EntryMode>('own-prompt');
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Herkomst per voor-ingevuld veld (origin-badges) + laadstaat tijdens prefill.
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>({});
  const [prefilling, setPrefilling] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(Boolean(promptId));
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
    setLoadingPrompt(true);
    getPrompt(promptId)
      .then((p) => {
        if (!active) return;
        if (p) {
          setPromptContent(p.content);
          setSourcePromptId(p.id);
        }
      })
      .finally(() => active && setLoadingPrompt(false));
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

  function handleSelectTechnique(id: string) {
    setTechniqueId(id);
    setAnswers({}); // antwoorden resetten bij nieuwe techniek
    setFieldMeta({});
    // Wacht tot het vervolgvragen-paneel is gerenderd en scroll het in beeld.
    requestAnimationFrame(() => {
      followUpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Heeft de gebruiker al tekst meegegeven? Vul de velden dan alvast voor zodat
    // hij niet met lege velden begint. Bron: het expliciete startpunt (promptContent)
    // of anders het beschreven vraagstuk (goal, uit de "complex vraagstuk"-flow).
    const chosen = techniques.find((t) => t.id === id);
    const draft = promptContent.trim() || goal.trim();
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

    // Alleen de meegegeven inhoud op guardrails toetsen (mag leeg zijn:
    // de generator levert een herbruikbare template met plaatshouders).
    if (promptContent.trim()) {
      const s = settingsRef.current;
      const findings: GuardrailFinding[] = [
        ...(s.pii.enabled ? detectPii(promptContent) : []),
        ...detectBlockedTopics(promptContent, s.blockedTopics),
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
      const res = await generatePrompt({
        technique,
        promptContent: draft,
        followUpAnswers: answers,
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
        user_identifier: getCurrentUser(),
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

  /** Resultaat van de eigen-prompt-flow: toon het via dezelfde uitvoer-fase. */
  function handleOwnPromptResult(res: OptimizeResult, usedTechnique: Technique) {
    void trackEvent({
      event_type: 'optimization_run',
      user_identifier: getCurrentUser(),
      prompt_id: null,
      technique_id: usedTechnique.id,
      metadata: { provider: res.provider, flow: 'own-prompt' },
    });
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
    setTechniqueId(null);
    setAnswers({});
    setFieldMeta({});
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
            Genereer een herbruikbare prompt-template. De inhoud vul je zelf aan in je eigen chat.
            Kopieer en plak de template telkens wanneer je hem nodig hebt.
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
                  onSelect={handleSelectTechnique}
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
                            Bouw je template
                          </h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Beantwoord de vragen voor{' '}
                            <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                              {technique.name}
                            </span>
                            . Zo ontstaat een herbruikbare template die collega&apos;s opnieuw
                            kunnen invullen.
                          </p>
                        </div>
                      </div>
                      <FollowUpQuestions
                        technique={technique}
                        answers={answers}
                        onChange={setAnswers}
                        fieldMeta={fieldMeta}
                        onUserEdit={handleFieldEdit}
                        prefilling={prefilling}
                      />

                      {/* Optioneel startpunt: eigen tekst die in de template verwerkt wordt */}
                      <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-700">
                        <label className="opl-label" htmlFor="draft-input">
                          Startpunt of voorbeeldtekst{' '}
                          <span className="font-normal text-slate-400">(optioneel)</span>
                        </label>
                        {loadingPrompt ? (
                          <div className="skeleton h-24 w-full rounded-lg" />
                        ) : (
                          <textarea
                            id="draft-input"
                            className="opl-input min-h-[96px] resize-y font-mono text-[13px]"
                            value={promptContent}
                            onChange={(e) => {
                              setPromptContent(e.target.value);
                              setSourcePromptId(null); // handmatig bewerkt = niet langer gekoppeld
                            }}
                            placeholder="Laat leeg voor een lege template, of plak hier een bestaande prompt/tekst als startpunt…"
                          />
                        )}
                        {sourcePromptId && (
                          <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                            <FileText size={12} /> Gekoppeld aan een opgeslagen prompt. De generatie
                            wordt bewaard.
                          </p>
                        )}
                      </div>
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
                          <Loader2 size={18} className="animate-spin" /> Template bouwen…
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} /> Bouw template
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            );

            const smart = entryMode === 'techniques' && techniqueMode === 'smart';
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
                  title="Help mij met een prompt om mijn doel te bereiken"
                  description="Beschrijf wat je wilt bereiken, dan vinden we de techniek waarmee je je prompt opbouwt."
                />
              </div>
            );

            // De eigen-prompt-flow rendert de tabs zelf als header (oranje rand om
            // chat + advies; frameworklijst eronder). De doel-flow doet hetzelfde:
            // GoalRecommender krijgt de tabs als header, de template-velden als
            // 'templateBuilder' (binnen de rand) en de techniekenlijst als
            // 'manualList' (buiten de rand).
            return ownActive ? (
              <OwnPromptOptimizer
                settings={settingsRef.current}
                onResult={handleOwnPromptResult}
                header={tabs}
              />
            ) : (
              <GoalRecommender
                selectedTechniqueId={techniqueId}
                onSelectTechnique={handleSelectTechnique}
                goal={goal}
                onGoalChange={setGoal}
                onClear={handleClearAll}
                header={tabs}
                templateBuilder={templateBuilderNode}
                manualList={manualListNode}
              />
            );
          })()}

          {/* Handmatige keuzelijst — onder zowel de eigen-prompt-flow als de
              handmatige techniek-flow. Frameworks links, technieken rechts; klik
              op één opent de invulbare velden eronder (met auto-scroll). In de
              doel-flow zit deze lijst al binnen GoalRecommender. */}
          {(ownActive || (entryMode === 'techniques' && !smart)) && manualListNode}
          {(ownActive || (entryMode === 'techniques' && !smart)) && templateBuilderNode}
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
