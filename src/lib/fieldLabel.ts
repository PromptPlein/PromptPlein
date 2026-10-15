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
// "DOEL: wat wil je laten zien?": de nieuwere labels zonder streepje. Alleen na
// een naam in hoofdletters, zodat een dubbele punt midden in een uitleg blijft staan.
const COLON_SEPARATOR = /^[\p{Lu}][\p{Lu}\s-]*?(:\s+)/u;

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('nl-NL') + text.slice(1);
}

export function splitFieldLabel(label: string): FieldLabelParts {
  const trimmed = label.trim();
  const dash = SEPARATOR.exec(trimmed);
  const colon = dash ? null : COLON_SEPARATOR.exec(trimmed);
  const start = dash ? dash.index : colon ? colon[0].length - colon[1].length : -1;
  const length = dash ? dash[0].length : colon ? colon[1].length : 0;
  const head = start >= 0 ? trimmed.slice(0, start).trim() : trimmed;
  const tail = start >= 0 ? trimmed.slice(start + length).trim() : '';

  // "CONTEXT", "TARGET AUDIENCE", "NON-FUNCTIONAL": een framework-onderdeel.
  const isFrameworkPart = /\p{Lu}/u.test(head) && head === head.toLocaleUpperCase('nl-NL');
  const name = isFrameworkPart ? capitalize(head.toLocaleLowerCase('nl-NL')) : head;

  return {
    name,
    instruction: tail ? capitalize(tail) : null,
    code: isFrameworkPart ? head.charAt(0) : null,
  };
}
