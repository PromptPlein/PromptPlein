import { useEffect, useRef, useState } from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
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
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/cell';
import '@nldd/design-system/checkbox';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/step-bar';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

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
        notify.success('Voorstel ingevuld. Pas het aan tot het klopt voor jouw situatie.');
      } else {
        notify.error(res.error ?? 'Kon geen voorstel maken.');
      }
    } finally {
      setSuggesting(null);
    }
  }

  /** Leg de paren tegen de context: kenmerken, weg te laten details, dekking, tegenspraak. */
  async function runAnalysis() {
    const pairs = filledPairs(d).map((p) => ({ input: p.input, output: p.output }));
    if (pairs.length === 0) {
      notify.error('Vul eerst minstens één input en output in.');
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
        notify.error(res.error ?? 'Analyse mislukt.');
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
    <nldd-container gap="16">
      {/* Voortgang: welke stap van welke. */}
      <nldd-step-bar accessible-label="Stappen van de few-shot-bouwer">
        {PHASES.map((p) => (
          <nldd-step-bar-item
            key={p}
            text={PHASE_TITLES[p]}
            status={p === phase ? 'current' : undefined}
          ></nldd-step-bar-item>
        ))}
      </nldd-step-bar>

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
      <nldd-container layout="row" gap="12" vertical-alignment="center">
        {phaseIndex > 0 && (
          <nldd-button
            appearance="secondary"
            start-icon="arrow-left"
            text="Vorige"
            disabled={busy || undefined}
            onClick={back}
          ></nldd-button>
        )}
        <nldd-spacer size="flexible"></nldd-spacer>
        {phase !== 'analysis' ? (
          <nldd-button
            appearance="secondary"
            start-icon={phase === 'pairs' ? 'sparkles' : undefined}
            end-icon={phase === 'pairs' ? undefined : 'arrow-right'}
            text={phase === 'pairs' ? 'Analyseer' : 'Volgende'}
            disabled={busy || !canNext || undefined}
            onClick={next}
          ></nldd-button>
        ) : (
          analyzed &&
          !stale &&
          !analyzing && (
            <>
              <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
              <nldd-text size="xs" weight="medium" color="success">
                Klaar. Bouw hieronder de prompt.
              </nldd-text>
            </>
          )
        )}
      </nldd-container>
    </nldd-container>
  );
}

/** Stap 1: de context, met het sterretje om hem uit te laten schrijven. */
function ContextPhase({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <nldd-container gap="8">
      <BuilderIntro
        title="Beschrijf de situatie"
        text="Wat komt er binnen, van wie, en wat moet ermee gebeuren? Steekwoorden mogen; het sterretje maakt er een heldere context van."
      />
      <OptimizableTextarea
        rows={5}
        value={value}
        onValueChange={onChange}
        placeholder="Bijv. Ik krijg elke dag e-mails van burgers over hun aanvraag. Ik wil dat de AI elke mail beoordeelt en er passend op reageert."
        optimizeTitle="Verduidelijk mijn context met AI; je oorspronkelijke tekst kun je daarna terughalen"
      />
    </nldd-container>
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
    <nldd-container gap="12">
      <BuilderIntro
        title="Geef voorbeelden"
        text="Leg per situatie vast wat de AI herkent en hoe hij dan reageert. Weet je er geen? Laat de AI er een voorstellen."
      />
      {pairs.map((p, idx) => (
        <PairCard
          key={p.id}
          pair={p}
          index={idx}
          removable={pairs.length > 1}
          busy={busy}
          suggesting={suggesting === p.id}
          onUpdate={(field, value) => onUpdatePair(p.id, field, value)}
          onRemove={() => onRemovePair(p.id)}
          onSuggest={() => onSuggest(p.id)}
        />
      ))}
      <nldd-container horizontal-alignment="left">
        <nldd-button appearance="secondary" start-icon="plus" text="Input en output toevoegen" onClick={onAddPair}></nldd-button>
      </nldd-container>
    </nldd-container>
  );
}

/** One input/output pair. */
function PairCard({
  pair: p,
  index: idx,
  removable,
  busy,
  suggesting,
  onUpdate,
  onRemove,
  onSuggest,
}: {
  pair: FewShotPair;
  index: number;
  removable: boolean;
  busy: boolean;
  suggesting: boolean;
  onUpdate: (field: 'input' | 'output', value: string) => void;
  onRemove: () => void;
  onSuggest: () => void;
}) {
  const inputRef = useRef<HTMLElement & { value?: string }>(null);
  const outputRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(inputRef, p.input, (v) => onUpdate('input', v));
  useNlddValue(outputRef, p.output, (v) => onUpdate('output', v));
  return (
    <nldd-card>
      <nldd-container padding="12" gap="8">
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-title heading-level={4} size={6} text={`Input en output ${idx + 1}`}></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-button
            size="sm"
            appearance="neutral-transparent"
            start-icon="sparkles"
            text="Laat AI voorstellen"
            loading={suggesting || undefined}
            disabled={(busy && !suggesting) || undefined}
            onClick={onSuggest}
          ></nldd-button>
          {removable && (
            <nldd-icon-button
              size="sm"
              appearance="critical-transparent"
              icon="trash"
              accessible-label={`Verwijder paar ${idx + 1}`}
              onClick={onRemove}
            ></nldd-icon-button>
          )}
        </nldd-container>
        <nldd-form-field label="Input: wat herkent de AI?">
          <nldd-multi-line-text-field
            ref={inputRef}
            rows={2}
            placeholder={
              idx === 0
                ? 'Bijv. Analyseer of de mail onbeleefd is.'
                : 'Bijv. Het bericht is onduidelijk: niet te zien wat de afzender vraagt.'
            }
          ></nldd-multi-line-text-field>
        </nldd-form-field>
        <nldd-form-field label="Output: hoe reageert de AI dan?">
          <nldd-multi-line-text-field
            ref={outputRef}
            rows={2}
            placeholder={
              idx === 0
                ? 'Bijv. Reageer beleefd: "Vervelend dat u in deze situatie zit. We helpen u graag verder."'
                : 'Bijv. Vraag om uitleg: "We begrijpen uw bericht niet helemaal. Kunt u wat meer uitleg geven?"'
            }
          ></nldd-multi-line-text-field>
        </nldd-form-field>
      </nldd-container>
    </nldd-card>
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
      <nldd-inline-dialog variant="loading" text="De AI legt je input en output naast de context…"></nldd-inline-dialog>
    );
  }
  if (!analyzed) {
    return (
      <nldd-container gap="12">
        <nldd-text size="sm">
          De AI legt je input en output naast de context: welke kenmerken de prompt moet vastleggen, welke
          details alleen bij één geval horen, en welke situaties nog ontbreken.
        </nldd-text>
        <nldd-container horizontal-alignment="left">
          <nldd-button appearance="secondary" start-icon="sparkles" text="Analyseer" onClick={onAnalyze}></nldd-button>
        </nldd-container>
      </nldd-container>
    );
  }
  return (
    <nldd-container gap="16">
      {stale && (
        <nldd-banner variant="warning" size="sm" text="Je hebt de context of de paren aangepast sinds deze analyse.">
          <nldd-button slot="actions" start-icon="arrow-clockwise" text="Opnieuw analyseren" onClick={onAnalyze}></nldd-button>
        </nldd-banner>
      )}

      {/* Dekking: situaties uit de context zonder paar. */}
      {dekking && (
        <nldd-banner variant="accent" size="sm" icon="sparkles" text="Nog niet gedekt" supporting-text={dekking}>
          <nldd-button slot="actions" start-icon="plus" text="Input en output toevoegen" onClick={onAddPair}></nldd-button>
        </nldd-banner>
      )}

      {/* Tegenspraak of overlap tussen paren. */}
      {consistentie && (
        <nldd-banner variant="warning" size="sm" text="Let op" supporting-text={consistentie}></nldd-banner>
      )}

      <FeatureChecklist
        title="Deze kenmerken zag ik in je outputs; welke moet de prompt vastleggen?"
        features={d.overnemen}
        onToggle={(i) => onToggle('overnemen', i)}
      />
      {d.nietOvernemen.length > 0 && (
        <FeatureChecklist
          title="Deze details horen bij één geval; deze laat ik weg (of maak ik een [plaatshouder])"
          features={d.nietOvernemen}
          onToggle={(i) => onToggle('nietOvernemen', i)}
        />
      )}

      <RandgevalField value={d.randgeval} onChange={onRandgeval} />

      {!stale && (
        <nldd-container horizontal-alignment="left">
          <nldd-button size="sm" appearance="neutral-transparent" text="Opnieuw analyseren" onClick={onAnalyze}></nldd-button>
        </nldd-container>
      )}
    </nldd-container>
  );
}

function RandgevalField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onChange);
  return (
    <nldd-form-field label="Wat doet de AI als geen enkele input past?" optional>
      <nldd-multi-line-text-field
        ref={ref}
        rows={2}
        placeholder="Bijv. Niet gokken, maar de mail doorsturen naar een medewerker met een korte samenvatting."
      ></nldd-multi-line-text-field>
    </nldd-form-field>
  );
}

function FeatureChecklist({
  title,
  features,
  onToggle,
}: {
  title: string;
  features: FewShotFeature[];
  onToggle: (index: number) => void;
}) {
  return (
    <nldd-container gap="6">
      <nldd-text size="sm" weight="bold">
        {title}
      </nldd-text>
      <nldd-list appearance="box-tinted" accessible-label={title}>
        {features.map((f, i) => (
          <FeatureRow key={i} feature={f} onToggle={() => onToggle(i)} />
        ))}
      </nldd-list>
    </nldd-container>
  );
}

function FeatureRow({ feature: f, onToggle }: { feature: FewShotFeature; onToggle: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => {
    if (e.detail?.checked !== f.checked) onToggle();
  });
  return (
    <nldd-list-item ref={ref} checkbox checked={f.checked || undefined}>
      <nldd-cell>
        <nldd-checkbox decorative checked={f.checked || undefined}></nldd-checkbox>
      </nldd-cell>
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-text-cell text={f.label} supporting-text={f.detail || undefined}></nldd-text-cell>
    </nldd-list-item>
  );
}
