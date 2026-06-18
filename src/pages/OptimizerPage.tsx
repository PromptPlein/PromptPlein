import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Loader2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import TechniqueSelector from '@/components/optimizer/TechniqueSelector';
import FollowUpQuestions from '@/components/optimizer/FollowUpQuestions';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { optimizePrompt } from '@/services/optimizeService';
import { trackEvent } from '@/services/analyticsService';
import { getCurrentUser } from '@/lib/utils';
import type { OptimizeResult } from '@/types';

export default function OptimizerPage() {
  const { promptId } = useParams<{ promptId?: string }>();
  const { techniques } = useReferenceData();

  const [promptContent, setPromptContent] = useState('');
  const [sourcePromptId, setSourcePromptId] = useState<string | null>(null);
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loadingPrompt, setLoadingPrompt] = useState(Boolean(promptId));
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  // 'input' = invoerpaneel zichtbaar, 'transition' = uitfaden, 'output' = resultaat
  const [phase, setPhase] = useState<'input' | 'transition' | 'output'>('input');

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

  const technique = techniques.find((t) => t.id === techniqueId) ?? null;

  function handleSelectTechnique(id: string) {
    setTechniqueId(id);
    setAnswers({}); // antwoorden resetten bij nieuwe techniek
  }

  async function handleOptimize() {
    if (!technique) {
      toast.error('Kies eerst een techniek.');
      return;
    }
    if (!promptContent.trim()) {
      toast.error('Voer een prompt in om te optimaliseren.');
      return;
    }

    setOptimizing(true);
    try {
      const res = await optimizePrompt({
        technique,
        promptContent: promptContent.trim(),
        followUpAnswers: answers,
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
        <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700">
          <Sparkles className="text-rijksoranje" /> Prompt optimaliseren
        </h1>
        <p className="text-sm text-slate-500">
          Kies een techniek, beantwoord de vervolgvragen en genereer een verbeterde prompt.
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
          {/* 1. Bronprompt */}
          <section className="opl-card p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-bold text-white">
                1
              </span>
              <h2 className="font-semibold text-slate-800">Oorspronkelijke prompt</h2>
            </div>
            {loadingPrompt ? (
              <div className="skeleton h-32 w-full rounded-lg" />
            ) : (
              <textarea
                className="opl-input min-h-[140px] resize-y font-mono text-[13px]"
                value={promptContent}
                onChange={(e) => {
                  setPromptContent(e.target.value);
                  setSourcePromptId(null); // handmatig bewerkt = niet langer gekoppeld
                }}
                placeholder="Plak of typ hier je prompt…"
              />
            )}
            {sourcePromptId && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
                <FileText size={12} /> Gekoppeld aan een opgeslagen prompt — de optimalisatie wordt
                bewaard.
              </p>
            )}
          </section>

          {/* 2. Techniek */}
          <section className="opl-card p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-bold text-white">
                2
              </span>
              <h2 className="font-semibold text-slate-800">Kies een techniek</h2>
            </div>
            <TechniqueSelector selectedId={techniqueId} onSelect={handleSelectTechnique} />
          </section>

          {/* 3. Vervolgvragen */}
          {technique && (
            <section className="opl-card p-6 animate-fade-in">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rijksblauw-500 text-xs font-bold text-white">
                  3
                </span>
                <h2 className="font-semibold text-slate-800">Vervolgvragen</h2>
              </div>
              <FollowUpQuestions technique={technique} answers={answers} onChange={setAnswers} />
            </section>
          )}

          <div className="flex justify-end">
            <button
              className="opl-btn-primary px-6 py-2.5"
              onClick={handleOptimize}
              disabled={optimizing || !technique}
            >
              {optimizing ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Bezig met optimaliseren…
                </>
              ) : (
                <>
                  <Sparkles size={18} /> Optimaliseer prompt
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
