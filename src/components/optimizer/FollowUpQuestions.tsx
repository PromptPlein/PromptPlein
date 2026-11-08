import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Pencil, Sparkles, Wand2 } from '@/components/common/icons';
import clsx from 'clsx';
import { notify } from '@/lib/notify';
import InfoDot from '@/components/common/InfoDot';
import PrefillBadge from './PrefillBadge';
import PrefillLoader from './PrefillLoader';
import FieldLayoutToggle from './FieldLayoutToggle';
import ExpandProposal from './ExpandProposal';
import { useFieldLayout } from '@/lib/useFieldLayout';
import { expandField, type PrefillPhase } from '@/services/optimizeService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
import { structureFormat } from '@/lib/techniques';
import { compactFieldLabel } from '@/lib/fieldLabel';
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
  /** Letter van het framework-onderdeel (de C van CONTEXT), of leeg. */
  marker?: string;
  /** Is dit veld leeg, dan vragen we erom: label en oranje rand. */
  askIfEmpty?: boolean;
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
 * Eén veld, compact: naam, uitleg achter het infobolletje en het tekstvak. Staat
 * er tekst in, dan komt "Vul verder aan" erbij. Zodra de AI aan een veld werkt,
 * kleurt het hele blok op en neemt het de volle breedte, zodat het voorstel
 * leesbaar is en zichtbaar blijft bij welk veld het hoort.
 *
 * Elk veld bestaat uit vijf rijen (naam, status, tekstvak, notitie, voorstel) die
 * het via subgrid deelt met het veld ernaast. Zo staan tekstvakken en labels op één
 * lijn, ook als één titel over twee regels loopt. Een rij die in geen enkel veld
 * iets toont, heeft geen hoogte.
 */
function FieldBlock({
  question,
  value,
  meta,
  idPrefix,
  autoFocus,
  tall,
  marker,
  askIfEmpty,
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
  const { name, instruction } = compactFieldLabel(question.label);
  const uitleg = [instruction, question.why].filter(Boolean).join('\n');
  const badge = Boolean(meta && filled);
  const vraag = Boolean(askIfEmpty && !filled);
  return (
    <div
      className={clsx(
        'min-w-0 rounded-xl border p-2 transition-all duration-200',
        // Alleen in het raster: stap voor stap staat er één veld, zonder buren.
        !tall && 'row-span-5 grid grid-cols-1 grid-rows-subgrid',
        (active || aanvulling) && 'col-span-full',
        active
          ? 'border-rijksblauw-300 bg-rijksblauw-50/60 ring-4 ring-rijksblauw-500/10 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10 dark:ring-rijksblauw-500/15'
          : 'border-transparent',
      )}
    >
      <div className="flex min-h-8 items-start gap-x-1.5">
        {marker && (
          <span
            aria-hidden="true"
            className={clsx(
              'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold transition-colors',
              filled
                ? 'bg-rijksblauw-500 text-white'
                : 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200',
            )}
          >
            {marker}
          </span>
        )}
        <label
          className="min-w-0 pt-1 text-[0.9375rem] font-semibold leading-snug text-slate-800 dark:text-slate-100"
          htmlFor={fieldId}
        >
          {name}
        </label>
        {uitleg && <InfoDot label={`Uitleg bij ${name}`} text={uitleg} />}
      </div>
      {/* Status en actie op een eigen rij, zodat ze de titel niet laten verspringen. */}
      <div>
        {(badge || active || filled || vraag) && (
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 pb-1">
            {meta && filled && <PrefillBadge source={meta.source} note={meta.note} />}
            {vraag && (
              <span className="inline-flex items-center rounded-full bg-rijksoranje/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-800 dark:text-slate-100">
                Vul dit nog in
              </span>
            )}
            {active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-500/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-100">
                <Wand2 size={11} /> {expanding ? 'AI vult dit veld aan' : 'Voorstel voor dit veld'}
              </span>
            )}
            {filled && (
              <button
                type="button"
                onClick={onExpand}
                disabled={busy}
                title="Laat AI dit veld verder aanvullen"
                aria-label={`Laat AI ${name} verder aanvullen`}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rijksblauw-500 transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-rijksblauw-200"
              >
                {expanding ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {expanding ? 'Bezig met aanvullen…' : 'Vul verder aan'}
              </button>
            )}
          </div>
        )}
      </div>
      <textarea
        id={fieldId}
        autoFocus={autoFocus}
        rows={tall ? 6 : 3}
        className={clsx(
          'opl-input block min-h-full resize-y self-stretch text-[0.9375rem]',
          vraag && 'border-2 border-rijksoranje',
        )}
        value={value}
        placeholder={question.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div>
        {meta?.note && filled && (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Sparkles size={12} className="shrink-0" /> {meta.note}
          </p>
        )}
      </div>
      <div className="min-w-0">
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
  /** Context van het aangehaakte chatproject; zie ProjectContextPicker. */
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
  /** Kop boven de velden, links van de indelingsknop (bijv. een StepHeading). */
  heading?: ReactNode;
  /** Toon de letter van het framework bij elk veld; uit op Prompt maken. */
  showLetters?: boolean;
  /** Vraag om lege velden (na het voor-invullen door de AI). */
  askIfEmpty?: boolean;
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
  heading,
  showLetters = true,
  askIfEmpty = false,
}: FollowUpQuestionsProps) {
  const questions = technique.follow_up_questions;
  const total = questions.length;
  // Frameworks (CARE, CO-STAR) krijgen per veld hun letter; technieken met
  // gewone vragen geen, die hebben aan hun vraag genoeg.
  const labelParts = questions.map((q) => compactFieldLabel(q.label));
  const lettered = labelParts.length > 0 && labelParts.every((p) => p.code);
  const markers = labelParts.map((p, i) => (lettered && p.code ? p.code : String(i + 1)));
  const fieldMarker = (i: number) => (lettered && showLetters ? markers[i] : undefined);
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
        notify('Dit veld is al goed ingevuld.', { icon: '👍' });
      } else {
        notify.error(res.error ?? 'Aanvullen lukte niet; probeer het opnieuw.');
      }
    } catch {
      notify.error('Aanvullen lukte niet; probeer het opnieuw.');
    } finally {
      setExpandingId(null);
    }
  }

  /** Neem het openstaande voorstel over: vervang de veldwaarde en sluit het voorstel. */
  function acceptProposal() {
    if (!proposal) return;
    editField(proposal.fieldId, proposal.proposed);
    setProposal(null);
    notify.success('AI-voorstel overgenomen.');
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

  // --- Indeling "alles tegelijk": alle velden in een raster ---
  // Het raster kijkt naar de ruimte die er is en niet naar het scherm: in een
  // smal venster of bij grote letters vallen de velden vanzelf onder elkaar.
  if (layout === 'stacked') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 [&>div]:mb-0">
            {heading}
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {answeredCount} van {total} ingevuld, leeg laten mag
            </span>
          </div>
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <div className="-mx-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-x-2">
          {questions.map((q, i) => (
            <FieldBlock
              key={q.id}
              question={q}
              value={answers[q.id] ?? ''}
              meta={fieldMeta?.[q.id]}
              idPrefix="fu-stacked"
              marker={fieldMarker(i)}
              askIfEmpty={askIfEmpty}
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
          ))}
        </div>
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
      <div className="flex flex-wrap items-center justify-between gap-2 [&>div:first-child]:mb-0">
        {heading ?? <span />}
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
          marker={fieldMarker(step)}
          askIfEmpty={askIfEmpty}
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
