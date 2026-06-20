import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Loader2, FileText, Compass, ListChecks } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import GoalRecommender from '@/components/optimizer/GoalRecommender';
import FollowUpQuestions from '@/components/optimizer/FollowUpQuestions';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { generatePrompt } from '@/services/optimizeService';
import { trackEvent } from '@/services/analyticsService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { detectPii, detectBlockedTopics, type GuardrailFinding } from '@/services/guardrails';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { getCurrentUser } from '@/lib/utils';
import type { OptimizeResult } from '@/types';

/** Twee instapwijzen: ofwel zelf een techniek kiezen, ofwel laten aanbevelen. */
type TechniqueMode = 'manual' | 'smart';

export default function OptimizerPage() {
  const { promptId } = useParams<{ promptId?: string }>();
  const { techniques } = useReferenceData();

  const [promptContent, setPromptContent] = useState('');
  const [sourcePromptId, setSourcePromptId] = useState<string | null>(null);
  const [techniqueMode, setTechniqueMode] = useState<TechniqueMode>('manual');
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loadingPrompt, setLoadingPrompt] = useState(Boolean(promptId));
  const [optimizing, setOptimizing] = useState(false);
  // Admin-bepaalde AI-instellingen; gebruikers kiezen niet meer zelf.
  const settingsRef = useRef<AiSettings>(DEFAULT_AI_SETTINGS);
  const [guardrailFindings, setGuardrailFindings] = useState<GuardrailFinding[] | null>(null);
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
    // Wacht tot het vervolgvragen-paneel is gerenderd en scroll het in beeld.
    requestAnimationFrame(() => {
      followUpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          Genereer een herbruikbare prompt-template. De inhoud vul je zelf aan in je eigen chat —
          kopieer en plak de template telkens wanneer je hem nodig hebt.
        </p>
      </div>

      {phase === 'output' && result ? (
        <div className="opl-card p-6">
          <OptimizedOutput result={result} onReset={handleReset} />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-700 ${
            phase === 'transition' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          {/* 1. Techniek — zelf kiezen of laten aanbevelen */}
          <section className="opl-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-bold text-white">
                1
              </span>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">Kies een techniek</h2>
            </div>

            {/* Moduskeuze: weet ik al / weet ik nog niet */}
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setTechniqueMode('manual')}
                aria-pressed={techniqueMode === 'manual'}
                className={clsx(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  techniqueMode === 'manual'
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800',
                )}
              >
                <ListChecks size={20} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                <span>
                  <span className="block font-semibold text-slate-800 dark:text-slate-100">
                    Ik weet welke techniek ik wil
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Kies zelf direct uit de lijst.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTechniqueMode('smart')}
                aria-pressed={techniqueMode === 'smart'}
                className={clsx(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  techniqueMode === 'smart'
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800',
                )}
              >
                <Compass size={20} className="mt-0.5 shrink-0 text-rijksoranje" />
                <span>
                  <span className="block font-semibold text-slate-800 dark:text-slate-100">
                    Ik weet nog niet welke techniek
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Beschrijf je doel; wij bevelen een techniek aan.
                  </span>
                </span>
              </button>
            </div>

            {techniqueMode === 'manual' ? (
              <TechniqueSelector selectedId={techniqueId} onSelect={handleSelectTechnique} />
            ) : (
              <GoalRecommender
                selectedTechniqueId={techniqueId}
                onSelectTechnique={handleSelectTechnique}
              />
            )}
          </section>

          {/* 2. Velden invullen — per gekozen techniek */}
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
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-bold text-white">
                    2
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                      Vul de velden in
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Voor techniek{' '}
                      <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                        {technique.name}
                      </span>
                    </p>
                  </div>
                </div>
                <FollowUpQuestions technique={technique} answers={answers} onChange={setAnswers} />

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
                      <FileText size={12} /> Gekoppeld aan een opgeslagen prompt — de generatie wordt
                      bewaard.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              className="opl-btn-primary px-6 py-2.5"
              onClick={handleGenerate}
              disabled={optimizing || !technique}
            >
              {optimizing ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Bezig met genereren…
                </>
              ) : (
                <>
                  <Sparkles size={18} /> Genereer prompt
                </>
              )}
            </button>
          </div>
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
