/**
 * Splitst het label van een invulveld in een naam en een uitlegregel.
 *
 * De labels in de techniek-definities hebben de vorm "CONTEXT — omschrijf de
 * situatie (…)" of "Gewenst doel — wat wil je bereiken?". In de bouwer staat de
 * naam vet en de uitleg eronder, zodat het streepje uit het label verdwijnt.
 *
 * `code` is de beginletter van een framework-onderdeel (de C van CONTEXT) en
 * bestaat alleen als de naam helemaal in hoofdletters staat; zie de letterrail
 * in FollowUpQuestions.
 */
export interface FieldLabelParts {
  name: string;
  instruction: string | null;
  code: string | null;
}

const SEPARATOR = /\s+[—–]\s+|\s+-\s+/;

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('nl-NL') + text.slice(1);
}

export function splitFieldLabel(label: string): FieldLabelParts {
  const trimmed = label.trim();
  const match = SEPARATOR.exec(trimmed);
  const head = match ? trimmed.slice(0, match.index).trim() : trimmed;
  const tail = match ? trimmed.slice(match.index + match[0].length).trim() : '';

  // "CONTEXT", "TARGET AUDIENCE", "NON-FUNCTIONAL": een framework-onderdeel.
  const isFrameworkPart = /\p{Lu}/u.test(head) && head === head.toLocaleUpperCase('nl-NL');
  const name = isFrameworkPart ? capitalize(head.toLocaleLowerCase('nl-NL')) : head;

  return {
    name,
    instruction: tail ? capitalize(tail) : null,
    code: isFrameworkPart ? head.charAt(0) : null,
  };
}
