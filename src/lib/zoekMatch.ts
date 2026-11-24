/**
 * Zoeken op naam zoals mensen typen: zonder hoofdletters, accenten en leestekens,
 * met de woorden in elke volgorde. "sscict" vindt "SSC-ICT", "financien inkoop"
 * vindt "Financiën & Inkoop". Gedeeld door de keuzelijsten en de controle op
 * dubbele aanvragen, zodat beide hetzelfde onder "gelijk" verstaan.
 */

/** Woorden die in bijna elke naam staan en dus niets zeggen over welke het is. */
const VULWOORDEN = new Set([
  'de', 'het', 'een', 'en', 'van', 'voor', 'der', 'den', 'in', 'op', 'te', 'of', 'met', 'bij',
]);

/** Kleine letters, zonder accenten, leestekens als spatie. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Zonder spaties, zodat "SSC-ICT", "SSC ICT" en "SSCICT" gelijk zijn. */
export function compact(text: string): string {
  return fold(text).replace(/ /g, '');
}

/** De woorden die iets zeggen: minstens drie tekens en geen vulwoord. */
export function significantWords(text: string): string[] {
  return fold(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !VULWOORDEN.has(w));
}

/** Komt elk woord van de zoekvraag ergens in de tekst voor? */
export function matchesAll(query: string, haystack: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const hay = fold(haystack);
  if (compact(haystack).includes(q.replace(/ /g, ''))) return true;
  return q.split(' ').every((w) => hay.includes(w));
}

/**
 * Hoeveel betekenisvolle woorden van de zoekvraag in de tekst staan, als begin van
 * een woord. Voor de terugval als niets precies past: een naam die net anders is
 * geschreven ("Organisatie voor Digitalisering" bij "Ontwikkeling, Digitalisering")
 * komt dan toch boven.
 */
export function overlap(query: string, haystack: string): number {
  const words = fold(haystack).split(' ');
  return significantWords(query).filter((q) => words.some((w) => w.startsWith(q))).length;
}
