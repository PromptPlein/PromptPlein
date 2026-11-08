import { useEffect, useRef, useState } from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import { scanClaims } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  SOURCE_REGIMES,
  UNVERIFIABLE_RULES,
  emptyVerification,
  serializeVerification,
  type SourceRegime,
  type UnverifiableRule,
  type VerificationData,
} from '@/lib/verification';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';
import '@nldd/design-system/button';
import '@nldd/design-system/cell';
import '@nldd/design-system/checkbox';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/radio-button';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/text-field';
import '@nldd/design-system/tooltip';

interface VerificationBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult het te controleren stuk alvast. */
  context?: string;
  /** Aangeroepen met de geserialiseerde controle-opzet zodra die wijzigt. */
  onSerialized: (text: string) => void;
}

/**
 * Chain-of-Verification: bouwt de controle-opzet, niet de controle zelf.
 *
 * De volgorde van dit scherm is de techniek: eerst het concept, dan zien wát
 * erin staat dat fout kán zijn (de scan), dan pas kiezen waartegen dat
 * gecontroleerd wordt. Wie meteen "controleer op feiten" invult, krijgt een AI
 * die zijn eigen tekst herleest en goedkeurt, precies de fout die deze techniek
 * moet afvangen.
 */
export default function VerificationBuilder({
  settings,
  context,
  onSerialized,
}: VerificationBuilderProps) {
  const [data, setData] = useState<VerificationData>(() => {
    const base = emptyVerification();
    return context?.trim() ? { ...base, teControleren: context.trim() } : base;
  });
  const [scanning, setScanning] = useState(false);
  const tekstRef = useRef<HTMLElement & { value?: string }>(null);
  const bronnenRef = useRef<HTMLElement & { value?: string }>(null);
  const risicoRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(tekstRef, data.teControleren, (v) => setData((d) => ({ ...d, teControleren: v })));
  useNlddValue(bronnenRef, data.bronnen, (v) => setData((d) => ({ ...d, bronnen: v })));
  useNlddValue(risicoRef, data.duursteFout, (v) => setData((d) => ({ ...d, duursteFout: v })));

  useEffect(() => {
    onSerialized(serializeVerification(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const aangevinkt = data.claims.filter((c) => c.checked).length;
  const kanScannen = data.teControleren.trim().length >= 80;

  /** Laat de AI het concept aflopen en melden welke soorten beweringen er staan. */
  async function runScan() {
    setScanning(true);
    try {
      const res = await scanClaims({
        tekst: data.teControleren.trim(),
        soorten: data.claims.map((c) => ({ id: c.id, label: c.label })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success) {
        notify.error(res.error ?? 'De scan is niet gelukt. Vink zelf aan wat gecontroleerd moet worden.');
        return;
      }
      const gevonden = new Map((res.gevonden ?? []).map((g) => [g.id, g.voorbeeld]));
      if (gevonden.size === 0) {
        notify('Geen controleerbare beweringen herkend. Vink zelf aan wat er wél in staat.');
      }
      setData((d) => ({
        ...d,
        gescand: true,
        // Een gevonden soort wordt aangevinkt; een zelf aangevinkte soort blijft
        // staan, ook als de scan hem niet zag. De gebruiker weet meer van het
        // dossier dan het model.
        claims: d.claims.map((c) =>
          gevonden.has(c.id)
            ? { ...c, checked: true, voorbeeld: gevonden.get(c.id) || undefined }
            : c,
        ),
        duursteFout: d.duursteFout.trim() || (res.duursteFout ?? ''),
      }));
    } finally {
      setScanning(false);
    }
  }

  return (
    <nldd-container gap="24">
      <BuilderIntro
        icon="shield-check-mark"
        title="Laat de AI zichzelf controleren"
        text="Eerst de beweringen eruit, dan per bewering één vraag. Die vragen worden los van het concept beantwoord."
      />

      {/* Step 1: the draft. */}
      <nldd-container gap="8">
        <StepLabel
          text="1. Welke tekst moet gecontroleerd worden?"
          info="Plak het concept hier. Heb je het nog niet, beschrijf dan om wat voor stuk het gaat; de prompt krijgt dan een plaatshouder waar je het later inplakt."
        />
        <nldd-multi-line-text-field
          ref={tekstRef}
          rows={5}
          resize="vertical"
          accessible-label="Welke tekst moet gecontroleerd worden?"
          placeholder="Bijv. de conceptbrief aan de Tweede Kamer over de wijziging van de subsidieregeling…"
        ></nldd-multi-line-text-field>
        <nldd-container layout="wrap" gap="12" vertical-alignment="center">
          <nldd-tooltip
            text={
              kanScannen
                ? 'Laat de AI aflopen welke soorten controleerbare beweringen erin staan'
                : 'Plak eerst een stuk tekst (minimaal een alinea)'
            }
          >
            <nldd-button
              appearance="secondary"
              start-icon="scan"
              text="Scan op controleerbare beweringen"
              loading={scanning || undefined}
              loading-text="Scannen…"
              disabled={scanning || !kanScannen || undefined}
              onClick={() => void runScan()}
            ></nldd-button>
          </nldd-tooltip>
          {!kanScannen && (
            <nldd-text size="sm" color="secondary">
              Plak minstens een alinea om te kunnen scannen.
            </nldd-text>
          )}
        </nldd-container>
      </nldd-container>

      {/* Step 2: which kinds of claims count. */}
      <nldd-container gap="8">
        <StepLabel
          text="2. Wat moet er gecontroleerd worden?"
          info={
            data.gescand
              ? 'De AI heeft aangevinkt wat hij in je tekst tegenkwam. Vink bij of af; jij kent het dossier.'
              : 'Vink aan welke soorten beweringen in dit stuk fout kunnen gaan. Zonder deze lijst controleert de AI wat hem toevallig opvalt.'
          }
        />
        <nldd-list appearance="box-base" accessible-label="Wat moet er gecontroleerd worden?">
          {data.claims.map((c) => (
            <ChoiceRow
              key={c.id}
              kind="checkbox"
              checked={c.checked}
              text={c.label}
              supporting={c.voorbeeld ? `${c.hint} Gezien: ${c.voorbeeld}` : c.hint}
              onChecked={(checked) =>
                setData((d) => ({
                  ...d,
                  claims: d.claims.map((x) => (x.id === c.id ? { ...x, checked } : x)),
                }))
              }
            />
          ))}
        </nldd-list>
        {aangevinkt === 0 && (
          <nldd-container layout="row" gap="6" vertical-alignment="center">
            <nldd-icon icon="exclamation-triangle" size="16" color="warning"></nldd-icon>
            <nldd-text size="sm" color="warning">
              Zonder aangevinkte soorten wordt de controle een algemene leesbeurt.
            </nldd-text>
          </nldd-container>
        )}
      </nldd-container>

      {/* Step 3: the source boundary: against what may "correct" be measured? */}
      <nldd-container gap="8">
        <StepLabel
          text="3. Waartegen mag geverifieerd worden?"
          info={'Dit is de scherpste knop. Zonder afbakening betekent "klopt" alleen dat het model het herkent, en dat is precies de fout die je zocht.'}
        />
        <nldd-list type="radiogroup" appearance="box-base" accessible-label="Waartegen mag geverifieerd worden?">
          {SOURCE_REGIMES.map((r) => (
            <ChoiceRow
              key={r.value}
              kind="radio"
              checked={data.regime === r.value}
              text={r.label}
              supporting={r.hint}
              onChecked={(checked) => {
                if (checked) setData((d) => ({ ...d, regime: r.value as SourceRegime }));
              }}
            />
          ))}
        </nldd-list>
        <nldd-text-field
          ref={bronnenRef}
          accessible-label="Bronnen"
          placeholder="Noem de bronnen concreet, bijv. de vier bijlagen en de nota van 3 juli"
        ></nldd-text-field>
      </nldd-container>

      {/* Step 4: what happens to claims that cannot be verified. */}
      <nldd-container gap="8">
        <StepLabel
          text="4. En als iets niet te verifiëren blijkt?"
          info={'Wat je hier kiest geldt in de tekst. Onverifieerbare beweringen komen daarnaast altijd op de lijst "nog te verifiëren door een mens".'}
        />
        <nldd-list type="radiogroup" appearance="box-base" accessible-label="En als iets niet te verifiëren blijkt?">
          {UNVERIFIABLE_RULES.map((r) => (
            <ChoiceRow
              key={r.value}
              kind="radio"
              checked={data.onverifieerbaar === r.value}
              text={r.label}
              supporting={r.hint}
              onChecked={(checked) => {
                if (checked) setData((d) => ({ ...d, onverifieerbaar: r.value as UnverifiableRule }));
              }}
            />
          ))}
        </nldd-list>
      </nldd-container>

      {/* Step 5: priority. */}
      <nldd-container gap="8">
        <StepLabel
          text="5. Welke fout is hier het duurst? (optioneel)"
          info="Bepaalt welke beweringen als eerste worden nagetrokken."
        />
        <nldd-text-field
          ref={risicoRef}
          accessible-label="Welke fout is hier het duurst?"
          placeholder="Bijv. een toezegging die de bewindspersoon nooit heeft gedaan"
        ></nldd-text-field>
      </nldd-container>
    </nldd-container>
  );
}

/** The question above a step, with its explanation behind the info dot. */
function StepLabel({ text, info }: { text: string; info: string }) {
  return (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-text weight="bold">{text}</nldd-text>
      <InfoDot label="Uitleg bij dit veld" text={info} />
    </nldd-container>
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
