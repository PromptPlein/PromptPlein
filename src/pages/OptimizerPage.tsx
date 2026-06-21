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
} from 'lucide-react';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import GoalRecommender from '@/components/optimizer/GoalRecommender';
import EntryOptionCard from '@/components/optimizer/EntryOptionCard';
import OwnPromptOptimizer from '@/components/optimizer/OwnPromptOptimizer';
import FollowUpQuestions from '@/components/optimizer/FollowUpQuestions';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { generatePrompt, prefillFields } from '@/services/optimizeService';
import type { FieldMeta } from '@/components/optimizer/FollowUpQuestions';
import { trackEvent } from '@/services/analyticsService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { getCurrentUser } from '@/lib/utils';
import type { OptimizeResult, Technique } from '@/types';

/** Instapwijze: zelf kiezen/aanbevelen, óf de eigen prompt optimaliseren. */
type TechniqueMode = 'manual' | 'smart';
/** Welke flow er actief is: de techniek-keuze, of het optimaliseren van een eigen prompt. */
type EntryMode = 'techniques' | 'own-prompt';

export default function OptimizerPage() {
  const { promptId } = useParams<{ promptId?: string }>();
  const { techniques } = useReferenceData();

  const [promptContent, setPromptContent] = useState('');
  const [sourcePromptId, setSourcePromptId] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [techniqueMode, setTechniqueMode] = useState<TechniqueMode>('manual');
  const [entryMode, setEntryMode] = useState<EntryMode>('techniques');
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
    try {
      const s = settingsRef.current;
      // Leeg = de generator gebruikt een neutrale plaatshouder voor de eigen inhoud.
      const draft = promptContent.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]';
      const res = await generatePrompt({
        technique,
        promptContent: draft,
        followUpAnswers: answers,
        preferredProvider: s.provider,
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          <Sparkles className="text-rijksoranje" /> Prompt genereren
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Genereer een herbruikbare prompt-template. De inhoud vul je zelf aan in je eigen chat.
          Kopieer en plak de template telkens wanneer je hem nodig hebt.
        </p>
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
          {/* 1. Twee gelijkwaardige instapopties, naast elkaar (met 3D-effect). */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Optie A (links): optimaliseer je eigen prompt (altijd een prompt framework) */}
            <EntryOptionCard
              active={entryMode === 'own-prompt'}
              onClick={() => setEntryMode('own-prompt')}
              icon={<Wand2 size={24} />}
              title="Optimaliseer jouw eigen prompt"
              description="Heb je al een prompt? Wij zoeken het best passende prompt framework, analyseren je prompt en vullen aan wat nog ontbreekt."
            />

            {/* Optie B (rechts): complex vraagstuk → laat een techniek aanbevelen */}
            <EntryOptionCard
              active={entryMode === 'techniques' && techniqueMode === 'smart'}
              onClick={() => {
                setEntryMode('techniques');
                setTechniqueMode('smart');
              }}
              icon={<Compass size={24} />}
              title="Heb je een complex vraagstuk?"
              description="Beschrijf in je eigen woorden wat je wilt bereiken. Wij bevelen automatisch de best passende prompttechniek aan."
            />
          </div>

          {/* Uitklap-paneel van de gekozen instapoptie. */}
          {entryMode === 'techniques' && techniqueMode === 'smart' && (
            <div className="opl-card p-5 sm:p-6">
              <GoalRecommender
                selectedTechniqueId={techniqueId}
                onSelectTechnique={handleSelectTechnique}
                goal={goal}
                onGoalChange={setGoal}
              />
            </div>
          )}

          {/* Eigen-prompt-flow: plak prompt, kies prompt framework, analyseer, vul aan, optimaliseer */}
          {entryMode === 'own-prompt' && (
            <div className="opl-card p-5 sm:p-6">
              <OwnPromptOptimizer settings={settingsRef.current} onResult={handleOwnPromptResult} />
            </div>
          )}

          {/* 2. Of kies zelf — prompt frameworks + prompttechnieken. In de
              "complex vraagstuk"-flow (smart) vervallen de prompt frameworks;
              die horen bij "Optimaliseer jouw eigen prompt". */}
          {entryMode === 'techniques' && (
            <section className="opl-card p-6">
              <TechniqueSelector
                selectedId={techniqueId}
                onSelect={handleSelectTechnique}
                showContextPrompts={techniqueMode !== 'smart'}
              />
            </section>
          )}

          {/* 2. Velden invullen: stap voor stap de template bouwen */}
          {entryMode === 'techniques' && technique && (
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
                      . Zo ontstaat een herbruikbare template die collega&apos;s opnieuw kunnen
                      invullen.
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
                      <FileText size={12} /> Gekoppeld aan een opgeslagen prompt. De generatie wordt
                      bewaard.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Onduidelijke-invoer-melding: de AI nam de input serieus en kon er
              geen zinvolle prompt van maken. Geen verzonnen casus, wél uitleg. */}
          {entryMode === 'techniques' && unclearReason && (
            <div
              role="alert"
              className="animate-fade-in flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Je invoer is nog niet duidelijk genoeg</p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">{unclearReason}</p>
              </div>
            </div>
          )}

          {/* De eigen-prompt-flow heeft een eigen genereerknop; deze geldt voor de techniek-flow. */}
          {entryMode === 'techniques' && (
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
