// Herkent of een tekst over een project van de gebruiker gaat, zodat de bouwer
// kan voorstellen dat project mee te nemen.
//
// Dit gebeurt bewust op het apparaat met een woordvergelijking op de projectnaam
// en niet met een AI-aanroep: het draait bij elke toetsaanslag, en een half
// getypte tekst hoort niet naar een model te gaan voor er iemand op een knop
// heeft gedrukt. Liever een voorstel te weinig dan een verkeerd voorstel, dus
// bij een gelijke stand komt er geen voorstel.

/** Woorden die in veel projectnamen staan en niets over het onderwerp zeggen. */
const STOPWORDS = new Set([
  'project',
  'projecten',
  'nieuw',
  'nieuwe',
  'voor',
  'van',
  'het',
  'een',
  'met',
  'over',
  'mijn',
  'onze',
  'team',
]);

/** Korter dan dit moet een woord exact gelijk zijn; langer mag de vervoeging verschillen. */
const MIN_STEM = 5;

/** Zoveel letters mag de vervoeging schelen: "verzoek" en "verzoeken" wel, "nieuw" en "nieuwsbrief" niet. */
const MAX_ENDING = 3;

/** Onder deze lengte is een tekst nog te kort om iets over te zeggen. */
const MIN_TEXT_CHARS = 8;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    short.length >= MIN_STEM && long.length - short.length <= MAX_ENDING && long.startsWith(short)
  );
}

/** Het project waar de tekst het duidelijkst over gaat, of null. */
export function matchProject<T extends { id: string; name: string }>(
  text: string,
  projects: T[],
): T | null {
  if (text.trim().length < MIN_TEXT_CHARS) return null;
  const textWords = new Set(words(text));

  let best: T | null = null;
  let bestScore = 0;
  let tied = false;
  for (const project of projects) {
    const nameWords = [...new Set(words(project.name))].filter(
      (word) => word.length >= 3 && !STOPWORDS.has(word),
    );
    const score = nameWords.filter((word) =>
      [...textWords].some((textWord) => sameWord(word, textWord)),
    ).length;
    if (score > bestScore) {
      best = project;
      bestScore = score;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  }
  return tied ? null : best;
}
