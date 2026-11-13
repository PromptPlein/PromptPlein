import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import { TECHNIEK_DOELEN, techniekKaart, type DoelTegel, type TechniekDoel } from '@/lib/techniekDoelen';
import type { Technique } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/popover';
import '@nldd/design-system/segmented-control';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

/**
 * Kiezen op doel: eerst wat je wilt bereiken, dan de frameworks en technieken die
 * daarbij passen. De doelen zijn tabbladen; wat niet op de rij past, zet de
 * tabbalk zelf achter "Meer tabs".
 */
export default function TechniqueChooser({
  selectedId,
  onSelect,
  help,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Shown right under the goals, for someone who cannot choose. */
  help?: ReactNode;
}) {
  const { techniques } = useReferenceData();

  const perDoel = useMemo(() => {
    const groepen = new Map<TechniekDoel, Technique[]>();
    for (const t of techniques) {
      const { doel } = techniekKaart(t);
      groepen.set(doel, [...(groepen.get(doel) ?? []), t]);
    }
    // Frameworks eerst: die zetten de hele prompt neer, de technieken sturen bij.
    for (const lijst of groepen.values()) {
      lijst.sort((a, b) => Number(isContextPrompt(b)) - Number(isContextPrompt(a)));
    }
    return groepen;
  }, [techniques]);

  // Een doel zonder techniek (kan in de lokale modus) krijgt geen tegel.
  const doelen = TECHNIEK_DOELEN.filter((d) => perDoel.has(d.id));

  const gekozen = techniques.find((t) => t.id === selectedId);
  const [keuze, setKeuze] = useState<TechniekDoel | null>(
    gekozen ? techniekKaart(gekozen).doel : null,
  );
  const actief = doelen.find((d) => d.id === keuze) ?? doelen[0];
  if (!actief) return null;

  const lijst = perDoel.get(actief.id) ?? [];

  return (
    <nldd-container gap="24">
      <nldd-container gap="8">
        <DoelTabs doelen={doelen} actief={actief.id} onKies={setKeuze} />
        {help}
      </nldd-container>

      <nldd-container gap="8">
        <nldd-title
          heading-level={2}
          size={4}
          text={actief.naam}
          supporting-text={`${actief.zin}: ${lijst.length} ${lijst.length === 1 ? 'keuze' : 'keuzes'}. Een framework bouwt je hele prompt op, een techniek stuurt hoe de AI werkt.`}
        ></nldd-title>
        {/* Zoals op main: elke keuze een eigen kaart, twee naast elkaar. */}
        <nldd-container layout="grid" column-count={2} sm-column-count={1} gap="12">
          {lijst.map((t) => (
            <TechniqueCard
              key={t.id}
              technique={t}
              active={t.id === selectedId}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </nldd-container>
        {/* Buiten de kaarten: één plek voor alle uitlegvensters. */}
        {lijst.map((t) => {
          const info = techniekKaart(t).info;
          return info ? (
            <nldd-popover key={t.id} id={uitlegId(t)} accessible-label={`Uitleg over ${t.name}`} role="region">
              <nldd-container padding="12">
                <nldd-text size="sm">{info}</nldd-text>
              </nldd-container>
            </nldd-popover>
          ) : null;
        })}
      </nldd-container>
    </nldd-container>
  );
}

/**
 * De doelen als één balk over de volle breedte, icoon boven de naam. Een
 * segmented control en geen tabbalk: die laatste kan niet rekken.
 */
function DoelTabs({
  doelen,
  actief,
  onKies,
}: {
  doelen: DoelTegel[];
  actief: TechniekDoel;
  onKies: (doel: TechniekDoel) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value?: string }>>(ref, 'change', (e) => {
    const doel = doelen.find((d) => d.id === e.detail?.value);
    if (doel) onKies(doel.id);
  });
  return (
    <nldd-segmented-control
      ref={ref}
      width="full"
      size="lg"
      variant="icon-and-text"
      appearance="neutral-base"
      value={actief}
      accessible-label="Kies je doel"
    >
      {doelen.map((d) => (
        <nldd-segmented-control-item key={d.id} value={d.id} text={d.naam} icon={d.icon}></nldd-segmented-control-item>
      ))}
    </nldd-segmented-control>
  );
}

const uitlegId = (t: Technique) => `techniek-uitleg-${t.id}`;

function TechniqueCard({
  technique: t,
  active,
  onSelect,
}: {
  technique: Technique;
  active: boolean;
  onSelect: () => void;
}) {
  const kaart = techniekKaart(t);
  const framework = isContextPrompt(t);

  // De kaart zelf is geen knop: de uitleg is een knop van zichzelf, en een knop in
  // een knop slaat een schermlezer over. Kies is daarom een eigen knop op de kaart.
  return (
    <nldd-card background={active ? 'accent-tinted' : undefined}>
      <nldd-container padding="16" layout="row" gap="12" vertical-alignment="center">
        <nldd-container width="40px" min-width="40px">
          <nldd-icon icon={kaart.icon} size="40" color={framework ? 'lintblauw' : 'lichtblauw'} box></nldd-icon>
        </nldd-container>
        <nldd-container gap="2" width="100%">
          <nldd-text size="md" weight="bold">
            {t.name}
          </nldd-text>
          {kaart.kort && <nldd-text size="sm">{kaart.kort}</nldd-text>}
          <nldd-text size="xs" color="secondary">
            {framework ? 'Framework' : 'Techniek'}
          </nldd-text>
        </nldd-container>
        <nldd-container horizontal-alignment="right" gap="4">
          {kaart.info && (
            <nldd-icon-button
              appearance="neutral-transparent"
              size="sm"
              icon="info-circle"
              popovertarget={uitlegId(t)}
              accessible-label={`Uitleg over ${t.name}`}
            ></nldd-icon-button>
          )}
          <nldd-button
            appearance={active ? 'primary' : 'neutral-transparent'}
            size="sm"
            start-icon={active ? 'check-mark' : undefined}
            end-icon={active ? undefined : 'arrow-right'}
            text={active ? 'Gekozen' : 'Kies'}
            accessible-label={`${active ? 'Gekozen' : 'Kies'} ${t.name}`}
            onClick={onSelect}
          ></nldd-button>
        </nldd-container>
      </nldd-container>
    </nldd-card>
  );
}
