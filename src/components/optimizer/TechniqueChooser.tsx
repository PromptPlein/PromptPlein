import { useMemo, useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import { TECHNIEK_DOELEN, techniekKaart, type DoelTegel, type TechniekDoel } from '@/lib/techniekDoelen';
import type { Technique } from '@/types';

/**
 * Kiezen op doel: eerst wat je wilt bereiken, dan de frameworks en technieken die
 * daarbij passen. De doelen zijn tabbladen; wat niet op de rij past, zet de
 * tabbalk zelf achter "Meer tabs".
 */
export default function TechniqueChooser({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
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
      <DoelTabs doelen={doelen} actief={actief.id} onKies={setKeuze} />

      <nldd-container gap="8">
        <nldd-title
          heading-level={2}
          size={4}
          text={`${actief.naam}: ${lijst.length} ${lijst.length === 1 ? 'keuze' : 'keuzes'}`}
          supporting-text={`${actief.zin}. Een framework bouwt je hele prompt op, een techniek stuurt hoe de AI werkt.`}
        ></nldd-title>
        <nldd-list appearance="box-tinted" accessible-label={`Keuzes bij ${actief.naam}`}>
          {lijst.map((t) => (
            <TechniqueRow
              key={t.id}
              technique={t}
              active={t.id === selectedId}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </nldd-list>
        {/* Outside the list: inside a row a screen reader would read it as part of that row. */}
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

/** The goals as tabs; what does not fit goes behind "Meer tabs". */
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
  useNlddEvent<CustomEvent<{ item: HTMLElement }>>(ref, 'tabchange', (e) => {
    const text = e.detail?.item?.getAttribute('text');
    const doel = doelen.find((d) => d.naam === text);
    if (doel) onKies(doel.id);
  });
  return (
    <nldd-tab-bar ref={ref} variant="icon-and-text" size="lg" accessible-label="Kies je doel">
      {doelen.map((d) => (
        <nldd-tab-bar-item
          key={d.id}
          text={d.naam}
          icon={d.icon}
          current={d.id === actief || undefined}
        ></nldd-tab-bar-item>
      ))}
    </nldd-tab-bar>
  );
}

const uitlegId = (t: Technique) => `techniek-uitleg-${t.id}`;

function TechniqueRow({
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
  const popoverId = uitlegId(t);

  // The explanation is a segment of its own beside the choice: a button inside a
  // button is invalid and a screen reader skips it.
  return (
    <nldd-list-item selected={active || undefined}>
      <nldd-list-item-segment
        button
        width="full"
        accessible-label={`${active ? 'Gekozen' : 'Kies'} ${t.name}`}
        onClick={onSelect}
      >
        <nldd-icon-cell icon={kaart.icon} color={framework ? 'accent' : 'secondary'}></nldd-icon-cell>
        <nldd-spacer-cell size="12"></nldd-spacer-cell>
        <nldd-text-cell supporting-text={kaart.kort || undefined}>
          <strong>{t.name}</strong>{' '}
          <nldd-tag size="sm" color="neutral" text={framework ? 'Framework' : 'Techniek'}></nldd-tag>
        </nldd-text-cell>
        <nldd-spacer-cell size="12"></nldd-spacer-cell>
        <nldd-text-cell
          hide-below="md"
          width="fit-content"
          color="accent"
          text={active ? 'Gekozen' : 'Kies'}
        ></nldd-text-cell>
        <nldd-icon-cell
          size="20"
          color="accent"
          icon={active ? 'check-mark' : 'chevron-right'}
        ></nldd-icon-cell>
      </nldd-list-item-segment>
      {kaart.info && (
        <nldd-list-item-segment button popovertarget={popoverId} accessible-label={`Uitleg over ${t.name}`}>
          <nldd-icon-cell icon="info-circle" size="20" color="secondary"></nldd-icon-cell>
        </nldd-list-item-segment>
      )}
    </nldd-list-item>
  );
}
