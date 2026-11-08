import { useEffect, useRef, useState } from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import { proposeLadder } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  LADDER_LEVELS,
  emptyStepBack,
  serializeStepBack,
  type Constraint,
  type StepBackData,
} from '@/lib/stepback';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

interface StepBackBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult de concrete vraag alvast. */
  context?: string;
  /** Aangeroepen met de geserialiseerde step-back-opzet zodra die wijzigt. */
  onSerialized: (text: string) => void;
}

let constraintCounter = 0;
function newConstraint(text: string, status: Constraint['status']): Constraint {
  constraintCounter += 1;
  return { id: `c-${constraintCounter}`, text, status };
}

/**
 * Step-Back: laat de gebruiker de HOOGTE kiezen waarop wordt uitgezoomd, en
 * daarna scheiden wat vaststaat van wat alleen is aangenomen.
 *
 * Die twee keuzes zijn het verschil tussen een bruikbare stap terug en een
 * essay. Ze horen bij de gebruiker: alleen die weet of het besluit over de
 * meldplicht al in een regeerakkoord staat of alleen in een oude memo, en dat
 * bepaalt of de AI eromheen moet werken of eraan mag tornen.
 */
export default function StepBackBuilder({ settings, context, onSerialized }: StepBackBuilderProps) {
  const [data, setData] = useState<StepBackData>(() => {
    const base = emptyStepBack();
    return context?.trim() ? { ...base, concreteVraag: context.trim() } : base;
  });
  const [busy, setBusy] = useState(false);
  const [eigenVraag, setEigenVraag] = useState('');
  const vraagRef = useRef<HTMLElement & { value?: string }>(null);
  const tafelRef = useRef<HTMLElement & { value?: string }>(null);
  const kadersRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(vraagRef, data.concreteVraag, (v) => setData((d) => ({ ...d, concreteVraag: v })));
  useNlddValue(tafelRef, data.opTafel, (v) => setData((d) => ({ ...d, opTafel: v })));
  useNlddValue(kadersRef, data.kaders, (v) => setData((d) => ({ ...d, kaders: v })));

  useEffect(() => {
    onSerialized(serializeStepBack(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /** Laat de AI drie treden voorstellen en de randvoorwaarden splitsen. */
  async function runLadder() {
    if (!data.concreteVraag.trim()) {
      notify.error('Beschrijf eerst welke vraag of opdracht voorligt.');
      return;
    }
    setBusy(true);
    try {
      const res = await proposeLadder({
        concreteVraag: data.concreteVraag.trim(),
        opTafel: data.opTafel.trim() || undefined,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        notify.error(res.reason?.trim() || 'De opdracht is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.ladder?.length) {
        notify.error(res.error ?? 'De stap-terug-vragen konden niet worden gemaakt.');
        return;
      }
      setData((d) => ({
        ...d,
        ladder: res.ladder!,
        // Bestaande, handmatig gezette randvoorwaarden blijven staan; het
        // voorstel komt eronder. De gebruiker heeft het laatste woord over wat
        // vaststaat; dat is geen modelbesluit.
        randvoorwaarden: [
          ...d.randvoorwaarden,
          ...(res.vast ?? []).map((t) => newConstraint(t, 'vast')),
          ...(res.aanname ?? []).map((t) => newConstraint(t, 'aanname')),
        ],
      }));
    } finally {
      setBusy(false);
    }
  }

  function setStatus(id: string, status: Constraint['status']) {
    setData((d) => ({
      ...d,
      randvoorwaarden: d.randvoorwaarden.map((c) => (c.id === id ? { ...c, status } : c)),
    }));
  }

  function setConstraintText(id: string, text: string) {
    setData((d) => ({
      ...d,
      randvoorwaarden: d.randvoorwaarden.map((x) => (x.id === id ? { ...x, text } : x)),
    }));
  }

  function removeConstraint(id: string) {
    setData((d) => ({ ...d, randvoorwaarden: d.randvoorwaarden.filter((c) => c.id !== id) }));
  }

  return (
    <nldd-container gap="24">
      <BuilderIntro
        icon="arrow-up"
        title="Zet een stap terug"
        text="Eerst naar het vraagstuk achter je opdracht, dan terug naar je vraag. Jij bepaalt hoe ver terug."
      />

      {/* Step 1: the task as it came in. */}
      <nldd-container gap="8">
        <StepLabel text="1. Welke vraag of opdracht ligt voor?" />
        <nldd-multi-line-text-field
          ref={vraagRef}
          rows={3}
          resize="vertical"
          accessible-label="Welke vraag of opdracht ligt voor?"
          placeholder="Bijv. werk een meldplicht uit voor verhuurders van kamers"
        ></nldd-multi-line-text-field>
      </nldd-container>

      {/* Step 2: the solution that is already on the table. */}
      <nldd-container gap="8">
        <StepLabel
          text="2. Welke oplossing of richting ligt er al op tafel?"
          info="Juist dit maakt de stap terug zinvol: wat er al besloten lijkt, is vaak nooit besloten."
        />
        <nldd-multi-line-text-field
          ref={tafelRef}
          rows={2}
          resize="vertical"
          accessible-label="Welke oplossing of richting ligt er al op tafel?"
          placeholder="Bijv. het wordt een meldplicht met een boete bij niet-melden"
        ></nldd-multi-line-text-field>
        <nldd-button-group>
          <nldd-button
            appearance="secondary"
            start-icon="arrow-up"
            text={data.ladder.length > 0 ? 'Opnieuw voorstellen' : 'Stel stap-terug-vragen voor'}
            loading={busy || undefined}
            loading-text="Vragen opstellen…"
            disabled={busy || !data.concreteVraag.trim() || undefined}
            onClick={() => void runLadder()}
          ></nldd-button>
        </nldd-button-group>
      </nldd-container>

      {/* Step 3: the ladder. This is the mechanism of the technique. */}
      {data.ladder.length > 0 && (
        <nldd-container gap="8">
          <StepLabel
            text="3. Hoe ver zet je de stap terug?"
            info="Eén trede omhoog levert een bruikbaar antwoord op. Drie treden omhoog levert een essay op. Kies de hoogte waarop het antwoord nog over jouw dossier gaat."
          />
          <nldd-list type="radiogroup" appearance="box-base" accessible-label="Hoe ver zet je de stap terug?">
            {data.ladder.map((rung) => {
              const meta = LADDER_LEVELS.find((l) => l.niveau === rung.niveau);
              return (
                <RungRow
                  key={`${rung.niveau}-${rung.vraag}`}
                  checked={data.gekozenVraag === rung.vraag}
                  overline={`${rung.niveau}. ${meta?.label ?? `Niveau ${rung.niveau}`}`}
                  text={rung.vraag}
                  supporting={rung.winst || undefined}
                  onPick={() => setData((d) => ({ ...d, gekozenVraag: rung.vraag, gekozenNiveau: rung.niveau }))}
                />
              );
            })}
          </nldd-list>

          {/* Writing your own is always allowed: the ladder is a proposal, not a menu. */}
          <nldd-spacer size="8"></nldd-spacer>
          <StepLabel text="Of schrijf je eigen stap-terug-vraag" />
          <nldd-container layout="row" gap="8" vertical-alignment="center">
            <EigenVraagField value={eigenVraag} onValue={setEigenVraag} />
            <nldd-button
              appearance="secondary"
              text="Gebruik deze"
              disabled={!eigenVraag.trim() || undefined}
              onClick={() => setData((d) => ({ ...d, gekozenVraag: eigenVraag.trim(), gekozenNiveau: 0 }))}
            ></nldd-button>
          </nldd-container>
          {data.gekozenVraag && data.gekozenNiveau === 0 && (
            <nldd-text size="sm" color="accent">
              Gekozen: {data.gekozenVraag}
            </nldd-text>
          )}
        </nldd-container>
      )}

      {/* Step 4: fixed versus assumed. Without this distinction zooming out
          becomes disobedient or toothless. */}
      {data.randvoorwaarden.length > 0 && (
        <nldd-container gap="8">
          <StepLabel
            text="4. Wat staat vast, en wat is alleen aangenomen?"
            info="Vaststaand = ergens besloten; daar tornt de AI niet aan. Aanname = nooit besloten, alleen overgenomen; daar gaat de stap terug juist over. Klik om te wisselen."
          />
          {data.randvoorwaarden.map((c) => (
            <ConstraintRow
              key={c.id}
              constraint={c}
              onToggle={() => setStatus(c.id, c.status === 'vast' ? 'aanname' : 'vast')}
              onText={(text) => setConstraintText(c.id, text)}
              onRemove={() => removeConstraint(c.id)}
            />
          ))}
          <nldd-button-group>
            <nldd-button
              appearance="accent-transparent"
              size="sm"
              start-icon="plus"
              text="Zelf toevoegen"
              onClick={() =>
                setData((d) => ({
                  ...d,
                  randvoorwaarden: [...d.randvoorwaarden, newConstraint('', 'vast')],
                }))
              }
            ></nldd-button>
          </nldd-button-group>
        </nldd-container>
      )}

      {/* Step 5: frameworks at the more general level. */}
      <nldd-container gap="8">
        <StepLabel
          text={`${data.ladder.length > 0 ? '5.' : '3.'} Welke kaders gelden hier hoe dan ook? (optioneel)`}
          info="Deze gelden ook op het algemenere niveau; ze houden het antwoord binnen de werkelijkheid."
        />
        <nldd-text-field
          ref={kadersRef}
          accessible-label="Welke kaders gelden hier hoe dan ook?"
          placeholder="Bijv. uitvoerbaarheid bij gemeenten, regeldruk, bestaande wetgeving"
        ></nldd-text-field>
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

/** One rung of the ladder: a radio row. */
function RungRow({
  checked,
  overline,
  text,
  supporting,
  onPick,
}: {
  checked: boolean;
  overline: string;
  text: string;
  supporting?: string;
  onPick: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => {
    if (e.detail?.checked) onPick();
  });
  return (
    <nldd-list-item ref={ref} radio checked={checked || undefined}>
      <nldd-cell>
        <nldd-radio-button decorative checked={checked || undefined}></nldd-radio-button>
      </nldd-cell>
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-text-cell overline={overline} text={text} supporting-text={supporting}></nldd-text-cell>
    </nldd-list-item>
  );
}

/**
 * One boundary condition: its status (fixed or assumed), its text and a delete
 * button. Always an input field, also for a line the AI proposed: the wording
 * of what is fixed has to be exact.
 */
function ConstraintRow({
  constraint,
  onToggle,
  onText,
  onRemove,
}: {
  constraint: Constraint;
  onToggle: () => void;
  onText: (text: string) => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, constraint.text, onText);
  const vast = constraint.status === 'vast';
  return (
    <nldd-container layout="row" gap="8" vertical-alignment="center">
      <nldd-tooltip
        text={vast ? 'Staat vast; klik om als aanname te markeren' : 'Aanname; klik om als vaststaand te markeren'}
      >
        <nldd-button
          appearance={vast ? 'neutral-tinted' : 'accent-filled'}
          start-icon={vast ? 'lock-closed' : 'lock-open'}
          text={vast ? 'Staat vast' : 'Aanname'}
          onClick={onToggle}
        ></nldd-button>
      </nldd-tooltip>
      <nldd-text-field
        ref={ref}
        accessible-label={vast ? 'Wat staat vast' : 'Aanname'}
        placeholder="Bijv. de invoering moet binnen deze kabinetsperiode"
      ></nldd-text-field>
      <nldd-icon-button
        appearance="neutral-transparent"
        size="sm"
        icon="trash"
        accessible-label={`Verwijder: ${constraint.text.trim() || 'lege regel'}`}
        onClick={onRemove}
      ></nldd-icon-button>
    </nldd-container>
  );
}

/** The field for an own step-back question; it mounts with the ladder, so its binding does too. */
function EigenVraagField({ value, onValue }: { value: string; onValue: (v: string) => void }) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-text-field
      ref={ref}
      placeholder="Bijv. hoe krijgen we verhuurders zover dat ze zich aan de regels houden?"
    ></nldd-text-field>
  );
}
