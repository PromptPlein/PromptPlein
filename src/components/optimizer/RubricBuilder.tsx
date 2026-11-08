import { useEffect, useRef, useState } from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import { proposeRubric } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  CRITERION_WEIGHTS,
  RUBRIC_SCALES,
  criteriaZonderNiveaus,
  emptyCriterion,
  emptyRubric,
  newCriterionId,
  scaleLevels,
  serializeRubric,
  type CriterionWeight,
  type RubricCriterion,
  type RubricData,
  type RubricScale,
} from '@/lib/rubric';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

interface RubricBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult "wat wordt beoordeeld" alvast. */
  context?: string;
  /** Aangeroepen met het geserialiseerde toetsingskader zodra dat wijzigt. */
  onSerialized: (text: string) => void;
}

/**
 * Rubric-toetsing: bouwt het toetsingskader, met de niveaubeschrijvingen als
 * hoofdzaak.
 *
 * Criteria opsommen is het makkelijke deel en levert nog geen navolgbaar
 * oordeel op: "uitvoerbaarheid: 3" is niet reproduceerbaar en niet aanvechtbaar.
 * Pas als vóór het beoordelen vastligt wanneer iets een 3 is en wanneer een 4,
 * komen twee beoordelaars op hetzelfde uit. Dit scherm maakt dat werk zichtbaar
 * (en laat de AI het voorwerk doen), in plaats van het stil over te slaan.
 */
export default function RubricBuilder({ settings, context, onSerialized }: RubricBuilderProps) {
  const [data, setData] = useState<RubricData>(() => {
    const base = emptyRubric();
    return context?.trim() ? { ...base, teBeoordelen: context.trim() } : base;
  });
  const [busy, setBusy] = useState<'criteria' | 'niveaus' | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onSerialized(serializeRubric(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const levels = scaleLevels(data.schaal);
  const gevuldeCriteria = data.criteria.filter((c) => c.naam.trim());
  const zonderNiveaus = criteriaZonderNiveaus(data);

  /** Laat de AI criteria voorstellen bij dit soort stuk. */
  async function suggestCriteria() {
    if (!data.teBeoordelen.trim()) {
      notify.error('Beschrijf eerst wat je beoordeelt.');
      return;
    }
    setBusy('criteria');
    try {
      const res = await proposeRubric({
        doel: 'criteria',
        teBeoordelen: data.teBeoordelen.trim(),
        gebruiksdoel: data.doel.trim() || undefined,
        niveaus: levels,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        notify.error(res.reason?.trim() || 'De omschrijving is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.criteria?.length) {
        notify.error(res.error ?? 'Er konden geen criteria worden voorgesteld.');
        return;
      }
      setData((d) => ({
        ...d,
        // Zelf ingevulde criteria blijven staan; het voorstel komt eronder.
        criteria: [
          ...d.criteria.filter((c) => c.naam.trim()),
          ...res.criteria!.map((c) => ({
            id: newCriterionId(),
            naam: c.naam,
            betekenis: c.betekenis,
            weging: 'normaal' as CriterionWeight,
            niveaus: c.niveaus,
          })),
        ],
      }));
    } finally {
      setBusy(null);
    }
  }

  /** Schrijf per criterium een beschrijving per schaalpunt; de kern van de rubric. */
  async function fillLevels() {
    if (gevuldeCriteria.length === 0) {
      notify.error('Voeg eerst minstens één criterium toe.');
      return;
    }
    setBusy('niveaus');
    try {
      const res = await proposeRubric({
        doel: 'niveaus',
        teBeoordelen: data.teBeoordelen.trim() || 'een beleidsstuk',
        gebruiksdoel: data.doel.trim() || undefined,
        niveaus: levels,
        criteria: gevuldeCriteria.map((c) => ({ naam: c.naam.trim(), betekenis: c.betekenis.trim() })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success || !res.criteria?.length) {
        notify.error(res.error ?? 'De niveaubeschrijvingen konden niet worden gemaakt.');
        return;
      }
      // Match op naam: de AI krijgt de criteria in dezelfde volgorde terug,
      // maar op naam matchen is bestand tegen een overgeslagen criterium.
      const byName = new Map(res.criteria.map((c) => [c.naam.trim().toLowerCase(), c.niveaus]));
      setData((d) => ({
        ...d,
        criteria: d.criteria.map((c) => {
          const voorstel = byName.get(c.naam.trim().toLowerCase());
          if (!voorstel) return c;
          // Zelf geschreven beschrijvingen blijven staan.
          const niveaus = { ...voorstel, ...Object.fromEntries(
            Object.entries(c.niveaus).filter(([, v]) => v?.trim()),
          ) };
          return { ...c, niveaus };
        }),
      }));
      setOpen(Object.fromEntries(gevuldeCriteria.map((c) => [c.id, true])));
    } finally {
      setBusy(null);
    }
  }

  function updateCriterion(id: string, patch: Partial<RubricCriterion>) {
    setData((d) => ({
      ...d,
      criteria: d.criteria.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }

  return (
    <nldd-container gap="24">
      <BuilderIntro
        icon="slider-horizontal-3"
        title="Bouw je toetsingskader"
        text="Leg vooraf vast wanneer iets voldoet. Dan is het oordeel navolgbaar."
      />

      {/* Steps 1 and 2: what, and what for. */}
      <nldd-container layout="grid" gap="16" sm-column-count={1} md-column-count={2} lg-column-count={2}>
        <nldd-container gap="8">
          <StepLabel text="1. Wat beoordeel je?" />
          <TextInput
            value={data.teBeoordelen}
            onValue={(v) => setData((d) => ({ ...d, teBeoordelen: v }))}
            label="Wat beoordeel je?"
            placeholder="Bijv. vier subsidieaanvragen voor het innovatiefonds"
          />
        </nldd-container>
        <nldd-container gap="8">
          <StepLabel text="2. Waar dient het oordeel voor?" />
          <TextInput
            value={data.doel}
            onValue={(v) => setData((d) => ({ ...d, doel: v }))}
            label="Waar dient het oordeel voor?"
            placeholder="Bijv. een toekenningsbesluit dat bezwaar moet doorstaan"
          />
        </nldd-container>
      </nldd-container>

      {/* Step 3: the scale. A new scale drops the descriptions. */}
      <nldd-container gap="8">
        <StepLabel text="3. Op welke schaal scoor je?" />
        <nldd-list type="radiogroup" appearance="box-base" accessible-label="Op welke schaal scoor je?">
          {RUBRIC_SCALES.map((sc) => (
            <ChoiceRow
              key={sc.value}
              kind="radio"
              checked={data.schaal === sc.value}
              text={sc.label}
              supporting={sc.hint}
              onChecked={(checked) => {
                if (!checked) return;
                setData((d) => ({
                  ...d,
                  schaal: sc.value as RubricScale,
                  // The descriptions belong to the old scale points and no longer
                  // fit after a switch.
                  criteria: d.criteria.map((c) => ({ ...c, niveaus: {} })),
                }));
              }}
            />
          ))}
        </nldd-list>
      </nldd-container>

      {/* Step 4: the criteria with their level descriptions. */}
      <nldd-container gap="8">
        <StepLabel
          text="4. Welke criteria staan in het kader?"
          info="Vul per criterium in wat het meet, en klap het open om per schaalpunt vast te leggen wanneer het die score krijgt."
        />

        {data.criteria.map((c, i) => (
          <CriterionCard
            key={c.id}
            index={i}
            criterion={c}
            levels={levels}
            open={open[c.id] ?? false}
            onToggle={() => setOpen((o) => ({ ...o, [c.id]: !(o[c.id] ?? false) }))}
            onChange={(patch) => updateCriterion(c.id, patch)}
            onRemove={() =>
              setData((d) => ({
                ...d,
                criteria: d.criteria.length > 1 ? d.criteria.filter((x) => x.id !== c.id) : [emptyCriterion()],
              }))
            }
          />
        ))}

        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          <nldd-button
            appearance="accent-transparent"
            start-icon="plus"
            text="Criterium toevoegen"
            onClick={() => setData((d) => ({ ...d, criteria: [...d.criteria, emptyCriterion()] }))}
          ></nldd-button>
          <nldd-button
            appearance="secondary"
            start-icon="sparkles"
            text="Stel criteria voor"
            loading={busy === 'criteria' || undefined}
            disabled={busy !== null || !data.teBeoordelen.trim() || undefined}
            onClick={() => void suggestCriteria()}
          ></nldd-button>
          <nldd-tooltip text="Laat de AI per criterium beschrijven wanneer welke score geldt">
            <nldd-button
              appearance="secondary"
              start-icon="slider-horizontal-3"
              text="Schrijf de niveaubeschrijvingen"
              loading={busy === 'niveaus' || undefined}
              disabled={busy !== null || gevuldeCriteria.length === 0 || undefined}
              onClick={() => void fillLevels()}
            ></nldd-button>
          </nldd-tooltip>
        </nldd-container>

        {gevuldeCriteria.length > 0 && zonderNiveaus.length > 0 && (
          <nldd-container layout="row" gap="6">
            <nldd-icon icon="exclamation-triangle" size="16" color="warning"></nldd-icon>
            <nldd-text size="sm" color="warning">
              {zonderNiveaus.length === 1
                ? `"${zonderNiveaus[0].naam.trim()}" heeft nog geen niveaubeschrijving.`
                : `${zonderNiveaus.length} criteria hebben nog geen niveaubeschrijving.`}{' '}
              Zonder die beschrijving is de score een gevoel, en komen twee beoordelaars niet op
              hetzelfde uit.
            </nldd-text>
          </nldd-container>
        )}
      </nldd-container>

      {/* Step 5: threshold and evidence rule. */}
      <nldd-container gap="12">
        <nldd-container gap="8">
          <StepLabel
            text="5. Wanneer is het geheel voldoende?"
            info="Leg dit vóór het beoordelen vast, anders wordt het eindoordeel achteraf naar het gevoel toe gerekend."
          />
          <TextInput
            value={data.drempel}
            onValue={(v) => setData((d) => ({ ...d, drempel: v }))}
            label="Wanneer is het geheel voldoende?"
            placeholder="Bijv. geen enkel criterium op 'voldoet niet' en minstens drie op 'voldoet'"
          />
        </nldd-container>
        <nldd-list appearance="box-base" accessible-label="Bewijsregel">
          <ChoiceRow
            kind="checkbox"
            checked={data.bewijsverplicht}
            text="Elke score onderbouwen met een letterlijke passage"
            supporting={'Dwingt de AI om te wijzen in plaats van te vinden. Staat er niets over in het stuk, dan volgt "niet te beoordelen" in plaats van een gok.'}
            onChecked={(checked) => setData((d) => ({ ...d, bewijsverplicht: checked }))}
          />
        </nldd-list>
      </nldd-container>
    </nldd-container>
  );
}

/** The question above a step, with its explanation behind the info dot. */
function StepLabel({ text, info }: { text: string; info?: string }) {
  return (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-text weight="bold">{text}</nldd-text>
      {info && <InfoDot label="Uitleg bij dit veld" text={info} />}
    </nldd-container>
  );
}

/** A text field bound to state; `label` names it when there is no form field around it. */
function TextInput({
  value,
  onValue,
  placeholder,
  label,
}: {
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return <nldd-text-field ref={ref} accessible-label={label} placeholder={placeholder}></nldd-text-field>;
}

/** One criterion: name, meaning, weight, and the level descriptions behind a disclosure. */
function CriterionCard({
  index,
  criterion: c,
  levels,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  index: number;
  criterion: RubricCriterion;
  levels: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<RubricCriterion>) => void;
  onRemove: () => void;
}) {
  const weightRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean; value: string }>>(weightRef, 'change', (e) => {
    if (e.detail?.checked && e.detail.value) onChange({ weging: e.detail.value as CriterionWeight });
  });
  const heeftNiveaus = Object.values(c.niveaus).some((v) => v?.trim());
  const weight = CRITERION_WEIGHTS.find((w) => w.value === c.weging);

  return (
    <nldd-box>
      <nldd-container padding="16" gap="12">
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-title heading-level={3} size={6} text={c.naam.trim() || `Criterium ${index + 1}`}></nldd-title>
          <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon="trash"
            accessible-label={`Criterium ${index + 1} verwijderen`}
            onClick={onRemove}
          ></nldd-icon-button>
        </nldd-container>
        <nldd-form-field label="Naam">
          <TextInput value={c.naam} onValue={(v) => onChange({ naam: v })} placeholder="Bijv. uitvoerbaarheid" />
        </nldd-form-field>
        <nldd-form-field label="Wat meet het precies?">
          <TextInput
            value={c.betekenis}
            onValue={(v) => onChange({ betekenis: v })}
            placeholder="Bijv. kan de uitvoerder dit met de huidige capaciteit aan?"
          />
        </nldd-form-field>
        <nldd-form-field label="Weging">
          <nldd-radio-button-group ref={weightRef} name={`weging-${c.id}`}>
            {CRITERION_WEIGHTS.map((w) => (
              <nldd-radio-button-field
                key={w.value}
                value={w.value}
                label={w.label}
                checked={c.weging === w.value || undefined}
              ></nldd-radio-button-field>
            ))}
          </nldd-radio-button-group>
          {weight?.hint && <nldd-form-field-help-text>{weight.hint}</nldd-form-field-help-text>}
        </nldd-form-field>

        {/* The level descriptions. */}
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-button
            appearance="accent-transparent"
            size="sm"
            start-icon={open ? 'chevron-down' : 'chevron-right'}
            text="Niveaubeschrijvingen"
            onClick={onToggle}
          ></nldd-button>
          <nldd-badge size="sm" color={heeftNiveaus ? 'success' : 'warning'} text={heeftNiveaus ? 'ingevuld' : 'nog leeg'}></nldd-badge>
        </nldd-container>
        {open && (
          <nldd-box background="base">
            <nldd-container padding="16" gap="12">
              {levels.map((level) => (
                <nldd-container key={level} gap="4">
                  <nldd-text size="sm" weight="bold">
                    {level}
                  </nldd-text>
                  <TextInput
                    value={c.niveaus[level] ?? ''}
                    onValue={(v) => onChange({ niveaus: { ...c.niveaus, [level]: v } })}
                    label={`${c.naam.trim() || `Criterium ${index + 1}`}: ${level}`}
                    placeholder={`Wanneer krijgt het "${level}"?`}
                  />
                </nldd-container>
              ))}
            </nldd-container>
          </nldd-box>
        )}
      </nldd-container>
    </nldd-box>
  );
}

/** A list row that is one checkbox or one radio, with its label and hint. */
function ChoiceRow({
  kind,
  checked,
  text,
  supporting,
  onChecked,
}: {
  kind: 'checkbox' | 'radio';
  checked: boolean;
  text: string;
  supporting?: string;
  onChecked: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => onChecked(Boolean(e.detail?.checked)));
  return (
    <nldd-list-item
      ref={ref}
      checkbox={kind === 'checkbox' || undefined}
      radio={kind === 'radio' || undefined}
      checked={checked || undefined}
    >
      <nldd-cell>
        {kind === 'checkbox' ? (
          <nldd-checkbox decorative checked={checked || undefined}></nldd-checkbox>
        ) : (
          <nldd-radio-button decorative checked={checked || undefined}></nldd-radio-button>
        )}
      </nldd-cell>
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-text-cell text={text} supporting-text={supporting}></nldd-text-cell>
    </nldd-list-item>
  );
}
