interface PhaseStepsProps {
  /** De stappen in volgorde, van eerste naar laatste. */
  steps: string[];
  /** Welke stap nu loopt; alles ervóór is af, alles erna wacht nog. */
  activeIndex: number;
  /** Kept for callers; spacing comes from the surrounding container. */
  className?: string;
}

/**
 * Compact stappenspoor voor een lopende AI-actie: wat is af, wat loopt er nu, en
 * wat komt er nog. Gedeeld door de laadschermen van het voor-invullen en het
 * bouwen van de prompt.
 *
 * Waarom: het zware werk van een model gebeurt vóór het eerste teken tekst. Zonder
 * dit spoor lijkt die periode stil te staan, terwijl er juist wordt nagedacht. Een
 * afgevinkte stap plus een lopende stap maakt het verschil zichtbaar tussen
 * "bezig met lezen" en "bezig met schrijven".
 */
export default function PhaseSteps({ steps, activeIndex }: PhaseStepsProps) {
  return (
    <nldd-step-bar accessible-label="Voortgang van de AI">
      {steps.map((label, i) => (
        <nldd-step-bar-item
          key={label}
          text={label}
          status={i < activeIndex ? 'past' : i === activeIndex ? 'current' : 'future'}
        ></nldd-step-bar-item>
      ))}
    </nldd-step-bar>
  );
}
