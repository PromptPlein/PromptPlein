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
import { splitFieldLabel } from '@/lib/fieldLabel';
import type { AiProvider } from '@/config/aiModels';
import type { FollowUpQuestion, PrefilledField, PrefillSource, Technique } from '@/types';

/** Herkomst + toelichting van een voor-ingevuld veld, per veld-id. */
export type FieldMeta = Record<string, { source: PrefillSource; note?: string }>;

interface FieldBlockProps {
  question: FollowUpQuestion;
  value: string;
  meta?: { source: PrefillSource; note?: string };
  /** Voorvoegsel voor het veld-id, zodat beide indelingen eigen ids houden. */
  idPrefix: string;
  autoFocus?: boolean;
  /** Hoger tekstvak; de stapsgewijze indeling toont er maar één tegelijk. */
  tall?: boolean;
  /**
   * Letter (C van CONTEXT) of volgnummer vóór de naam. Weggelaten in de
   * letterrail, die de letter zelf al naast het veld toont.
   */
  marker?: string;
  /**
   * Het veld staat in de letterrail: geen eigen kaart, want de rail verbindt de
   * velden al tot één geheel. Alleen als de AI eraan werkt kleurt het blok op.
   */
  rail?: boolean;
  onChange: (value: string) => void;
  /** Start "Vul verder aan" voor dit veld. */
  onExpand: () => void;
  /** De AI werkt op dit moment aan dít veld. */
  expanding: boolean;
  /** De AI werkt aan een veld (dit of een ander); de actie is dan geblokkeerd. */
  busy: boolean;
  /** Het openstaande voorstel voor dit veld, of null als er geen is. */
  proposal: { proposed: string; improvements: string[] } | null;
  onAccept: () => void;
  onReject: () => void;
  /** Voorgestelde aanvulling onder het eigen antwoord (sjabloon), of null. */
  aanvulling?: string | null;
  onAanvullingToevoegen?: () => void;
  onAanvullingVerwerpen?: () => void;
}

/**
 * Eén veld met alles wat erbij hoort: de vraag, het tekstvak, de toelichting, de
 * AI-actie en het eventuele voorstel. Bewust één omkaderd blok: zodra de AI aan
 * een veld werkt kleurt dat hele blok op, zodat zichtbaar blijft welk veld
 * verbeterd wordt in plaats van een los voorstel onder een los tekstvak.
 */
function FieldBlock({
  question,
  value,
  meta,
  idPrefix,
  autoFocus,
  tall,
  marker,
  rail = false,
  onChange,
  onExpand,
  expanding,
  busy,
  proposal,
  onAccept,
  onReject,
  aanvulling,
  onAanvullingToevoegen,
  onAanvullingVerwerpen,
}: FieldBlockProps) {
  const fieldId = `${idPrefix}-${question.id}`;
  const active = expanding || proposal !== null;
  const filled = value.trim() !== '';
  const { name, instruction } = splitFieldLabel(question.label);
  return (
    <div
      className={clsx(
        'transition-all duration-200',
        rail
          ? // In de rail: geen kaart, alleen een tint zolang de AI aan dit veld werkt.
            clsx(
              'rounded-xl border p-3',
              active
                ? 'border-rijksblauw-300 bg-rijksblauw-50/60 ring-4 ring-rijksblauw-500/10 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10 dark:ring-rijksblauw-500/15'
                : 'border-transparent',
            )
          : // Een stevige rand met een zachte schaduw: het veld, de toelichting en
            // "Vul verder aan" horen zichtbaar bij elkaar. De rand volgt waar je
            // bent: rustig grijs, blauw zodra je in het veld typt, en vol blauw met
            // een lichte gloed zodra de AI aan dit veld werkt.
            clsx(
              'rounded-2xl border-2 p-4 shadow-sm',
              active
                ? 'border-rijksblauw-400 bg-rijksblauw-50/50 shadow-md shadow-rijksblauw-500/10 ring-4 ring-rijksblauw-500/10 dark:border-rijksblauw-500/70 dark:bg-rijksblauw-500/10 dark:ring-rijksblauw-500/15'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md focus-within:border-rijksblauw-300 focus-within:shadow-md dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-slate-600 dark:focus-within:border-rijksblauw-500/50',
            ),
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100"
          htmlFor={fieldId}
        >
          {marker && (
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rijksblauw-500 text-sm font-bold text-white"
            >
              {marker}
            </span>
          )}
          {name}
        </label>
        {meta && filled && <PrefillBadge source={meta.source} note={meta.note} />}
        {active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-500/10 px-2 py-0.5 text-[11px] font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-100">
            <Wand2 size={11} /> {expanding ? 'AI vult dit veld aan' : 'Voorstel voor dit veld'}
          </span>
        )}
      </div>
      {/* De uitleg uit het label staat los onder de naam, boven het veld. */}
      {instruction && (
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{instruction}</p>
      )}
      <textarea
        id={fieldId}
        autoFocus={autoFocus}
        className={clsx('opl-input mt-2 resize-y', tall ? 'min-h-[120px]' : 'min-h-[100px]')}
        value={value}
        placeholder={question.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Toelichting uit de techniek-definitie: waarom deze vraag ertoe doet. */}
      {question.why && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{question.why}</p>}
      {meta?.note && filled ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles size={12} /> {meta.note}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Optioneel. Wat je leeg laat, wordt een invulbare plaatshouder in de prompt.
        </p>
      )}
      {/* Voetregel van hetzelfde blok: een haarlijn scheidt de actie van het
          veld, maar houdt hem er zichtbaar binnen. In de rail is er geen kaart,
          dus ook geen haarlijn nodig. */}
      <div
        className={clsx(
          'flex',
          rail ? 'mt-2' : 'mt-3 border-t pt-3',
          active
            ? 'border-rijksblauw-200 dark:border-rijksblauw-500/30'
            : 'border-slate-100 dark:border-slate-700/70',
        )}
      >
        <button
          type="button"
          onClick={onExpand}
          disabled={busy || !filled}
          title="Laat AI dit veld verder aanvullen"
          aria-label="Laat AI dit veld verder aanvullen"
          className="inline-flex items-center gap-1.5 rounded-lg border border-rijksblauw-300 bg-rijksblauw-50 px-3 py-1.5 text-xs font-semibold text-rijksblauw-700 shadow-sm transition-colors hover:border-rijksblauw-400 hover:bg-rijksblauw-100 hover:shadow disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10 dark:text-rijksblauw-100 dark:hover:bg-rijksblauw-500/20"
        >
          {expanding ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {expanding ? 'Bezig met aanvullen…' : 'Vul verder aan'}
        </button>
      </div>
      {proposal && (
        <ExpandProposal
          fieldLabel={name}
          proposed={proposal.proposed}
          improvements={proposal.improvements}
          onAccept={onAccept}
          onReject={onReject}
        />
      )}
      {/* Een aanvulling vervangt niets: ze komt pas onder het eigen antwoord als
          de gebruiker haar toevoegt, zodat zichtbaar blijft wat er veranderde. */}
      {aanvulling && onAanvullingToevoegen && onAanvullingVerwerpen && (
        <ExpandProposal
          title={`Aanvulling van de AI voor ${name}`}
          proposed={aanvulling}
          improvements={[]}
          hint='Je eigen antwoord blijft staan. Voeg je dit toe, dan komt het eronder na "Aangevuld door de AI:".'
          acceptLabel="Toevoegen aan mijn antwoord"
          onAccept={onAanvullingToevoegen}
          onReject={onAanvullingVerwerpen}
        />
      )}
    </div>
  );
}

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
  /** Context van het aangehaakte chatproject; zie ProjectContextBar. */
  projectContext?: string;
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
  /**
   * Optioneel: de bouw-actie. Meegegeven staat hij in de knoppenbalk van de
   * vragenlijst zelf: naast "Volgende" bij stap voor stap, rechtsonder bij alle
   * velden tegelijk. De ouder toont dan geen losse knop meer onder het blok.
   */
  onBuild?: () => void;
  /** Opschrift van die bouw-knop. */
  buildLabel?: string;
  /**
   * Sjabloon: per veld een voorgestelde aanvulling van de AI. Die verandert het
   * antwoord niet; de gebruiker voegt haar toe of verwerpt haar.
   */
  aanvullingen?: Record<string, string>;
  onAanvulling?: (id: string, toevoegen: boolean) => void;
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
  projectContext,
  onFinish,
  finishLabel = 'Genereren en optimaliseren prompt',
  onBuild,
  buildLabel = 'Bouw prompt',
  aanvullingen,
  onAanvulling,
}: FollowUpQuestionsProps) {
  const questions = technique.follow_up_questions;
  const total = questions.length;
  // Frameworks (CARE, CO-STAR) krijgen per veld hun letter; technieken met
  // gewone vragen een volgnummer.
  const labelParts = questions.map((q) => splitFieldLabel(q.label));
  const lettered = labelParts.length > 0 && labelParts.every((p) => p.code);
  const markers = labelParts.map((p, i) => (lettered && p.code ? p.code : String(i + 1)));
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
        fields={questions.map((q, i) => ({ id: q.id, label: labelParts[i].name }))}
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
        projectContext,
      });
      if (res.success && res.value && res.value.trim() && res.value.trim() !== currentValue) {
        // Niet direct toepassen: toon een voorstel dat de gebruiker beoordeelt.
        setProposal({ fieldId: q.id, proposed: res.value.trim(), improvements: res.improvements });
      } else if (res.success) {
        toast('Dit veld is al goed ingevuld.', { icon: '👍' });
      } else {
        toast.error(res.error ?? 'Aanvullen lukte niet; probeer het opnieuw.');
      }
    } catch {
      toast.error('Aanvullen lukte niet; probeer het opnieuw.');
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

  // De bouw-knop hoort bij de velden, dus staat hij in elke indeling in de
  // knoppenbalk van de vragenlijst zelf. Oranje: het is de afsluitende actie,
  // niet zomaar de volgende stap.
  const buildButton = onBuild ? (
    <button type="button" className="opl-btn-accent" onClick={onBuild}>
      <Sparkles size={16} /> {buildLabel}
    </button>
  ) : null;

  const answeredCount = questions.filter((q) => (answers[q.id] ?? '').trim()).length;

  // --- Indeling "alles tegelijk": de velden langs een letterrail ---
  // De letters (C, A, R, E) staan onder elkaar naast de velden, verbonden door
  // een lijn, zodat het framework leest als één geheel met losse onderdelen en
  // niet als een voortzetting van het contextvak erboven. Een gevulde letter
  // betekent dat het veld is ingevuld.
  if (layout === 'stacked') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {lettered && (
              <span className="text-base font-bold tracking-[0.14em] text-rijksblauw-800 dark:text-rijksblauw-100">
                {markers.join(' · ')}
              </span>
            )}
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {answeredCount} van {total} ingevuld
            </span>
          </p>
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <ol>
          {questions.map((q, i) => {
            const filled = (answers[q.id] ?? '').trim() !== '';
            const last = i === total - 1;
            return (
              <li key={q.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
                <div className="flex flex-col items-center" aria-hidden="true">
                  <span
                    className={clsx(
                      'mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 text-lg font-bold transition-colors',
                      filled
                        ? 'border-rijksblauw-500 bg-rijksblauw-500 text-white'
                        : 'border-rijksblauw-500 bg-white text-rijksblauw-600 dark:border-rijksblauw-400 dark:bg-slate-800 dark:text-rijksblauw-200',
                    )}
                  >
                    {markers[i]}
                  </span>
                  {!last && <span className="my-1 w-0.5 flex-1 bg-rijksblauw-200 dark:bg-rijksblauw-500/40" />}
                </div>
                <div className={clsx(!last && 'pb-3')}>
                  <FieldBlock
                    question={q}
                    value={answers[q.id] ?? ''}
                    meta={fieldMeta?.[q.id]}
                    idPrefix="fu-stacked"
                    rail
                    onChange={(v) => editField(q.id, v)}
                    onExpand={() => handleExpand(q)}
                    expanding={expandingId === q.id}
                    busy={expandingId !== null}
                    proposal={proposal?.fieldId === q.id ? proposal : null}
                    onAccept={acceptProposal}
                    onReject={rejectProposal}
                    aanvulling={aanvullingen?.[q.id] ?? null}
                    onAanvullingToevoegen={onAanvulling && (() => onAanvulling(q.id, true))}
                    onAanvullingVerwerpen={onAanvulling && (() => onAanvulling(q.id, false))}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {/* Alles staat al in beeld, dus er valt hier niets meer te navigeren:
            alleen de bouw-knop, rechts onderaan. */}
        {buildButton && <div className="flex justify-end pt-1">{buildButton}</div>}
      </div>
    );
  }

  const current = questions[step];
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
            <Check size={16} /> Overzicht: controleer je antwoorden
          </div>
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {hasPrefill
            ? 'We hebben deze velden alvast voor je ingevuld op basis van je prompt. Controleer en pas aan waar nodig, vooral de AI-suggesties met het oranje label "Controleren".'
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
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rijksblauw-500 text-xs font-bold text-white"
                      >
                        {markers[i]}
                      </span>
                      {labelParts[i].name}
                    </p>
                    {meta && value && <PrefillBadge source={meta.source} note={meta.note} />}
                  </div>
                  <p
                    className={clsx(
                      'mt-0.5 whitespace-pre-wrap text-sm',
                      value ? 'text-slate-600 dark:text-slate-300' : 'italic text-slate-400 dark:text-slate-500',
                    )}
                  >
                    {value || 'Nog niet ingevuld; blijft een plaatshouder in de prompt.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewing(false);
                    setStep(i);
                  }}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rijksblauw-600 dark:hover:bg-slate-800"
                  aria-label={`Bewerk: ${labelParts[i].name}`}
                  title="Bewerken"
                >
                  <Pencil size={15} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft size={15} /> Terug naar de vragen
          </button>
          {buildButton}
        </div>
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
        <FieldBlock
          question={current}
          value={answers[current.id] ?? ''}
          meta={currentMeta}
          idPrefix="fu"
          autoFocus
          tall
          marker={markers[step]}
          onChange={update}
          onExpand={() => handleExpand(current)}
          expanding={expandingId === current.id}
          busy={expandingId !== null}
          proposal={proposal?.fieldId === current.id ? proposal : null}
          onAccept={acceptProposal}
          onReject={rejectProposal}
          aanvulling={aanvullingen?.[current.id] ?? null}
          onAanvullingToevoegen={onAanvulling && (() => onAanvulling(current.id, true))}
          onAanvullingVerwerpen={onAanvulling && (() => onAanvulling(current.id, false))}
        />
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
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          {/* Naast "Volgende": je hoeft de rest van de vragen niet af te lopen
              om te kunnen bouwen. */}
          {buildButton}
        </div>
      </div>
    </div>
  );
}
