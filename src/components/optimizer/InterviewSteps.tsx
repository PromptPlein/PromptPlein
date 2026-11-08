import '@nldd/design-system/step-bar';
/**
 * The fixed line of questions of the brainstorm session, in the order the AI
 * walks it. The names come verbatim from the protocol of the clarify mode: the
 * model tags each question with its step, and that name matches here.
 *
 * "Navraag" deliberately has no step of its own: it only sometimes occurs, and a
 * bar that gains a step halfway reads as a bug. It falls under the last step.
 */
export const INTERVIEW_STEPS = [
  { id: 'Het probleem', short: 'Probleem' },
  { id: 'Het doel', short: 'Doel' },
  { id: 'Voor wie', short: 'Voor wie' },
  { id: 'Wat er al ligt', short: 'Materiaal' },
  { id: 'De grenzen', short: 'Grenzen' },
  { id: 'Waar het landt', short: 'Gebruik' },
] as const;

/** Position of a step name in the line; -1 when the name is not recognized. */
function indexOfStep(step?: string | null): number {
  if (!step) return -1;
  const needle = step.trim().toLowerCase();
  const exact = INTERVIEW_STEPS.findIndex((s) => s.id.toLowerCase() === needle);
  if (exact !== -1) return exact;
  // "Navraag" and its variants belong to the last step: the conversation is
  // complete and only one thing is asked again.
  if (needle.startsWith('navraag')) return INTERVIEW_STEPS.length - 1;
  return -1;
}

/**
 * Progress over the line of questions. `current` is the step the open question
 * belongs to. When it is (still) unknown, the bar falls back on the number of
 * answered questions, so something always moves. While the AI thinks about the
 * next question, the current step shows an ellipsis instead of its number.
 */
export default function InterviewSteps({
  current,
  answered,
  busy,
}: {
  /** Stapnaam van de huidige vraag, zoals de AI hem meestuurt. */
  current?: string | null;
  /** Aantal beantwoorde vragen; vangnet als de stapnaam ontbreekt. */
  answered: number;
  /** De AI denkt na over de volgende vraag. */
  busy: boolean;
}) {
  const named = indexOfStep(current);
  const activeIndex = named !== -1 ? named : Math.min(answered, INTERVIEW_STEPS.length - 1);

  return (
    <nldd-step-bar accessible-label="Voortgang van het gesprek">
      {INTERVIEW_STEPS.map((step, i) => (
        <nldd-step-bar-item
          key={step.id}
          text={step.short}
          status={i === activeIndex ? 'current' : undefined}
          icon={i === activeIndex && busy ? 'ellipsis' : undefined}
        ></nldd-step-bar-item>
      ))}
    </nldd-step-bar>
  );
}
