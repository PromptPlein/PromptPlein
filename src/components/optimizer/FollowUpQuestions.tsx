import { useEffect, useRef, useState, type ReactNode } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
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
import '@nldd/design-system/badge';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/spacer';
import '@nldd/design-system/step-bar';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/** Herkomst + toelichting van een voor-ingevuld veld, per veld-id. */
export type FieldMeta = Record<string, { source: PrefillSource; note?: string }>;

interface FieldBlockProps {
  question: FollowUpQuestion;
  value: string;
  meta?: { source: PrefillSource; note?: string };
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
 * krijgt het blok een getinte achtergrond, zodat het voorstel zichtbaar bij dat
 * veld hoort.
 */
function FieldBlock({
  question,
  value,
  meta,
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
  const active = expanding || proposal !== null;
  const filled = value.trim() !== '';
  const { name, instruction } = compactFieldLabel(question.label);
  const uitleg = [instruction, question.why].filter(Boolean).join('\n');
  const badge = Boolean(meta && filled);
  const vraag = Boolean(askIfEmpty && !filled);
  const label = marker ? `${marker} · ${name}` : name;

  const fieldRef = useRef<HTMLElement & { value?: string; focus: () => void }>(null);
  useNlddValue(fieldRef, value, onChange);
  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
    // Focus only when the field appears, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <nldd-container gap="8">
      <nldd-container layout="row" gap="4" vertical-alignment="center">
        <nldd-text weight="bold">{label}</nldd-text>
        {uitleg && <InfoDot label={`Uitleg bij ${name}`} text={uitleg} />}
      </nldd-container>
      {(badge || active || filled || vraag) && (
        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          {meta && filled && <PrefillBadge source={meta.source} note={meta.note} />}
          {vraag && <nldd-badge color="warning" text="Vul dit nog in"></nldd-badge>}
          {active && (
            <nldd-badge
              color="accent"
              icon="sparkles"
              text={expanding ? 'AI vult dit veld aan' : 'Voorstel voor dit veld'}
            ></nldd-badge>
          )}
          {filled && (
            <nldd-button
              size="sm"
              appearance="accent-transparent"
              start-icon="sparkles"
              text="Vul verder aan"
              accessible-label={`Laat AI ${name} verder aanvullen`}
              loading={expanding || undefined}
              loading-text="Bezig met aanvullen"
              disabled={(busy && !expanding) || undefined}
              onClick={onExpand}
            ></nldd-button>
          )}
        </nldd-container>
      )}
      <nldd-multi-line-text-field
        ref={fieldRef}
        accessible-label={name}
        rows={tall ? 6 : 3}
        placeholder={question.placeholder}
      ></nldd-multi-line-text-field>
      {meta?.note && filled && (
        <nldd-container layout="row" gap="4" vertical-alignment="center">
          <nldd-icon icon="sparkles" size="16" color="secondary-content"></nldd-icon>
          <nldd-text size="xs" color="secondary">
            {meta.note}
          </nldd-text>
        </nldd-container>
      )}
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
    </nldd-container>
  );

  return active || aanvulling ? (
    <nldd-box background="accent-tinted">
      <nldd-container padding="12">{body}</nldd-container>
    </nldd-box>
  ) : (
    body
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
 * later opnieuw kan invullen, niet het optimaliseren van losse tekst.
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
      <nldd-inline-dialog
        icon="info-circle"
        text="Deze techniek heeft geen invulvelden"
        supporting-text="Je kunt de prompt direct bouwen."
      ></nldd-inline-dialog>
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
    <nldd-button appearance="primary" start-icon="sparkles" text={buildLabel} onClick={onBuild}></nldd-button>
  ) : null;

  const answeredCount = questions.filter((q) => (answers[q.id] ?? '').trim()).length;

  // --- Indeling "alles tegelijk": alle velden in een raster ---
  // Het raster kijkt naar de ruimte die er is en niet naar het scherm: in een
  // smal venster of bij grote letters vallen de velden vanzelf onder elkaar.
  if (layout === 'stacked') {
    return (
      <nldd-container gap="12">
        <nldd-container layout="wrap" gap="12" vertical-alignment="bottom">
          <nldd-container gap="4" width="fit-content">
            {heading}
            <nldd-text size="sm" color="secondary">
              {answeredCount} van {total} ingevuld, leeg laten mag
            </nldd-text>
          </nldd-container>
          <nldd-spacer size="flexible"></nldd-spacer>
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </nldd-container>
        <nldd-container layout="grid" gap="16">
          {questions.map((q, i) => (
            <FieldBlock
              key={q.id}
              question={q}
              value={answers[q.id] ?? ''}
              meta={fieldMeta?.[q.id]}
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
        </nldd-container>
        {/* Alles staat al in beeld, dus er valt hier niets meer te navigeren:
            alleen de bouw-knop, rechts onderaan. */}
        {buildButton && (
          <nldd-container>
            <nldd-button-group>{buildButton}</nldd-button-group>
          </nldd-container>
        )}
      </nldd-container>
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
      <nldd-container gap="16">
        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          <nldd-icon icon="check-mark" size="20" color="accent"></nldd-icon>
          <nldd-title heading-level={3} size={6} text="Overzicht: controleer je antwoorden"></nldd-title>
          <nldd-spacer size="flexible"></nldd-spacer>
          <FieldLayoutToggle layout={layout} onChange={setLayout} />
        </nldd-container>
        <nldd-text size="sm" color="secondary">
          {hasPrefill
            ? 'We hebben deze velden alvast voor je ingevuld op basis van je prompt. Controleer en pas aan waar nodig, vooral de AI-suggesties met het oranje label "Controleren".'
            : 'Dit zijn de bouwstenen van je prompt. Klopt alles? Bouw dan de herbruikbare prompt.'}
        </nldd-text>
        <nldd-list accessible-label="Je antwoorden">
          {questions.map((q, i) => {
            const value = (answers[q.id] ?? '').trim();
            const meta = fieldMeta?.[q.id];
            return (
              <nldd-list-item key={q.id}>
                <nldd-text-cell
                  overline={markers[i]}
                  text={labelParts[i].name}
                  supporting-text={value || 'Nog niet ingevuld; blijft een plaatshouder in de prompt.'}
                ></nldd-text-cell>
                {meta && value && (
                  <nldd-cell>
                    <PrefillBadge source={meta.source} note={meta.note} />
                  </nldd-cell>
                )}
                <nldd-list-item-segment
                  button
                  accessible-label={`Bewerk: ${labelParts[i].name}`}
                  onClick={() => {
                    setReviewing(false);
                    setStep(i);
                  }}
                >
                  <nldd-icon-cell icon="pencil" size="20" color="secondary"></nldd-icon-cell>
                </nldd-list-item-segment>
              </nldd-list-item>
            );
          })}
        </nldd-list>
        <nldd-container layout="wrap" gap="12" vertical-alignment="center">
          <nldd-button appearance="neutral-transparent" start-icon="arrow-left" text="Terug naar de vragen" onClick={back}></nldd-button>
          <nldd-spacer size="flexible"></nldd-spacer>
          {buildButton}
        </nldd-container>
      </nldd-container>
    );
  }

  // --- Stapsgewijze vraagweergave ---
  return (
    <nldd-container gap="16">
      <nldd-container layout="wrap" gap="12" vertical-alignment="bottom">
        <nldd-container gap="4" width="fit-content">
          {heading}
          <nldd-text size="sm" color="secondary">
            Vraag {step + 1} van {total}, {answeredCount} ingevuld
          </nldd-text>
        </nldd-container>
        <nldd-spacer size="flexible"></nldd-spacer>
        <FieldLayoutToggle layout={layout} onChange={setLayout} />
      </nldd-container>
      {/* Voortgang: elke stap is een knop naar die vraag. */}
      <nldd-container gap="8">
        <nldd-step-bar accessible-label="Vragen">
          {questions.map((q, i) => (
            <nldd-step-bar-item
              key={q.id}
              button
              text={labelParts[i].name}
              status={
                i === step ? 'current' : (answers[q.id] ?? '').trim() ? 'past' : 'future'
              }
              onClick={() => setStep(i)}
            ></nldd-step-bar-item>
          ))}
        </nldd-step-bar>
      </nldd-container>

      {/* Huidige vraag */}
      <FieldBlock
        key={current.id}
        question={current}
        value={answers[current.id] ?? ''}
        meta={currentMeta}
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

      {/* Navigatie */}
      <nldd-container layout="wrap" gap="12" vertical-alignment="center">
        <nldd-button
          appearance="neutral-transparent"
          start-icon="arrow-left"
          text="Vorige"
          disabled={step === 0 || undefined}
          onClick={back}
        ></nldd-button>
        <nldd-spacer size="flexible"></nldd-spacer>
        <nldd-button
          appearance={isLast && onFinish && !buildButton ? 'primary' : 'secondary'}
          start-icon={isLast ? (onFinish ? 'sparkles' : 'check-mark') : undefined}
          end-icon={isLast ? undefined : 'arrow-right'}
          text={isLast ? (onFinish ? finishLabel : 'Naar overzicht') : 'Volgende'}
          onClick={next}
        ></nldd-button>
        {/* Naast "Volgende": je hoeft de rest van de vragen niet af te lopen
            om te kunnen bouwen. */}
        {buildButton}
      </nldd-container>
    </nldd-container>
  );
}
