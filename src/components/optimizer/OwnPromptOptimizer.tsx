import { useState } from 'react';
import { Check, Layers, Loader2, Search, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import { analyzePrompt, generatePrompt } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import type { AnalyzeResult, OptimizeResult, Technique } from '@/types';

interface OwnPromptOptimizerProps {
  /** Admin-bepaalde AI-instellingen (provider, systeemprompt, toon, temperatuur). */
  settings: AiSettings;
  /** Aangeroepen met het geoptimaliseerde resultaat + de gekozen techniek. */
  onResult: (result: OptimizeResult, technique: Technique) => void;
}

/**
 * Flow om een EIGEN prompt te optimaliseren. De gebruiker plakt zijn prompt en
 * kiest een prompt framework (CARE, CRISP, …). Vervolgens analyseren we de
 * prompt tegen de eisen van dat raamwerk, tonen we wat nog ontbreekt als extra
 * invulvelden, en genereren we daarna de volledig geoptimaliseerde prompt.
 */
export default function OwnPromptOptimizer({ settings, onResult }: OwnPromptOptimizerProps) {
  const { techniques } = useReferenceData();
  const contextPrompts = techniques.filter(isContextPrompt);

  const [ownPrompt, setOwnPrompt] = useState('');
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const technique = contextPrompts.find((t) => t.id === techniqueId) ?? null;

  function handleSelect(id: string) {
    setTechniqueId(id);
    // Een nieuwe keuze maakt de vorige analyse en aanvullingen ongeldig.
    setAnalysis(null);
    setAnswers({});
  }

  async function handleAnalyze() {
    if (!ownPrompt.trim()) {
      toast.error('Plak eerst je eigen prompt.');
      return;
    }
    if (!technique) {
      toast.error('Kies eerst een prompt framework.');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await analyzePrompt({
        ownPrompt: ownPrompt.trim(),
        technique,
        preferredProvider: settings.provider,
      });
      setAnalysis(res);
      // Begin met lege antwoorden voor elk ontbrekend veld.
      setAnswers(Object.fromEntries(res.missing.map((m) => [m.id, ''])));
      if (res.error) toast(res.error, { icon: '⚠️' });
    } catch {
      toast.error('Analyse mislukt. Probeer het opnieuw.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate() {
    if (!technique) return;
    setGenerating(true);
    try {
      const res = await generatePrompt({
        technique,
        promptContent: ownPrompt.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: answers,
        preferredProvider: settings.provider,
        systemPrompt: settings.systemPrompt.trim() || undefined,
        toneInstruction: settings.toneInstruction.trim() || undefined,
        temperature: settings.temperature,
      });
      onResult(res, technique);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Optimaliseren mislukt');
    } finally {
      setGenerating(false);
    }
  }

  if (contextPrompts.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Er zijn nog geen prompt frameworks beschikbaar. Vraag een beheerder er één toe te voegen.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Eigen prompt plakken */}
      <div>
        <label className="opl-label" htmlFor="own-prompt-input">
          Jouw eigen prompt
        </label>
        <textarea
          id="own-prompt-input"
          className="opl-input min-h-[120px] resize-y font-mono text-[13px]"
          value={ownPrompt}
          placeholder="Plak hier de prompt die je wilt optimaliseren…"
          onChange={(e) => {
            setOwnPrompt(e.target.value);
            setAnalysis(null); // gewijzigde prompt = oude analyse vervalt
          }}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          We optimaliseren je prompt altijd met een prompt framework.
        </p>
      </div>

      {/* 2. Prompt framework kiezen — met de kracht van elke optie */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Layers size={16} className="text-rijksoranje" />
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Kies een prompt framework
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contextPrompts.map((t) => {
            const active = t.id === techniqueId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelect(t.id)}
                aria-pressed={active}
                className={clsx(
                  'flex flex-col rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                    {t.name}
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                {t.description && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{t.description}</span>
                )}
                {t.strength && (
                  <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Doel: </span>
                    {t.strength}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Analyseren */}
      <button
        type="button"
        className="opl-btn-secondary"
        onClick={handleAnalyze}
        disabled={analyzing || !ownPrompt.trim() || !technique}
      >
        {analyzing ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Prompt analyseren…
          </>
        ) : (
          <>
            <Search size={18} /> Analyseer mijn prompt
          </>
        )}
      </button>

      {/* 4. Feedback + ontbrekende velden */}
      {analysis && (
        <div className="space-y-4 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          {analysis.summary && (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {analysis.summary}
            </p>
          )}

          {analysis.missing.length === 0 ? (
            <p className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Check size={16} /> Je prompt bevat alle benodigde onderdelen. Je kunt direct
              optimaliseren.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Vul hieronder de ontbrekende informatie aan. Wat je leeg laat, blijft een
                plaatshouder in de uiteindelijke prompt.
              </p>
              {analysis.missing.map((m) => (
                <div key={m.id}>
                  <label className="opl-label" htmlFor={`missing-${m.id}`}>
                    {m.label}
                  </label>
                  {m.question && (
                    <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{m.question}</p>
                  )}
                  <textarea
                    id={`missing-${m.id}`}
                    className="opl-input min-h-[80px] resize-y"
                    value={answers[m.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [m.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Genereren — pas zichtbaar na een analyse */}
      {analysis && (
        <div className="flex justify-end">
          <button
            type="button"
            className="opl-btn-primary px-6 py-2.5"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Optimaliseren…
              </>
            ) : (
              <>
                <Sparkles size={18} /> Genereren en optimaliseren prompt
              </>
            )}
          </button>
        </div>
      )}

      {!analysis && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Wand2 size={13} /> Analyseer eerst je prompt; daarna kun je hem optimaliseren.
        </p>
      )}
    </div>
  );
}
