/**
 * Client-side guardrail-detectie die vóór een optimalisatie draait.
 * Detecteert mogelijke persoonsgegevens (AVG) en verboden onderwerpen, zodat
 * de gebruiker gewaarschuwd wordt en expliciet moet bevestigen.
 *
 * Bewust eenvoudige heuristiek (regex/woordmatch): geen 100%-garantie, maar
 * vangt de meest voorkomende gevallen af zonder data naar buiten te sturen.
 */

export type GuardrailKind = 'pii' | 'topic';

export interface GuardrailFinding {
  kind: GuardrailKind;
  /** Mensvriendelijk label, bv. 'BSN' of 'E-mailadres'. */
  label: string;
}

interface PiiRule {
  label: string;
  /** Wat er in de tekst komt te staan, zie {@link redactPii}. */
  placeholder: string;
  /**
   * Altijd met de vlag g. Staat er een groep `keep` in, dan blijft dat deel
   * staan bij het vervangen, zoals de aanhef voor een naam.
   */
  pattern: RegExp;
}

// Aanhef voor een naam. Hoofdlettergevoelig, zodat "Geachte heer, mevrouw," niet telt.
const AANHEF = String.raw`(?:[Dd]e heer|[Hh]eer|[Mm]evrouw|[Mm]evr\.|[Mm]w\.|[Dd]hr\.|[Mm]eneer)`;
const VOORVOEGSEL = String.raw`(?:(?:van|de|der|den|ter|ten|het|van der|van den|van de)[ \t]+)`;
const NAAMDEEL = String.raw`[A-ZÀ-Ý][a-zà-ÿ]+(?:-[A-ZÀ-Ý][a-zà-ÿ]+)?`;

// Nederlandse persoonsgegevens: pragmatische patronen.
const PII_RULES: PiiRule[] = [
  {
    label: 'E-mailadres',
    placeholder: '[e-mailadres]',
    pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  },
  // BSN: 9 cijfers, eventueel met spaties of streepjes. De elfproef bevestigt.
  { label: 'BSN', placeholder: '[BSN]', pattern: /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g },
  // NL telefoonnummer: 06-nummers en algemene 10-cijferige reeksen met prefix.
  {
    label: 'Telefoonnummer',
    placeholder: '[telefoonnummer]',
    pattern: /\b(?:\+31|0)\s?6[\s-]?\d{8}\b|\b0\d{1,3}[\s-]?\d{6,7}\b/g,
  },
  // IBAN (NL).
  { label: 'IBAN', placeholder: '[IBAN]', pattern: /\bNL\d{2}[A-Z]{4}\d{10}\b/gi },
  // Naam met aanhef ("de heer Jansen", "mevrouw A. de Vries"). Een losse naam
  // is niet van een gewoon woord met hoofdletter te onderscheiden; met aanhef
  // wel. Binnen een naam alleen spaties: een nieuwe regel is een nieuw veld.
  {
    label: 'Naam',
    placeholder: '[naam]',
    pattern: new RegExp(
      String.raw`\b(?<keep>${AANHEF}[ \t]+)(?:[A-Z]\.[ \t]?)*${VOORVOEGSEL}*${NAAMDEEL}`,
      'g',
    ),
  },
  // Naam achter een veldnaam, zoals in een formulier of dossier: "Naam: Jan de Vries".
  {
    label: 'Naam',
    placeholder: '[naam]',
    pattern: new RegExp(
      String.raw`(?<keep>\b(?:[Nn]aam|[Aa]chternaam|[Aa]anvrager|[Bb]etrokkene|[Cc]liënt|[Bb]urger|[Ii]nwoner|[Mm]edewerker|[Pp]atiënt)[ \t]*:[ \t]*)(?:[A-Z]\.[ \t]?)*${NAAMDEEL}(?:[ \t]+${VOORVOEGSEL}*${NAAMDEEL})*`,
      'g',
    ),
  },
  // Geboortedatum, alleen met een aankondiging ervoor; een losse datum is meestal
  // een termijn of een vergaderdatum.
  {
    label: 'Geboortedatum',
    placeholder: '[geboortedatum]',
    pattern: /(?<keep>\b(?:geboren(?: op)?|geb\.|geboortedatum:?)\s*)\d{1,2}[-/ .]\d{1,2}[-/ .]\d{2,4}/gi,
  },
];

/** Elfproef voor een 9-cijferig BSN, om losse 9-cijfer-getallen te filteren. */
function isValidBsn(digits: string): boolean {
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const weight = i === 8 ? -1 : 9 - i;
    sum += Number(digits[i]) * weight;
  }
  return sum % 11 === 0;
}

/** Telt een treffer mee? Voor een BSN alleen als hij de elfproef haalt. */
function counts(rule: PiiRule, match: string): boolean {
  return rule.label !== 'BSN' || isValidBsn(match.replace(/\D/g, ''));
}

export interface PiiCount {
  label: string;
  count: number;
}

/** Hoe vaak elk soort persoonsgegeven voorkomt, voor de waarschuwing bij een bestand. */
export function countPii(text: string): PiiCount[] {
  const totals = new Map<string, number>();
  for (const rule of PII_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (!counts(rule, match[0])) continue;
      totals.set(rule.label, (totals.get(rule.label) ?? 0) + 1);
    }
  }
  return [...totals].map(([label, count]) => ({ label, count }));
}

/**
 * Vervangt elke treffer door een plaatshouder, zoals "[BSN]" of "de heer [naam]".
 * Draait in de browser, dus de oorspronkelijke gegevens gaan nergens heen.
 */
export function redactPii(text: string): string {
  let result = text;
  for (const rule of PII_RULES) {
    result = result.replace(rule.pattern, (...args) => {
      const match = args[0] as string;
      const groups = args[args.length - 1] as Record<string, string | undefined> | undefined;
      if (!counts(rule, match)) return match;
      const keep = typeof groups === 'object' && groups ? (groups.keep ?? '') : '';
      return keep + rule.placeholder;
    });
  }
  return result;
}

/** Detecteer mogelijke persoonsgegevens in een tekst. */
export function detectPii(text: string): GuardrailFinding[] {
  return countPii(text).map(({ label }) => ({ kind: 'pii', label }));
}

/** Detecteer verboden onderwerpen (hele-woord match, hoofdletterongevoelig). */
export function detectBlockedTopics(text: string, topics: string[]): GuardrailFinding[] {
  const lower = text.toLowerCase();
  const findings: GuardrailFinding[] = [];
  for (const topic of topics) {
    const t = topic.trim().toLowerCase();
    if (!t) continue;
    // Woordgrens waar mogelijk; val terug op substring voor meerwoordige termen.
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
    if (re.test(lower)) findings.push({ kind: 'topic', label: topic.trim() });
  }
  return findings;
}
