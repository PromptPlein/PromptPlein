// Herkent in een chatbericht de vraag om een antwoord als bestand: "maak hier een
// Word-document van", "exporteer naar Excel", "kan ik dit downloaden?".
//
// Bewust in de client en zonder AI, net als de woorden voor het geheugen. Een
// bestand maken kost geen aanroep: de browser maakt het uit het vorige antwoord.
// Vraagt het bericht ook om nieuwe inhoud ("schrijf een brief in Word"), dan gaat
// het gewoon naar de AI en krijgt het antwoord het bestand als voorstel eronder.

import { findTables, hasTable } from './excelExport';
import { parseBlocks } from './markdownBlocks';

export type ExportFormat = 'word' | 'excel';

export interface ExportRequest {
  /** Het genoemde formaat; null = "exporteer dit" zonder formaat. */
  format: ExportFormat | null;
  /**
   * Het bericht vraagt alleen om het bestand en verwijst naar het vorige
   * antwoord. False = er wordt ook om nieuwe inhoud gevraagd.
   */
  aboutPrevious: boolean;
}

const WORD = [
  /\bword[- ]?(document|documentje|bestand|bestandje|versie|file|doc|formaat|bestandsformaat)\b/,
  /\b(in|naar|als|tot|via|met|voor)\s+(ms[- ]?|microsoft\s+)?word\b/,
  /\bdocx\b/,
  /^(ms[- ]?|microsoft\s+)?word\b(\s+(graag|alsjeblieft|aub|svp|please))?$/,
];
const EXCEL = [/\bexcel\b/, /\bxlsx\b/, /\bspreadsheet\b/, /\brekenblad\b/];
const EXPORT = [
  /\bexporte(er|ert|ren)\b/,
  /\bexport\b/,
  /\bdownload(en|baar)?\b/,
  /\b(als|in|naar)\s+(een\s+)?(bestand|document)(je)?\b/,
  /\b(bestand|document)(je)?\s+van\b/,
  /\bopslaan\b/,
  /\bsla\b.*\bop\b/,
];

// Woorden die bij het verzoek zelf horen. Blijft er na het weghalen hiervan iets
// over, dan vraagt het bericht ook om inhoud ("over de begroting", "met de cijfers").
const REQUEST_WORDS = new Set(
  (
    'maak maken zet zetten exporteer exporteert exporteren export download downloaden downloadbaar ' +
    'opslaan sla op om omzetten zet krijg krijgen geef geven stuur sturen lever leveren wil wilt ' +
    'graag alsjeblieft alstublieft aub svp please even nog ook wel toch maar nu dan dus ' +
    'kun kunt kan kunnen mag mogen zou zouden je jij u ik me mij we wij jullie ' +
    'hier hiervan dit dat deze die het er ervan daarvan hierover daar bovenstaande vorige laatste ' +
    'van een als in naar tot via met voor de het en of aan ' +
    'bestand bestandje document documentje versie file doc docx xlsx formaat bestandsformaat ' +
    'word ms microsoft excel spreadsheet rekenblad sheet werkblad ' +
    'antwoord tekst tabel tabellen inhoud resultaat overzicht lijst openen'
  ).split(/\s+/),
);

/** Woorden die op een nieuwe vraag wijzen in plaats van een verzoek om een bestand. */
const QUESTION_START = /^(hoe|wat|waarom|wanneer|welke|welk|wie|waar|waarmee)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'‘’`*_()[\]{}]/g, ' ')
    .replace(/[.,;:!?]+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vraagt dit bericht om een bestand? Null als het daar niet over gaat. */
export function parseExportRequest(raw: string): ExportRequest | null {
  const text = normalize(raw);
  if (!text || text.length > 400) return null;
  const word = WORD.some((p) => p.test(text));
  const excel = EXCEL.some((p) => p.test(text));
  const generic = EXPORT.some((p) => p.test(text));
  if (!word && !excel && !generic) return null;
  // "Wat is het verschil tussen Word en Excel?" gaat over de programma's zelf.
  if (QUESTION_START.test(text)) return null;

  const format: ExportFormat | null = word && !excel ? 'word' : excel && !word ? 'excel' : null;
  const leftover = text
    .split(' ')
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((w) => w && !REQUEST_WORDS.has(w) && !/^(word|excel)-?/.test(w));
  return { format, aboutPrevious: leftover.length <= 1 };
}

/** Hoeveel van de tekst in tabellen staat, van 0 tot 1. */
function tableShare(markdown: string): number {
  const tableLines = markdown.split('\n').filter((line) => /^\s*\|.*\|\s*$/.test(line));
  const tableChars = tableLines.join('').length;
  const total = markdown.replace(/\s+/g, ' ').length;
  return total ? tableChars / total : 0;
}

/**
 * Welk formaat past het best bij dit antwoord? Een antwoord dat vooral uit een
 * tabel bestaat, wordt Excel; tekst met opmaak wordt Word.
 */
export function recommendFormat(markdown: string): ExportFormat {
  return hasTable(markdown) && tableShare(markdown) >= 0.5 ? 'excel' : 'word';
}

/**
 * Stelt PromptPlein bij dit antwoord vanzelf een bestand voor? Alleen bij iets wat
 * je echt als bestand wilt bewaren: een tabel met een paar rijen, een brief of
 * een stuk met kopjes. Een gewoon antwoord krijgt geen voorstel, de knop
 * Downloaden staat er dan toch al.
 */
export function suggestFormat(markdown: string): ExportFormat | null {
  if (hasTable(markdown)) {
    const rows = findTables(markdown).reduce((sum, table) => sum + table.rows.length, 0);
    if (rows >= 3 && tableShare(markdown) >= 0.5) return 'excel';
  }
  const words = markdown.split(/\s+/).filter(Boolean).length;
  const letter =
    /^\s*(geachte|beste|hallo|dag)\b/im.test(markdown) &&
    /\b(met vriendelijke groet|hoogachtend|groet(en)?)\b/i.test(markdown);
  if (letter && words >= 60) return 'word';
  const headings = parseBlocks(markdown).filter((b) => b.kind === 'heading' || b.kind === 'label').length;
  if (headings >= 2 && words >= 200) return 'word';
  if (hasTable(markdown) && findTables(markdown).some((t) => t.rows.length >= 3)) return 'excel';
  return null;
}
