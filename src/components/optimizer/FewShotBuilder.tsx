import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import OptimizableTextarea from '@/components/common/OptimizableTextarea';
import { generateFewShotExample, extractFewShot } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  DEFAULT_FEATURE_LABELS,
  deriveMode,
  emptyFewShot,
  filledPairs,
  serializeFewShot,
  type FewShotData,
  type FewShotFeature,
  type FewShotPair,
} from '@/lib/fewshot';
import BuilderIntro from './BuilderIntro';

/** De stappen van de few-shot-bouwer. */
type Phase = 'context' | 'pairs' | 'analysis';

const PHASES: Phase[] = ['context', 'pairs', 'analysis'];

const PHASE_TITLES: Record<Phase, string> = {
  context: 'Wat is de context?',
  pairs: 'Input en output',
  analysis: 'Analyse',
};

let pairSeq = 1;
const newPairId = () => `pair-${++pairSeq}`;

/** Vingerafdruk van wat de analyse heeft gezien; wijkt die af, dan is de analyse verouderd. */
function analysisKey(d: FewShotData): string {
  return JSON.stringify([d.context.trim(), filledPairs(d).map((p) => [p.input.trim(), p.output.trim()])]);
}

interface FewShotBuilderProps {
  settings: AiSettings;
  /** Aangeroepen met de geserialiseerde few-shot-definitie zodra die wijzigt. */
  onSerialized: (text: string) => void;
  /** Vult de context alvast in, bijvoorbeeld met het doel uit de PlanWizard. */
  initialContext?: string;
}

/**
 * Bouwt een Few-Shot-prompt in drie stappen. Eerst de context: waar werkt de
 * prompt straks in, wat komt er binnen. Dan input/output-paren, met een plusje
 * voor elk volgend paar: wat herkent de AI, en hoe reageert hij dan. Tot slot
 * legt de AI de paren tegen de context (kenmerken, weg te laten details,
 * ontbrekende situaties, tegenspraak). Het eindresultaat wordt geserialiseerd en
 * als antwoord van de stap doorgegeven; de generator maakt er een agent-prompt van.
 */
export default function FewShotBuilder({ settings, onSerialized, initialContext }: FewShotBuilderProps) {
  const [d, setD] = useState<FewShotData>(() => emptyFewShot(initialContext?.trim() ?? ''));
  const [phase, setPhase] = useState<Phase>('context');
  // Welk paar krijgt nu een AI-voorstel (null = geen), en loopt de analyse?
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Observaties uit de analyse, plus wat de analyse heeft gezien.
  const [dekking, setDekking] = useState('');
  const [consistentie, setConsistentie] = useState('');
  const [analyzedKey, setAnalyzedKey] = useState<string | null>(null);
  const busy = analyzing || suggesting !== null;

  // Meld de geserialiseerde tekst terug zodra de data wijzigt.
  useEffect(() => {
    onSerialized(serializeFewShot(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // Houd de afgeleide modus bij (one-shot vs few-shot).
  const mode = deriveMode(d);
  useEffect(() => {
    if (d.mode !== mode) setD((prev) => ({ ...prev, mode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function patch(p: Partial<FewShotData>) {
    setD((prev) => ({ ...prev, ...p }));
  }

  // --- Paren beheren ---
  function updatePair(id: string, field: 'input' | 'output', value: string) {
    setD((prev) => ({
      ...prev,
      pairs: prev.pairs.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  }
  function addPair() {
    setD((prev) => ({ ...prev, pairs: [...prev.pairs, { id: newPairId(), input: '', output: '' }] }));
  }
  function removePair(id: string) {
    setD((prev) => (prev.pairs.length <= 1 ? prev : { ...prev, pairs: prev.pairs.filter((p) => p.id !== id) }));
  }

  /** Laat de AI een paar voorstellen dat bij de context past en nog niet gedekt is. */
  async function suggestPair(targetId: string) {
    setSuggesting(targetId);
    try {
      const res = await generateFewShotExample({
        context: d.context,
        pairs: filledPairs(d)
          .filter((p) => p.id !== targetId)
          .map((p) => ({ input: p.input, output: p.output })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.success && res.example) {
        updatePair(targetId, 'input', res.example.input);
        updatePair(targetId, 'output', res.example.output);
        toast.success('Voorstel ingevuld. Pas het aan tot het klopt voor jouw situatie.');
      } else {
        toast.error(res.error ?? 'Kon geen voorstel maken.');
      }
    } finally {
      setSuggesting(null);
    }
  }

  /** Leg de paren tegen de context: kenmerken, weg te laten details, dekking, tegenspraak. */
  async function runAnalysis() {
    const pairs = filledPairs(d).map((p) => ({ input: p.input, output: p.output }));
    if (pairs.length === 0) {
      toast.error('Vul eerst minstens één input en output in.');
      return;
    }
    const key = analysisKey(d);
    setAnalyzing(true);
    try {
      const res = await extractFewShot({
        context: d.context,
        pairs,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success) {
        toast.error(res.error ?? 'Analyse mislukt.');
        return;
      }
      // De voorgestelde kenmerken staan standaard aan (overnemen), de
      // casus-specifieke ook (weglaten); de gebruiker corrigeert.
      const kenmerken: FewShotFeature[] = (res.kenmerken ?? []).map((k) => ({
        label: k.label,
        detail: k.detail,
        checked: true,
      }));
      patch({
        overnemen:
          kenmerken.length > 0 ? kenmerken : DEFAULT_FEATURE_LABELS.map((label) => ({ label, checked: false })),
        nietOvernemen: (res.casus_specifiek ?? []).map((c) => ({
          label: c.label,
          detail: c.detail,
          checked: true,
        })),
      });
      setDekking(res.dekking ?? '');
      setConsistentie(res.consistentie ?? '');
      setAnalyzedKey(key);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleFeature(list: 'overnemen' | 'nietOvernemen', index: number) {
    setD((prev) => ({
      ...prev,
      [list]: prev[list].map((f, i) => (i === index ? { ...f, checked: !f.checked } : f)),
    }));
  }

  /** Vanuit de analyse terug naar de paren, met een nieuw leeg paar klaar. */
  function addPairFromAnalysis() {
    addPair();
    setPhase('pairs');
  }

  // --- Navigatie ---
  const phaseIndex = PHASES.indexOf(phase);
  const analyzed = analyzedKey !== null;
  const stale = analyzed && analyzedKey !== analysisKey(d);
  const hasPairs = filledPairs(d).length > 0;
  const canNext =
    phase === 'context' ? Boolean(d.context.trim()) : phase === 'pairs' ? hasPairs : false;

  function next() {
    if (phase === 'context') setPhase('pairs');
    else if (phase === 'pairs') {
      setPhase('analysis');
      // Eerste keer, of er is iets veranderd sinds de vorige analyse: meteen draaien.
      if (!analyzed || stale) void runAnalysis();
    }
  }
  function back() {
    if (phaseIndex > 0) setPhase(PHASES[phaseIndex - 1]);
  }

  return (
    <div className="space-y-4">
      {/* Voortgang: welke stap van welke. */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {PHASES.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span
              className={clsx(
                'flex h-5 w-5 items-center justify-center rounded-full text-[0.6875rem]',
                i < phaseIndex
                  ? 'bg-emerald-500 text-white'
                  : i === phaseIndex
                    ? 'bg-rijksblauw-500 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700',
              )}
            >
              {i < phaseIndex ? <Check size={11} /> : i + 1}
            </span>
            {i < PHASES.length - 1 && <span className="h-px w-4 bg-slate-200 dark:bg-slate-700" />}
          </span>
        ))}
        <span className="ml-1">{PHASE_TITLES[phase]}</span>
      </div>

      {phase === 'context' && (
        <ContextPhase value={d.context} onChange={(context) => patch({ context })} />
      )}
      {phase === 'pairs' && (
        <PairsPhase
          pairs={d.pairs}
          busy={busy}
          suggesting={suggesting}
          onUpdatePair={updatePair}
          onAddPair={addPair}
          onRemovePair={removePair}
          onSuggest={(id) => void suggestPair(id)}
        />
      )}
      {phase === 'analysis' && (
        <AnalysisPhase
          d={d}
          analyzing={analyzing}
          analyzed={analyzed}
          stale={stale}
          dekking={dekking}
          consistentie={consistentie}
          onAnalyze={() => void runAnalysis()}
          onToggle={toggleFeature}
          onAddPair={addPairFromAnalysis}
          onRandgeval={(randgeval) => patch({ randgeval })}
        />
      )}

      {/* Navigatie. */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          className={clsx('opl-btn-secondary', phaseIndex === 0 && 'invisible')}
          onClick={back}
          disabled={busy}
        >
          <ArrowLeft size={16} /> Vorige
        </button>
        {phase !== 'analysis' ? (
          <button type="button" className="opl-btn-primary" onClick={next} disabled={busy || !canNext}>
            {phase === 'pairs' ? (
              <>
                <Sparkles size={16} /> Analyseer
              </>
            ) : (
              <>
                Volgende <ArrowRight size={16} />
              </>
            )}
          </button>
        ) : (
          analyzed &&
          !stale &&
          !analyzing && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check size={14} /> Klaar. Bouw hieronder de prompt.
            </span>
          )
        )}
      </div>
    </div>
  );
}

/** Stap 1: de context, met het sterretje om hem uit te laten schrijven. */
function ContextPhase({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <BuilderIntro
        title="Beschrijf de situatie"
        text="Wat komt er binnen, van wie, en wat moet ermee gebeuren? Steekwoorden mogen; het sterretje maakt er een heldere context van."
      />
      <OptimizableTextarea
        rows={5}
        value={value}
        onValueChange={onChange}
        placeholder="Bijv. Ik krijg elke dag e-mails van burgers over hun aanvraag. Ik wil dat de AI elke mail beoordeelt en er passend op reageert."
        className="opl-input min-h-[8rem] resize-y px-4 py-3 text-[0.9375rem] leading-relaxed"
        optimizeTitle="Verduidelijk mijn context met AI; je oorspronkelijke tekst kun je daarna terughalen"
      />
    </div>
  );
}

/** Stap 2: de input/output-paren, met een plusje voor elk volgend paar. */
function PairsPhase({
  pairs,
  busy,
  suggesting,
  onUpdatePair,
  onAddPair,
  onRemovePair,
  onSuggest,
}: {
  pairs: FewShotPair[];
  busy: boolean;
  suggesting: string | null;
  onUpdatePair: (id: string, field: 'input' | 'output', value: string) => void;
  onAddPair: () => void;
  onRemovePair: (id: string) => void;
  onSuggest: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <BuilderIntro
        title="Geef voorbeelden"
        text="Leg per situatie vast wat de AI herkent en hoe hij dan reageert. Weet je er geen? Laat de AI er een voorstellen."
      />
      {pairs.map((p, idx) => (
        <div
          key={p.id}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
              Input en output {idx + 1}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rijksblauw-600 disabled:opacity-50 dark:text-slate-400"
                onClick={() => onSuggest(p.id)}
                disabled={busy}
              >
                {suggesting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                Laat AI voorstellen
              </button>
              {pairs.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemovePair(p.id)}
                  title="Verwijder dit paar"
                  className="rounded p-1 text-slate-400 hover:bg-pleingroen/10 hover:text-pleingroen dark:text-slate-500"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <label className="opl-label mb-0.5 block text-xs">Input: wat herkent de AI?</label>
          <textarea
            className="opl-input min-h-[56px] resize-y text-sm"
            value={p.input}
            placeholder={
              idx === 0
                ? 'Bijv. Analyseer of de mail onbeleefd is.'
                : 'Bijv. Het bericht is onduidelijk: niet te zien wat de afzender vraagt.'
            }
            onChange={(e) => onUpdatePair(p.id, 'input', e.target.value)}
          />
          <label className="opl-label mb-0.5 mt-2 block text-xs">Output: hoe reageert de AI dan?</label>
          <textarea
            className="opl-input min-h-[56px] resize-y text-sm"
            value={p.output}
            placeholder={
              idx === 0
                ? 'Bijv. Reageer beleefd: "Vervelend dat u in deze situatie zit. We helpen u graag verder."'
                : 'Bijv. Vraag om uitleg: "We begrijpen uw bericht niet helemaal. Kunt u wat meer uitleg geven?"'
            }
            onChange={(e) => onUpdatePair(p.id, 'output', e.target.value)}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={onAddPair}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rijksblauw-300 px-3 py-2 text-sm font-medium text-rijksblauw-700 hover:bg-rijksblauw-50 dark:border-rijksblauw-500/40 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/10"
      >
        <Plus size={16} /> Input en output toevoegen
      </button>
    </div>
  );
}

/** Stap 3: de analyse van de paren tegen de context. */
function AnalysisPhase({
  d,
  analyzing,
  analyzed,
  stale,
  dekking,
  consistentie,
  onAnalyze,
  onToggle,
  onAddPair,
  onRandgeval,
}: {
  d: FewShotData;
  analyzing: boolean;
  analyzed: boolean;
  stale: boolean;
  dekking: string;
  consistentie: string;
  onAnalyze: () => void;
  onToggle: (list: 'overnemen' | 'nietOvernemen', index: number) => void;
  onAddPair: () => void;
  onRandgeval: (v: string) => void;
}) {
  if (analyzing) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
        <Loader2 size={16} className="animate-spin" /> De AI legt je input en output naast de context…
      </p>
    );
  }
  if (!analyzed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          De AI legt je input en output naast de context: welke kenmerken de prompt moet vastleggen, welke
          details alleen bij één geval horen, en welke situaties nog ontbreken.
        </p>
        <button type="button" className="opl-btn-primary" onClick={onAnalyze}>
          <Sparkles size={16} /> Analyseer
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
          <span>Je hebt de context of de paren aangepast sinds deze analyse.</span>
          <button type="button" className="opl-btn-secondary" onClick={onAnalyze}>
            <RefreshCw size={14} /> Opnieuw analyseren
          </button>
        </div>
      )}

      {/* Dekking: situaties uit de context zonder paar. */}
      {dekking && (
        <div className="rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          <p className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-rijksblauw-500" />
            <span>
              <span className="font-medium">Nog niet gedekt:</span> {dekking}
            </span>
          </p>
          <button
            type="button"
            onClick={onAddPair}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-rijksblauw-700 hover:underline dark:text-rijksblauw-200"
          >
            <Plus size={14} /> Input en output toevoegen
          </button>
        </div>
      )}

      {/* Tegenspraak of overlap tussen paren. */}
      {consistentie && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">Let op:</span> {consistentie}
            </span>
          </p>
        </div>
      )}

      <FeatureChecklist
        title="Deze kenmerken zag ik in je outputs; welke moet de prompt vastleggen?"
        accent="rijksblauw"
        features={d.overnemen}
        onToggle={(i) => onToggle('overnemen', i)}
      />
      {d.nietOvernemen.length > 0 && (
        <FeatureChecklist
          title="Deze details horen bij één geval; deze laat ik weg (of maak ik een [plaatshouder])"
          accent="groen"
          features={d.nietOvernemen}
          onToggle={(i) => onToggle('nietOvernemen', i)}
        />
      )}

      <div>
        <label className="opl-label mb-0.5 block">
          Wat doet de AI als geen enkele input past?{' '}
          <span className="font-normal text-slate-400">(optioneel)</span>
        </label>
        <textarea
          className="opl-input min-h-[56px] resize-y text-sm"
          value={d.randgeval}
          placeholder="Bijv. Niet gokken, maar de mail doorsturen naar een medewerker met een korte samenvatting."
          onChange={(e) => onRandgeval(e.target.value)}
        />
      </div>

      {!stale && (
        <button
          type="button"
          className="text-xs font-medium text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400"
          onClick={onAnalyze}
        >
          Opnieuw analyseren
        </button>
      )}
    </div>
  );
}

function FeatureChecklist({
  title,
  accent,
  features,
  onToggle,
}: {
  title: string;
  accent: 'rijksblauw' | 'groen';
  features: FewShotFeature[];
  onToggle: (index: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <div className="space-y-1.5">
        {features.map((f, i) => (
          <label
            key={i}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <input type="checkbox" className="mt-0.5" checked={f.checked} onChange={() => onToggle(i)} />
            <span>
              <span
                className={clsx(
                  'font-medium',
                  accent === 'groen' ? 'text-pleingroen' : 'text-rijksblauw-700 dark:text-rijksblauw-200',
                )}
              >
                {f.label}
              </span>
              {f.detail && <span className="block text-xs text-slate-500 dark:text-slate-400">{f.detail}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
