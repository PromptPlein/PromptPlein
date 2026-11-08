// De woorden waarmee een gebruiker de chat iets voor altijd laat onthouden.
//
// Bewust in de client en zonder AI: alleen een bericht met zo'n woord gaat naar
// 'memory-save'. Een gewoon bericht kost zo geen extra aanroep, en er gaat niets
// naar het geheugen waar de gebruiker niet zelf om vroeg. Of het bericht echt een
// vaste wens bevat, beslist daarna het model.

const TRIGGERS: readonly RegExp[] = [
  /\bvoortaan\b/i,
  /\bonthoud\b/i,
  /\bonthou\b/i,
  /\bvanaf nu\b/i,
  /\bvan nu af(?: aan)?\b/i,
  /\bvanaf vandaag\b/i,
  /\bin het vervolg\b/i,
  /\bvoor altijd\b/i,
  /\baltijd zo\b/i,
];

/** Bevat het bericht een van de woorden die om onthouden vragen? */
export function hasMemoryTrigger(text: string): boolean {
  return TRIGGERS.some((pattern) => pattern.test(text));
}
