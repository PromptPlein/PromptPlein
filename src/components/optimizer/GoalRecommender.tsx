import { useState } from 'react';
import { Check, Loader2, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { recommendTechniques } from '@/services/optimizeService';
import type { TechniqueRecommendation } from '@/types';

interface GoalRecommenderProps {
  /** Huidig geselecteerde techniek (zodat de gekozen kaart actief blijft). */
  selectedTechniqueId: string | null;
  /** Aangeroepen wanneer de gebruiker een aanbevolen techniek kiest. */
  onSelectTechnique: (id: string) => void;
}

/**
 * Slimme flow voor wie nog niet weet welke techniek te gebruiken.
 * De gebruiker beschrijft het doel; daarna worden passende technieken
 * aanbevolen waaruit de gebruiker er één kiest.
 */
export default function GoalRecommender({
  selectedTechniqueId,
  onSelectTechnique,
}: GoalRecommenderProps) {
  const { techniques, techniqueById } = useReferenceData();
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<TechniqueRecommendation[] | null>(null);

  async function handleRecommend() {
    if (!goal.trim()) {
      toast.error('Beschrijf eerst wat je wilt bereiken.');
      return;
    }
    setLoading(true);
    try {
      const res = await recommendTechniques({ goal: goal.trim(), techniques });
      setRecommendations(res.recommendations);
      if (res.error) toast(res.error, { icon: '⚠️' });
      if (res.recommendations.length === 0) {
        toast('Geen duidelijke match — kies hieronder zelf een techniek.', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Aanbeveling mislukt. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="opl-label" htmlFor="goal-input">
          Wat wil je graag bereiken?
        </label>
        <textarea
          id="goal-input"
          className="opl-input min-h-[88px] resize-y"
          value={goal}
          placeholder="Bijv. ik wil een formele e-mail aan een burger vriendelijker en duidelijker laten schrijven"
          onChange={(e) => setGoal(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          We zoeken op basis van je doel de best passende prompttechniek(en) voor je uit.
        </p>
      </div>

      <button
        type="button"
        className="opl-btn-primary"
        onClick={handleRecommend}
        disabled={loading || !goal.trim()}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Technieken zoeken…
          </>
        ) : (
          <>
            <Wand2 size={18} /> Vind passende technieken
          </>
        )}
      </button>

      {recommendations && recommendations.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Aanbevolen technieken — kies welke je wilt toepassen:
          </p>
          {recommendations.map((rec, idx) => {
            const technique = techniqueById(rec.id);
            if (!technique) return null;
            const active = technique.id === selectedTechniqueId;
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => onSelectTechnique(technique.id)}
                aria-pressed={active}
                className={clsx(
                  'flex w-full flex-col rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                    {idx === 0 && <Sparkles size={15} className="text-rijksoranje" />}
                    {technique.name}
                    {idx === 0 && (
                      <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">
                        Beste match
                      </span>
                    )}
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                {rec.reason && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{rec.reason}</span>
                )}
                {technique.strength && (
                  <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Kracht: </span>
                    {technique.strength}
                  </span>
                )}
                {technique.use_cases && technique.use_cases.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-500 dark:text-slate-400">
                    {technique.use_cases.slice(0, 3).map((uc, i) => (
                      <li key={i}>{uc}</li>
                    ))}
                  </ul>
                )}
                <span className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  {technique.follow_up_questions.length} in te vullen veld
                  {technique.follow_up_questions.length === 1 ? '' : 'en'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
