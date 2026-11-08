export type MakeStage = 'lezen' | 'kiezen' | 'invullen';

const VOLGORDE: MakeStage[] = ['lezen', 'kiezen', 'invullen'];

/**
 * Wat de AI aan het doen is tussen "Maak mijn prompt" en de ingevulde velden: lezen,
 * de beste aanpak kiezen en invullen. Bewust zichtbaar: de keuze gebeurt nu zonder
 * tussenstap, en zo blijft duidelijk dat er gekozen wordt en wat het werd.
 */
export default function MakeProgress({
  stage,
  bron = 'Je tekst',
  aanpak,
}: {
  stage: MakeStage;
  /** Wat de AI leest: "Je tekst" of "Het gesprek". */
  bron?: string;
  /** De gekozen aanpak, zodra die er is. */
  aanpak?: string;
}) {
  const huidig = VOLGORDE.indexOf(stage);
  const stappen = [
    huidig > 0 ? `${bron} gelezen` : `${bron} lezen`,
    huidig > 1 && aanpak ? `Beste aanpak gekozen: ${aanpak}` : 'Beste aanpak kiezen',
    'Velden invullen',
  ];

  return (
    <nldd-box role="region" aria-label="De AI is bezig">
      <nldd-container padding="20" gap="12">
        <nldd-title heading-level={2} size={5} text="De AI maakt je prompt klaar"></nldd-title>
        <nldd-list accessible-label="Stappen" dividers="never">
          {stappen.map((tekst, i) => {
            const status: 'past' | 'current' | 'future' = i < huidig ? 'past' : i === huidig ? 'current' : 'future';
            return (
              <nldd-list-item key={i} aria-current={status === 'current' ? 'step' : undefined}>
                <nldd-step-cell
                  status={status}
                  position={i === 0 ? 'first' : i === stappen.length - 1 ? 'last' : 'between'}
                ></nldd-step-cell>
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-text-cell
                  text={status === 'current' ? `**${tekst}**` : tekst}
                  color={status === 'future' ? 'secondary' : undefined}
                ></nldd-text-cell>
                {status === 'current' && (
                  <nldd-cell>
                    <nldd-activity-indicator size="20" timing="instant" text={tekst}></nldd-activity-indicator>
                  </nldd-cell>
                )}
              </nldd-list-item>
            );
          })}
        </nldd-list>
      </nldd-container>
    </nldd-box>
  );
}
