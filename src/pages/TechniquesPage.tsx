import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Eraser, Layers, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import FollowUpQuestions, { type FieldMeta } from '@/components/optimizer/FollowUpQuestions';
import PersonaBuilder from '@/components/optimizer/PersonaBuilder';
import FewShotBuilder from '@/components/optimizer/FewShotBuilder';
import MetaBuilder from '@/components/optimizer/MetaBuilder';
import DocumentUpload from '@/components/optimizer/DocumentUpload';
import InterviewFlow from '@/components/optimizer/InterviewFlow';
import OptimizingLoader from '@/components/optimizer/OptimizingLoader';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { generatePrompt, prefillFields } from '@/services/optimizeService';
import { trackEvent } from '@/services/analyticsService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import { structureFormat } from '@/lib/techniques';
import { activityIdentifier, stripMarkdown } from '@/lib/utils';
import { usePersistentDraft, usePersistentObject } from '@/lib/usePersistentDraft';
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

  // Waar het over gaat: optioneel startpunt. Is dit gevuld, dan vult de AI de
  // velden van de gekozen techniek alvast voor en voedt het het interview.
  const [context, setContext, clearContext] = usePersistentDraft('techniqueContext');
  // Gekozen techniek + antwoorden overleven een herlaadactie: wie tijdens de
  // training per ongeluk de tab sluit, komt terug op zijn ingevulde velden.
  const [techniqueId, setTechniqueId, clearTechniqueId] = usePersistentDraft('lessonTechniqueId');
  const [answers, setAnswers, clearAnswers] = usePersistentObject<Record<string, string>>(
    'lessonAnswers',
    {},
  );
  // Geserialiseerde output van een gespecialiseerde bouwer (Persona/Few-Shot/
  // Meta) of de conclusie van het interview. Gaat als context mee bij het bouwen.
  const [builderText, setBuilderText] = useState('');
  const [fieldMeta, setFieldMeta] = useState<FieldMeta>({});
  const [prefilling, setPrefilling] = useState(false);

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
  function handleSelectTechnique(id: string) {
    // Opnieuw op de actieve techniek klikken mag geen werk weggooien.
    if (id === techniqueId) return;
    setTechniqueId(id);
    setAnswers({});
    setFieldMeta({});
    setBuilderText('');
    setUnclearReason(null);
    requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const chosen = techniques.find((t) => t.id === id);
    const draft = context.trim();
    if (chosen && chosen.follow_up_questions.length > 0 && draft) {
      void runPrefill(chosen, draft);
    }
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

  /** Een verbeter-ronde uit de Testkamer: achteraan toevoegen en actief maken. */
  function handleRefined(res: OptimizeResult) {
    void trackEvent({
      event_type: 'optimization_run',
      user_identifier: activityIdentifier(profile, user?.email),
      prompt_id: null,
      technique_id: technique?.id,
      metadata: { provider: res.provider, flow: 'refine', version: versions.length + 1 },
    });
    setVersions((cur) => [...cur, res]);
    setActiveVersion(versions.length);
  }

  /** Terug naar de invoer met dezelfde techniek en antwoorden. */
  function handleReset() {
    setVersions([]);
    setActiveVersion(0);
    setPhase('input');
  }

  /** Alles leeg voor een frisse start (volgende oefening in de training). */
  function handleClearAll() {
    clearContext();
    clearTechniqueId();
    clearAnswers();
    setFieldMeta({});
    setBuilderText('');
    setUnclearReason(null);
    setGuardrailFindings(null);
    setVersions([]);
    setActiveVersion(0);
    setPhase('input');
    toast.success('Alles opgeschoond. Je begint met een schone lei.');
  }

  const hasContent =
    Boolean(context.trim()) || Boolean(techniqueId) || Object.keys(answers).length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            <Layers className="text-rijksoranje" /> Werk met prompttechnieken
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Kies zelf een prompt framework of techniek, vul je eigen gegevens in en bouw daar een
            herbruikbare prompt van. Zo zie je precies wat elke techniek van je vraagt.
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
            onRefined={handleRefined}
            aiSettings={settingsRef.current}
          />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-700 ${
            phase === 'transition' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          {/* Optioneel startpunt: waar gaat het over? Gevuld → de velden van de
              gekozen techniek worden voor-ingevuld en het interview begint met
              context in plaats van bij nul. */}
          <section className="opl-card p-6">
            <label
              htmlFor="techniek-context"
              className="block font-semibold text-slate-800 dark:text-slate-100"
            >
              Waar gaat het over?{' '}
              <span className="font-normal text-slate-400 dark:text-slate-500">(optioneel)</span>
            </label>
            <p className="mt-0.5 mb-2 text-sm text-slate-500 dark:text-slate-400">
              Beschrijf je taak in een paar zinnen. Vullen we in, dan vult de AI de velden van de
              techniek die je kiest alvast voor je in — je past ze daarna zelf aan.
            </p>
            <textarea
              id="techniek-context"
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Bijvoorbeeld: ik schrijf een brief aan bewoners over werkzaamheden in hun straat."
              className="opl-input w-full resize-y"
            />
          </section>

          {/* De volledige lijst: frameworks links, losse technieken rechts. */}
          <section className="opl-card p-6">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Kies een prompt framework of techniek. Klik erop en de invulvelden verschijnen
              eronder.
            </p>
            <TechniqueSelector selectedId={techniqueId} onSelect={handleSelectTechnique} />
          </section>

          {/* Het invulblok van de gekozen techniek. */}
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
                            : 'Vul de velden met je eigen gegevens; zo ontstaat een herbruikbare prompt — kopieer hem, of laat hem direct uitvoeren.';
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
                  // Chain-of-Thought / Socratic: het vraag-na-vraag-interview.
                  // De conclusie voedt het bouwen van de prompt.
                  if (fmt === 'chain-of-thought' || fmt === 'socratic') {
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

          {!optimizing && technique && (
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
