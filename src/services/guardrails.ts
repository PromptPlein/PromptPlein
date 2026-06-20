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
  pattern: RegExp;
}

// Nederlandse persoonsgegevens — pragmatische patronen.
const PII_RULES: PiiRule[] = [
  { label: 'E-mailadres', pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  // BSN: 9 cijfers (evt. met spaties/streepjes). Elfproef bevestigt.
  { label: 'BSN', pattern: /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/ },
  // NL telefoonnummer: 06-nummers en algemene 10-cijferige reeksen met prefix.
  { label: 'Telefoonnummer', pattern: /\b(?:\+31|0)\s?6[\s-]?\d{8}\b|\b0\d{1,3}[\s-]?\d{6,7}\b/ },
  // IBAN (NL).
  { label: 'IBAN', pattern: /\bNL\d{2}[A-Z]{4}\d{10}\b/i },
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

/** Detecteer mogelijke persoonsgegevens in een tekst. */
export function detectPii(text: string): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  const seen = new Set<string>();
  for (const rule of PII_RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    if (rule.label === 'BSN') {
      const digits = match[0].replace(/\D/g, '');
      if (!isValidBsn(digits)) continue; // willekeurige 9-cijfer-getallen overslaan
    }
    if (!seen.has(rule.label)) {
      seen.add(rule.label);
      findings.push({ kind: 'pii', label: rule.label });
    }
  }
  return findings;
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
