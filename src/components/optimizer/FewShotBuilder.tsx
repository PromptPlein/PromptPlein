import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { generateFewShotExample, extractFewShot } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  DEFAULT_FEATURE_LABELS,
  FEWSHOT_INTENT_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  deriveMode,
  emptyFewShot,
  serializeFewShot,
  type FewShotData,
  type FewShotFeature,
  type FewShotIntent,
  type FewShotPair,
} from '@/lib/fewshot';

/** De fasen van de few-shot-bouwer. */
type Phase = 'routing' | 'task' | 'examples' | 'extract' | 'checks';

let pairSeq = 1;
const newPairId = () => `pair-${++pairSeq}`;

interface FewShotBuilderProps {
  settings: AiSettings;
  /** Aangeroepen met de geserialiseerde few-shot-definitie zodra die wijzigt. */
  onSerialized: (text: string) => void;
  /**
   * De herhaalbaarheid die bij de intake al is vastgesteld (routingvraag van de
   * planner). Is die bekend, dan slaan we de routing-fase over: die vraag is dan
   * al beantwoord en nogmaals vragen is alleen maar verwarrend.
   */
  initialIntent?: FewShotIntent;
}

/**
 * Bouwt een Few-Shot-prompt op via de fasen: routing (one-shot vs few-shot),
 * taakdefinitie, voorbeeldparen (met AI-conceptvoorbeeld), en de kern-extractie
 * waar de AI zelf de over-te-nemen kenmerken en de casus-specifieke (weg te laten)
 * details voorstelt. Bij few-shot volgt nog een dekkings- en consistentiecheck.
 * Het eindresultaat wordt geserialiseerd en als antwoord van de stap doorgegeven.
 */
export default function FewShotBuilder({ settings, onSerialized, initialIntent }: FewShotBuilderProps) {
  const [d, setD] = useState<FewShotData>(() =>
    initialIntent ? { ...emptyFewShot(), intent: initialIntent } : emptyFewShot(),
  );
  const [phase, setPhase] = useState<Phase>(initialIntent ? 'task' : 'routing');
  const [busy, setBusy] = useState(false);
  // Analyse-observaties (dekking/consistentie) uit de extractie.
  const [dekking, setDekking] = useState('');
  const [consistentie, setConsistentie] = useState('');
  const [extracted, setExtracted] = useState(false);

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

  const isFewShot = mode === 'few-shot';

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

  /** Genereer een concept-voorbeeldpaar (Q3 "nee, ik heb geen materiaal"). */
  async function suggestExample(targetId: string) {
    setBusy(true);
    try {
      const res = await generateFewShotExample({
        input: d.inputBeschrijving,
        output: d.outputBeschrijving,
        format: d.outputFormaat,
        labels: d.labels,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.success && res.example) {
        updatePair(targetId, 'input', res.example.input);
        updatePair(targetId, 'output', res.example.output);
        toast.success('Conceptvoorbeeld ingevuld. Pas het aan tot iets wat je zou goedkeuren.');
      } else {
        toast.error(res.error ?? 'Kon geen voorbeeld genereren.');
      }
    } finally {
      setBusy(false);
    }
  }

  /** Draai de kern-extractie: kenmerken + casus-specifiek + dekking/consistentie. */
  async function runExtract() {
    const pairs = d.pairs
      .filter((p) => p.input.trim() || p.output.trim())
      .map((p) => ({ input: p.input, output: p.output }));
    if (pairs.length === 0) {
      toast.error('Voeg eerst minstens één voorbeeld toe.');
      return;
    }
    setBusy(true);
    try {
      const res = await extractFewShot({
        input: d.inputBeschrijving,
        output: d.outputBeschrijving,
        format: d.outputFormaat,
        labels: d.labels,
        pairs,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success) {
        toast.error(res.error ?? 'Analyse mislukt.');
        return;
      }
      // Zet de voorgestelde kenmerken standaard aangevinkt (overnemen), en de
      // casus-specifieke standaard aangevinkt (weglaten) — de gebruiker corrigeert.
      const kenmerken: FewShotFeature[] = (res.kenmerken ?? []).map((k) => ({
        label: k.label,
        detail: k.detail,
        checked: true,
      }));
      const fallback = kenmerken.length === 0
        ? DEFAULT_FEATURE_LABELS.map((label) => ({ label, checked: false }))
        : kenmerken;
      patch({
        overnemen: fallback,
        nietOvernemen: (res.casus_specifiek ?? []).map((c) => ({
          label: c.label,
          detail: c.detail,
          checked: true,
        })),
      });
      setDekking(res.dekking ?? '');
      setConsistentie(res.consistentie ?? '');
      setExtracted(true);
    } finally {
      setBusy(false);
    }
  }

  function toggleFeature(list: 'overnemen' | 'nietOvernemen', index: number) {
    setD((prev) => ({
      ...prev,
      [list]: prev[list].map((f, i) => (i === index ? { ...f, checked: !f.checked } : f)),
    }));
  }

  // --- Fase-navigatie ---
  const phases: Phase[] = isFewShot
    ? ['routing', 'task', 'examples', 'extract', 'checks']
    : ['routing', 'task', 'examples', 'extract'];
  const phaseIndex = phases.indexOf(phase);
  const canNext = phaseIndex < phases.length - 1;
  const canBack = phaseIndex > 0;
  function next() {
    if (phase === 'extract' && !extracted) {
      void runExtract();
      return;
    }
    if (canNext) setPhase(phases[phaseIndex + 1]);
  }
  function back() {
    if (canBack) setPhase(phases[phaseIndex - 1]);
  }

  return (
    <div className="space-y-4">
      {/* Voortgang: welke fase van welke. */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        {phases.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span
              className={clsx(
                'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                i < phaseIndex
                  ? 'bg-emerald-500 text-white'
                  : i === phaseIndex
                    ? 'bg-rijksblauw-500 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700',
              )}
            >
              {i < phaseIndex ? <Check size={11} /> : i + 1}
            </span>
            {i < phases.length - 1 && <span className="h-px w-4 bg-slate-200 dark:bg-slate-700" />}
          </span>
        ))}
        <span className="ml-1">{PHASE_TITLES[phase]}</span>
      </div>

      {phase === 'routing' && <RoutingPhase d={d} patch={patch} derivedMode={mode} />}
      {phase === 'task' && <TaskPhase d={d} patch={patch} />}
      {phase === 'examples' && (
        <ExamplesPhase
          d={d}
          isFewShot={isFewShot}
          busy={busy}
          onUpdatePair={updatePair}
          onAddPair={addPair}
          onRemovePair={removePair}
          onSuggest={suggestExample}
        />
      )}
      {phase === 'extract' && (
        <ExtractPhase
          d={d}
          busy={busy}
          extracted={extracted}
          onExtract={runExtract}
          onToggle={toggleFeature}
        />
      )}
      {phase === 'checks' && (
        <ChecksPhase d={d} patch={patch} dekking={dekking} consistentie={consistentie} />
      )}

      {/* Navigatie. */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          className={clsx('opl-btn-secondary', !canBack && 'invisible')}
          onClick={back}
          disabled={busy}
        >
          <ArrowLeft size={16} /> Vorige
        </button>
        {canNext ? (
          <button type="button" className="opl-btn-primary" onClick={next} disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Bezig…
              </>
            ) : phase === 'extract' && !extracted ? (
              <>
                <Sparkles size={16} /> Analyseer voorbeeld
              </>
            ) : (
              <>
                Volgende <ArrowRight size={16} />
              </>
            )}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check size={14} /> Klaar. Klik hieronder op &quot;Genereren&quot;.
          </span>
        )}
      </div>
    </div>
  );
}

const PHASE_TITLES: Record<Phase, string> = {
  routing: 'Wat wil je bereiken?',
  task: 'Taak: input & output',
  examples: 'Voorbeelden',
  extract: 'Wat neem ik over?',
  checks: 'Consistentie & randgevallen',
};

/** Fase 0: routing. */
function RoutingPhase({
  d,
  patch,
  derivedMode,
}: {
  d: FewShotData;
  patch: (p: Partial<FewShotData>) => void;
  derivedMode: 'one-shot' | 'few-shot';
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Wat wil je met deze voorbeelden bereiken? Op basis daarvan kiest de tool zelf of één voorbeeld
        (one-shot) volstaat of dat meerdere nodig zijn (few-shot).
      </p>
      <div className="space-y-2">
        {FEWSHOT_INTENT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => patch({ intent: o.value })}
            className={clsx(
              'block w-full rounded-xl border p-3 text-left transition-colors',
              d.intent === o.value
                ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                : 'border-slate-200 bg-white hover:border-rijksblauw-300 dark:border-slate-700 dark:bg-slate-800',
            )}
          >
            <span className="font-medium text-slate-800 dark:text-slate-100">{o.label}</span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
          </button>
        ))}
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        Op dit moment gaat de tool uit van{' '}
        <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
          {derivedMode === 'few-shot' ? 'few-shot (meerdere voorbeelden)' : 'one-shot (één voorbeeld)'}
        </span>
        . Dit past zich vanzelf aan naarmate je meer invult.
      </p>
    </div>
  );
}

/** Fase 1: taakdefinitie. */
function TaskPhase({ d, patch }: { d: FewShotData; patch: (p: Partial<FewShotData>) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="opl-label mb-0.5 block">Wat stop je er straks in? (de input)</label>
        <textarea
          className="opl-input min-h-[60px] resize-y text-sm"
          value={d.inputBeschrijving}
          placeholder="Bijv. binnenkomende e-mails van burgers met een vraag over een regeling"
          onChange={(e) => patch({ inputBeschrijving: e.target.value })}
        />
      </div>
      <div>
        <label className="opl-label mb-0.5 block">Wat moet eruit komen? (de output)</label>
        <textarea
          className="opl-input min-h-[60px] resize-y text-sm"
          value={d.outputBeschrijving}
          placeholder="Bijv. een vriendelijk, duidelijk antwoord in maximaal 150 woorden"
          onChange={(e) => patch({ outputBeschrijving: e.target.value })}
        />
      </div>
      <div>
        <label className="opl-label mb-0.5 block">Welke vorm heeft de output?</label>
        <div className="flex flex-wrap gap-2">
          {OUTPUT_FORMAT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => patch({ outputFormaat: o.value })}
              className={clsx(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                d.outputFormaat === o.value
                  ? 'border-rijksblauw-500 bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-rijksblauw-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {d.outputFormaat === 'classificatie' && (
          <div className="mt-2">
            <label className="opl-label mb-0.5 block">Welke labels zijn mogelijk?</label>
            <input
              className="opl-input text-sm"
              value={d.labels}
              placeholder="Bijv. Spoed / Regulier / Doorsturen"
              onChange={(e) => patch({ labels: e.target.value })}
            />
            <p className="mt-1 text-xs text-rijksoranje">
              Bij classificatie is few-shot bijna altijd nodig; geef liefst een voorbeeld per label.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Fase 2: voorbeeldparen. */
function ExamplesPhase({
  d,
  isFewShot,
  busy,
  onUpdatePair,
  onAddPair,
  onRemovePair,
  onSuggest,
}: {
  d: FewShotData;
  isFewShot: boolean;
  busy: boolean;
  onUpdatePair: (id: string, field: 'input' | 'output', value: string) => void;
  onAddPair: () => void;
  onRemovePair: (id: string) => void;
  onSuggest: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Geef {isFewShot ? 'enkele voorbeelden' : 'een voorbeeld'} van input met de bijbehorende gewenste
        output. Heb je nog geen voorbeeld? Laat de AI er een voorstellen en pas het aan.
      </p>
      {d.pairs.map((p: FewShotPair, idx) => (
        <div
          key={p.id}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
              Voorbeeld {idx + 1}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rijksblauw-600 disabled:opacity-50 dark:text-slate-400"
                onClick={() => onSuggest(p.id)}
                disabled={busy}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                Laat AI voorstellen
              </button>
              {d.pairs.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemovePair(p.id)}
                  title="Verwijder voorbeeld"
                  className="rounded p-1 text-slate-400 hover:bg-rijksoranje/10 hover:text-rijksoranje dark:text-slate-500"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <label className="opl-label mb-0.5 block text-xs">Input</label>
          <textarea
            className="opl-input min-h-[56px] resize-y text-sm"
            value={p.input}
            placeholder="Wat komt er binnen…"
            onChange={(e) => onUpdatePair(p.id, 'input', e.target.value)}
          />
          <label className="opl-label mb-0.5 mt-2 block text-xs">Gewenste output</label>
          <textarea
            className="opl-input min-h-[56px] resize-y text-sm"
            value={p.output}
            placeholder="Hoe daar idealiter op gereageerd wordt…"
            onChange={(e) => onUpdatePair(p.id, 'output', e.target.value)}
          />
        </div>
      ))}
      {isFewShot && (
        <button
          type="button"
          onClick={onAddPair}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rijksblauw-300 px-3 py-2 text-sm font-medium text-rijksblauw-700 hover:bg-rijksblauw-50 dark:border-rijksblauw-500/40 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/10"
        >
          <Plus size={16} /> Nog een voorbeeld toevoegen
        </button>
      )}
    </div>
  );
}

/** Fase 3: de kern-extractie (kenmerken + weg te laten details). */
function ExtractPhase({
  d,
  busy,
  extracted,
  onExtract,
  onToggle,
}: {
  d: FewShotData;
  busy: boolean;
  extracted: boolean;
  onExtract: () => void;
  onToggle: (list: 'overnemen' | 'nietOvernemen', index: number) => void;
}) {
  if (!extracted) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Nu analyseert de AI je voorbeeld(en): welke kenmerken maken ze goed (en moeten we vastleggen),
          en welke details horen alleen bij dít geval (en moeten weg). Klik om te analyseren.
        </p>
        <button type="button" className="opl-btn-primary" onClick={onExtract} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          Analyseer voorbeeld
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <FeatureChecklist
        title="Deze kenmerken zag ik; welke moet ik overnemen?"
        accent="rijksblauw"
        features={d.overnemen}
        onToggle={(i) => onToggle('overnemen', i)}
      />
      {d.nietOvernemen.length > 0 && (
        <FeatureChecklist
          title="Deze details lijken casus-specifiek; deze laat ik weg (of plaats een [plaatshouder])"
          accent="oranje"
          features={d.nietOvernemen}
          onToggle={(i) => onToggle('nietOvernemen', i)}
        />
      )}
      <button
        type="button"
        className="text-xs font-medium text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400"
        onClick={onExtract}
        disabled={busy}
      >
        Opnieuw analyseren
      </button>
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
  accent: 'rijksblauw' | 'oranje';
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
            <input
              type="checkbox"
              className="mt-0.5"
              checked={f.checked}
              onChange={() => onToggle(i)}
            />
            <span>
              <span
                className={clsx(
                  'font-medium',
                  accent === 'oranje' ? 'text-rijksoranje' : 'text-rijksblauw-700 dark:text-rijksblauw-200',
                )}
              >
                {f.label}
              </span>
              {f.detail && (
                <span className="block text-xs text-slate-500 dark:text-slate-400">{f.detail}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Fase 4 (alleen few-shot): dekking, consistentie (zacht blokkeren), randgeval, tegenvoorbeeld. */
function ChecksPhase({
  d,
  patch,
  dekking,
  consistentie,
}: {
  d: FewShotData;
  patch: (p: Partial<FewShotData>) => void;
  dekking: string;
  consistentie: string;
}) {
  const filledPairs = d.pairs.filter((p) => p.input.trim() || p.output.trim());
  return (
    <div className="space-y-4">
      {/* Dekking. */}
      {dekking && (
        <div className="rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          <p className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-rijksblauw-500" />
            <span>
              <span className="font-medium">Dekking:</span> {dekking} Overweeg een afwijkend geval toe te
              voegen bij de voorbeelden.
            </span>
          </p>
        </div>
      )}

      {/* Consistentie — zacht blokkeren: waarschuwen + leidend kiezen. */}
      {consistentie && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">Let op, tegenstrijdigheid:</span> {consistentie} Welk voorbeeld
              is leidend?
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {filledPairs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => patch({ leidendVoorbeeld: String(i + 1) })}
                className={clsx(
                  'rounded-lg border px-3 py-1 text-sm transition-colors',
                  d.leidendVoorbeeld === String(i + 1)
                    ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100'
                    : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-slate-800 dark:text-amber-200',
                )}
              >
                Voorbeeld {i + 1} is leidend
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Randgeval (Q8). */}
      <div>
        <label className="opl-label mb-0.5 block">
          Wat moet er gebeuren als het misgaat? (ontbrekende info, verzoek buiten scope)
        </label>
        <textarea
          className="opl-input min-h-[56px] resize-y text-sm"
          value={d.randgeval}
          placeholder="Bijv. bij ontbrekende gegevens: vraag beleefd om aanvulling in plaats van te gokken."
          onChange={(e) => patch({ randgeval: e.target.value })}
        />
      </div>

      {/* Tegenvoorbeeld (Q10, optioneel). */}
      <div>
        <label className="opl-label mb-0.5 block">
          Tegenvoorbeeld: &quot;zo dus níét&quot; <span className="font-normal text-slate-400">(optioneel)</span>
        </label>
        <textarea
          className="opl-input min-h-[56px] resize-y text-sm"
          value={d.tegenvoorbeeld}
          placeholder="Bijv. te lang, te formeel, of met beloftes over termijnen."
          onChange={(e) => patch({ tegenvoorbeeld: e.target.value })}
        />
      </div>
    </div>
  );
}
