import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import PrefillBadge from './PrefillBadge';
import PrefillLoader from './PrefillLoader';
import FieldLayoutToggle from './FieldLayoutToggle';
import ExpandProposal from './ExpandProposal';
import { useFieldLayout } from '@/lib/useFieldLayout';
import { expandField, type PrefillPhase } from '@/services/optimizeService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { structureFormat } from '@/lib/techniques';
import type { AiProvider } from '@/config/aiModels';
import type { FollowUpQuestion, PrefilledField, PrefillSource, Technique } from '@/types';

/** Herkomst + toelichting van een voor-ingevuld veld, per veld-id. */
export type FieldMeta = Record<string, { source: PrefillSource; note?: string }>;

/**
 * Live voortgang van het voor-invullen: welke modellen tegelijk aan het werk
 * zijn, wie de race won, welke fase loopt en welke velden al binnen zijn. De
 * ouder vult dit vanuit de `on*`-callbacks van `prefillFields`.
 */
export interface PrefillProgress {
  models?: string[];
  winner?: string | null;
  phase?: PrefillPhase;
  fields?: PrefilledField[];
}

interface FollowUpQuestionsProps {
  technique: Technique;
  answers: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
  /**
   * Voor-ingevulde herkomst per veld (origin-badges). Velden die de gebruiker
   * daarna zelf aanpast, verliezen hun badge via `onUserEdit`.
   */
  fieldMeta?: FieldMeta;
  /** Aangeroepen wanneer de gebruiker een veld handmatig wijzigt (badge laten vervallen). */
  onUserEdit?: (id: string) => void;
  /** True terwijl de velden worden voor-ingevuld; toont een laadstaat. */
  prefilling?: boolean;
  /**
   * Live voortgang van dat voor-invullen. Zonder deze prop toont het laadscherm
   * gewoon skeletten; met de prop lopen de velden zichtbaar vol.
   */
  prefillProgress?: PrefillProgress;
  /**
   * AI-provider voor de per-veld "Vul verder aan"-actie. Optioneel: wanneer niet
   * meegegeven, leest de component zelf de voorkeuren uit de instellingen.
   */
  preferredProvider?: AiProvider;
  /** Concreet AI-model voor "Vul verder aan". Optioneel; zie preferredProvider. */
  preferredModel?: string;
  /**
   * Optioneel: wanneer meegegeven, sluit de laatste stap direct af met een
   * genereer-actie ("Genereren en optimaliseren prompt") in plaats van het
   * interne overzicht te tonen. De ouder start dan meteen de generatie.
   */
  onFinish?: () => void;
  /**
   * Opschrift van die afsluit-knop. Standaard de tekst van de eigen-prompt-flow;
   * de doel-flow bouwt geen losse prompt maar een prompt rond een gesprek en
   * gebruikt daar zijn eigen bewoording voor.
   */
  finishLabel?: string;
}

/**
 * Begeleidt de gebruiker stap voor stap door de velden die nodig zijn om een
 * herbruikbare prompt-template te bouwen. Eén vraag per scherm met voortgang,
 * en aan het eind een overzicht. Het doel is een template die een collega
 * later opnieuw kan invullen — niet het optimaliseren van losse tekst.
 */
export default function FollowUpQuestions({
  technique,
  answers,
  onChange,
  fieldMeta,
  onUserEdit,
  prefilling = false,
  prefillProgress,
  preferredProvider,
  preferredModel,
  onFinish,
  finishLabel = 'Genereren en optimaliseren prompt',
}: FollowUpQuestionsProps) {
  const questions = technique.follow_up_questions;
  const total = questions.length;
  const [step, setStep] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  // Persoonlijke voorkeur: stap voor stap (default) of alle velden tegelijk.
  const [layout, setLayout] = useFieldLayout();
  // Per-veld laadstaat voor de "Vul verder aan"-actie (id van het veld dat draait).
  const [expandingId, setExpandingId] = useState<string | null>(null);
  // Het openstaande AI-voorstel: welk veld, het voorstel en wat er is verbeterd.
  // De gebruiker neemt het over of verwerpt het.
  const [proposal, setProposal] = useState<{
    fieldId: string;
    proposed: string;
    improvements: string[];
  } | null>(null);
  // Eigen AI-voorkeuren; alleen gebruikt als de props niet zijn meegegeven.
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);

  // Reset de wizard wanneer er een andere techniek wordt gekozen.
  useEffect(() => {
    setStep(0);
    setReviewing(false);
    setProposal(null);
  }, [technique.id]);

  // Laad de AI-instellingen zelf, zodat "Vul verder aan" ook werkt zonder props.
  useEffect(() => {
    let active = true;
    getAiSettings()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Laadstaat tijdens het voor-invullen: hetzelfde laadscherm als de andere
  // flows, met de velden die één voor één vollopen zodra ze binnen zijn.
  if (prefilling) {
    return (
      <PrefillLoader
        techniqueName={technique.name}
        source="je vraagstuk"
        fields={questions.map((q) => ({ id: q.id, label: q.label }))}
        filled={prefillProgress?.fields}
        models={prefillProgress?.models}
        winner={prefillProgress?.winner}
        phase={prefillProgress?.phase}
      />
    );
  }

  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        Deze techniek heeft geen invulvelden. Je kunt de prompt direct bouwen.
      </div>
    );
  }

  /** Werk één veld bij (gebruikt door de "alles tegelijk"-indeling). */
  function editField(id: string, value: string) {
    onChange({ ...answers, [id]: value });
    // Zodra de gebruiker zelf typt, is de herkomst-badge niet meer accuraat.
    onUserEdit?.(id);
  }

  /**
   * "Vul verder aan": laat de AI de tekst van één veld verbeteren, toegespitst op
   * de rol van dat veld. Het resultaat verschijnt als VOORSTEL (nette tekst + korte
   * lijst met wat er is verbeterd, zie {@link ExpandProposal}) dat de gebruiker kan
   * overnemen of verwerpen. Bereikbaar vanuit beide indelingen.
   */
  async function handleExpand(q: FollowUpQuestion) {
    const currentValue = (answers[q.id] ?? '').trim();
    if (!currentValue || expandingId) return; // niets om aan te vullen / al bezig
    setExpandingId(q.id);
    setProposal(null); // een eventueel eerder voorstel vervalt
    try {
      const siblings = questions
        .filter((s) => s.id !== q.id)
        .map((s) => ({ label: s.label, value: (answers[s.id] ?? '').trim() }))
        .filter((s) => s.value); // alleen gevulde velden, voor consistentiecontext
      const res = await expandField({
        field: { id: q.id, label: q.label, placeholder: q.placeholder },
        currentValue,
        siblings,
        techniqueName: technique.name,
        structureFormat: structureFormat(technique),
        preferredProvider: preferredProvider ?? settings.provider,
        preferredModel: preferredModel ?? settings.model,
      });
      if (res.success && res.value && res.value.trim() && res.value.trim() !== currentValue) {
        // Niet direct toepassen: toon een voorstel dat de gebruiker beoordeelt.
        setProposal({ fieldId: q.id, proposed: res.value.trim(), improvements: res.improvements });
      } else if (res.success) {
        toast('Dit veld is al goed ingevuld.', { icon: '👍' });
      } else {
        toast.error(res.error ?? 'Aanvullen lukte niet — probeer het opnieuw.');
      }
    } catch {
      toast.error('Aanvullen lukte niet — probeer het opnieuw.');
    } finally {
      setExpandingId(null);
    }
  }

  /** Neem het openstaande voorstel over: vervang de veldwaarde en sluit het voorstel. */
  function acceptProposal() {
    if (!proposal) return;
    editField(proposal.fieldId, proposal.proposed);
    setProposal(null);
    toast.success('AI-voorstel overgenomen.');
  }

  /** Verwerp het openstaande voorstel: het veld blijft ongewijzigd. */
  function rejectProposal() {
    setProposal(null);
  }

  // --- Indeling "alles tegelijk": alle velden onder elkaar ---
  if (layout === 'stacked') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        {questions.map((q) => {
          const meta = fieldMeta?.[q.id];
          const value = answers[q.id] ?? '';
          return (
            <div key={q.id}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <label className="opl-label mb-0" htmlFor={`fu-stacked-${q.id}`}>
                  {q.label}
                </label>
                {meta && value.trim() && <PrefillBadge source={meta.source} note={meta.note} />}
              </div>
              <textarea
                id={`fu-stacked-${q.id}`}
                className="opl-input min-h-[100px] resize-y"
                value={value}
                placeholder={q.placeholder}
                onChange={(e) => editField(q.id, e.target.value)}
              />
              {/* Toelichting uit de techniek-definitie: waarom deze vraag ertoe doet. */}
              {q.why && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{q.why}</p>
              )}
              {meta?.note && value.trim() ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                  <Sparkles size={12} /> {meta.note}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Optioneel. Wat je leeg laat, wordt een invulbare plaatshouder in de prompt.
                </p>
              )}
              <div className="mt-1.5 flex">
                <button
                  type="button"
                  onClick={() => handleExpand(q)}
                  disabled={expandingId !== null || value.trim() === ''}
                  title="Laat AI dit veld verder aanvullen"
                  aria-label="Laat AI dit veld verder aanvullen"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rijksblauw-300 bg-rijksblauw-50 px-3 py-1.5 text-xs font-semibold text-rijksblauw-700 shadow-sm transition-colors hover:border-rijksblauw-400 hover:bg-rijksblauw-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10 dark:text-rijksblauw-100 dark:hover:bg-rijksblauw-500/20"
                >
                  {expandingId === q.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Wand2 size={14} />
                  )}
                  Vul verder aan
                </button>
              </div>
              {proposal?.fieldId === q.id && (
                <ExpandProposal
                  proposed={proposal.proposed}
                  improvements={proposal.improvements}
                  onAccept={acceptProposal}
                  onReject={rejectProposal}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const current = questions[step];
  const answeredCount = questions.filter((q) => (answers[q.id] ?? '').trim()).length;
  const isLast = step === total - 1;
  const hasPrefill = Boolean(fieldMeta && Object.keys(fieldMeta).length > 0);
  const currentMeta = fieldMeta?.[current?.id ?? ''];

  function update(value: string) {
    editField(current.id, value);
  }

  function next() {
    if (isLast) {
      // Wanneer de ouder een afsluit-actie meegeeft, genereren we direct in
      // plaats van het interne overzicht te tonen.
      if (onFinish) onFinish();
      else setReviewing(true);
    } else {
      setStep((s) => Math.min(s + 1, total - 1));
    }
  }

  function back() {
    if (reviewing) setReviewing(false);
    else setStep((s) => Math.max(s - 1, 0));
  }

  // --- Overzichtsweergave (na de laatste vraag) ---
  if (reviewing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
            <Check size={16} /> Overzicht — controleer je antwoorden
          </div>
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {hasPrefill
            ? 'We hebben deze velden alvast voor je ingevuld op basis van je prompt. Controleer en pas aan waar nodig — vooral de AI-suggesties met het oranje label "Controleren".'
            : 'Dit zijn de bouwstenen van je prompt. Klopt alles? Bouw dan de herbruikbare prompt.'}
        </p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {questions.map((q, i) => {
            const value = (answers[q.id] ?? '').trim();
            const meta = fieldMeta?.[q.id];
            return (
              <li key={q.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{q.label}</p>
                    {meta && value && <PrefillBadge source={meta.source} note={meta.note} />}
                  </div>
                  <p
                    className={clsx(
                      'mt-0.5 whitespace-pre-wrap text-sm',
                      value ? 'text-slate-600 dark:text-slate-300' : 'italic text-slate-400 dark:text-slate-500',
                    )}
                  >
                    {value || 'Nog niet ingevuld — blijft een plaatshouder in de prompt.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewing(false);
                    setStep(i);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rijksblauw-600 dark:hover:bg-slate-800"
                  aria-label={`Bewerk: ${q.label}`}
                  title="Bewerken"
                >
                  <Pencil size={15} />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft size={15} /> Terug naar de vragen
        </button>
      </div>
    );
  }

  // --- Stapsgewijze vraagweergave ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <FieldLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      {/* Voortgang */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>
            Vraag {step + 1} van {total}
          </span>
          <span>{answeredCount} ingevuld</span>
        </div>
        <div className="flex gap-1">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Ga naar vraag ${i + 1}`}
              className={clsx(
                'h-1.5 flex-1 rounded-full transition-colors',
                i === step
                  ? 'bg-rijksblauw-500'
                  : (answers[q.id] ?? '').trim()
                    ? 'bg-rijksblauw-300 dark:bg-rijksblauw-500/50'
                    : 'bg-slate-200 dark:bg-slate-700',
              )}
            />
          ))}
        </div>
      </div>

      {/* Huidige vraag */}
      <div key={current.id} className="animate-fade-in">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <label className="opl-label mb-0" htmlFor={`fu-${current.id}`}>
            {current.label}
          </label>
          {currentMeta && (answers[current.id] ?? '').trim() && (
            <PrefillBadge source={currentMeta.source} note={currentMeta.note} />
          )}
        </div>
        <textarea
          id={`fu-${current.id}`}
          autoFocus
          className="opl-input min-h-[120px] resize-y"
          value={answers[current.id] ?? ''}
          placeholder={current.placeholder}
          onChange={(e) => update(e.target.value)}
        />
        {/* Toelichting uit de techniek-definitie: waarom deze vraag ertoe doet. */}
        {current.why && (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{current.why}</p>
        )}
        {currentMeta && currentMeta.note && (answers[current.id] ?? '').trim() ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <Sparkles size={12} /> {currentMeta.note}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Optioneel. Wat je leeg laat, wordt een invulbare plaatshouder in de prompt.
          </p>
        )}
        <div className="mt-1.5 flex">
          <button
            type="button"
            onClick={() => handleExpand(current)}
            disabled={expandingId !== null || (answers[current.id] ?? '').trim() === ''}
            title="Laat AI dit veld verder aanvullen"
            aria-label="Laat AI dit veld verder aanvullen"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rijksblauw-300 bg-rijksblauw-50 px-3 py-1.5 text-xs font-semibold text-rijksblauw-700 shadow-sm transition-colors hover:border-rijksblauw-400 hover:bg-rijksblauw-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10 dark:text-rijksblauw-100 dark:hover:bg-rijksblauw-500/20"
          >
            {expandingId === current.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Wand2 size={14} />
            )}
            Vul verder aan
          </button>
        </div>
        {proposal?.fieldId === current.id && (
          <ExpandProposal
            proposed={proposal.proposed}
            improvements={proposal.improvements}
            onAccept={acceptProposal}
            onReject={rejectProposal}
          />
        )}
      </div>

      {/* Navigatie */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={16} /> Vorige
        </button>
        <button type="button" onClick={next} className="opl-btn-primary">
          {isLast ? (
            onFinish ? (
              <>
                <Sparkles size={16} /> {finishLabel}
              </>
            ) : (
              <>
                <Check size={16} /> Naar overzicht
              </>
            )
          ) : (
            <>
              Volgende <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
