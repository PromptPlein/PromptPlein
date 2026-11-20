// Een chatantwoord gelezen als document: de titel, de blokken in volgorde en hoe
// ver de koppen opschuiven. Word, PDF en PowerPoint lezen het antwoord hiermee,
// zodat elk bestand dezelfde titel en indeling heeft.

import { splitAnswer } from './chatFiles';
import { inlineRuns, parseBlocks, type Block } from './markdownBlocks';
import { fileNameFrom } from './officeXml';

export type AnswerPart = { kind: 'blocks'; blocks: Block[] } | { kind: 'code'; code: string } | { kind: 'html' };

export interface AnswerDocument {
  parts: AnswerPart[];
  /** De titel als Markdown ("# Titel" bovenaan), of leeg. */
  title: string;
  plainTitle: string;
  /** Zoveel niveaus schuiven de koppen op: staat er geen "# ", dan wordt "## " kop 1. */
  shift: number;
}

// --- Kopjes herkennen die geen Markdown zijn ---
//
// De chat schrijft lang niet altijd "## Kop". De systeemprompt in Beheer kan
// kopjes en vet verbieden, en dan zet het model een kop als kale korte regel
// boven een alinea of opsomming. Op het scherm valt dat niet op, maar in Word
// werd het platte tekst zonder Kop 1 en Kop 2. Een document leest zulke regels
// daarom als kop, met strakke regels zodat een gewone zin nooit een kop wordt.

const SENTENCE_END = /[.,;!?…]$/;
/** Aanhef en afsluiting van een brief zijn nooit een kop. */
const LETTER_LINE = /^(geachte|beste|hallo|hoi|dag|met vriendelijke groet|met hartelijke groet|hoogachtend|vriendelijke groet|groet(en)?)\b/i;
/** De regels boven een brief: "Onderwerp: ...", "Datum: ...". */
const LETTER_FIELD = /^(onderwerp|betreft|datum|kenmerk|ons kenmerk|uw kenmerk|aan|van|cc|bijlage[n]?)\s*:/i;

function plainText(text: string): string {
  return inlineRuns(text)
    .map((r) => r.text)
    .join('')
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Ziet deze regel eruit als een kop: kort, met een hoofdletter, zonder slotteken? */
function headingShaped(text: string): boolean {
  const plain = plainText(text);
  if (!plain || plain.length > 70 || LETTER_LINE.test(plain) || LETTER_FIELD.test(plain)) return false;
  if (!/^[\p{Lu}\p{N}]/u.test(plain)) return false;
  const words = wordCount(plain);
  if (words > 9) return false;
  // "Doelen:" is een kop, "Dit zijn de stappen:" een inleidende zin.
  if (plain.endsWith(':')) return words <= 3;
  return !SENTENCE_END.test(plain);
}

/** Inhoud die onder een kop kan staan: een lijst, tabel, citaat of een echte zin. */
function isBody(block: Block | undefined): boolean {
  if (!block) return false;
  if (block.kind === 'list' || block.kind === 'table' || block.kind === 'quote') return true;
  if (block.kind !== 'paragraph') return false;
  const plain = plainText(block.text);
  if (LETTER_LINE.test(plain)) return false;
  return SENTENCE_END.test(plain) || wordCount(plain) > 9;
}

/**
 * Zet kale kopregels en vette labels ("**Doelen**") om in echte koppen. Koppen
 * met "#" blijven zoals ze zijn; een label komt dan een niveau onder de kop
 * erboven. Zonder "#" in het antwoord worden de kopregels niveau 2, en een
 * kopregel helemaal bovenaan met nog meer koppen eronder wordt de titel.
 */
function promoteHeadings(blocks: Block[]): Block[] {
  const hasMarkdownHeadings = blocks.some((b) => b.kind === 'heading');
  const next = (i: number) => {
    let j = i + 1;
    while (j < blocks.length && blocks[j].kind === 'spacer') j++;
    return j;
  };

  // Van achter naar voren: een kop mag ook direct boven een andere kop staan.
  const promoted = new Array<boolean>(blocks.length).fill(false);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block.kind === 'label') {
      promoted[i] = true;
      continue;
    }
    if (hasMarkdownHeadings || block.kind !== 'paragraph' || !headingShaped(block.text)) continue;
    // Direct onder een gewone regel (zonder witregel) hoort hij bij die tekst, zoals
    // een naam en functie onder een brief.
    const before = blocks[i - 1];
    if (before && before.kind === 'paragraph') continue;
    const j = next(i);
    promoted[i] = isBody(blocks[j]) || (promoted[j] && blocks[j].kind === 'paragraph');
  }

  const firstIndex = blocks.findIndex((b) => b.kind !== 'spacer');
  const promotedCount = promoted.filter(Boolean).length;
  let lastLevel = 1;
  return blocks.map((block, i) => {
    if (block.kind === 'heading') {
      lastLevel = block.level;
      return block;
    }
    if (!promoted[i] || (block.kind !== 'paragraph' && block.kind !== 'label')) return block;
    let level: number;
    if (hasMarkdownHeadings) level = Math.min(lastLevel + 1, 6);
    else level = i === firstIndex && promotedCount > 1 && block.kind === 'paragraph' ? 1 : 2;
    return { kind: 'heading', level, text: block.text };
  });
}

/**
 * Een codeblok zonder programmeertaal is vaak gewoon tekst: "Hier is de brief:"
 * met de brief tussen ```. In een document hoort dat tekst te zijn met opmaak,
 * niet een grijs vlak in een codeletter.
 */
const PROSE_LANGS = new Set(['', 'markdown', 'md', 'text', 'txt', 'plaintext', 'plain']);

function looksLikeProse(lang: string, code: string): boolean {
  if (!PROSE_LANGS.has(lang)) return false;
  if (lang === 'markdown' || lang === 'md') return true;
  const lines = code.split('\n').filter((l) => l.trim());
  if (!lines.length) return false;
  const codeLike = lines.filter((l) => /[;{}]\s*$|^\s*(import|export|const|let|var|function|def|class|return|if\s*\(|for\s*\(|<\/?\w+[^>]*>|SELECT|INSERT|UPDATE)\b/i.test(l) || /^\s*[\w.$]+\s*=\s*\S/.test(l));
  return codeLike.length / lines.length < 0.2;
}

/** Leest het antwoord en geeft de titel en de blokken in volgorde. */
export function readAnswer(markdown: string): AnswerDocument {
  const parts: AnswerPart[] = splitAnswer(markdown).map((segment): AnswerPart => {
    if (segment.kind === 'text') return { kind: 'blocks', blocks: promoteHeadings(parseBlocks(segment.text)) };
    if (segment.isHtmlFile) return { kind: 'html' };
    if (looksLikeProse(segment.lang, segment.code)) return { kind: 'blocks', blocks: promoteHeadings(parseBlocks(segment.code)) };
    return { kind: 'code', code: segment.code };
  });

  const all = parts.flatMap((p) => (p.kind === 'blocks' ? p.blocks : [])).filter((b) => b.kind !== 'spacer');
  const first = parts[0]?.kind === 'blocks' ? parts[0].blocks.find((b) => b.kind !== 'spacer') : undefined;

  // Begint het antwoord met "# Titel", dan is dat de titel van het document. Staat
  // er verder geen "# ", dan schuiven de koppen een niveau op: "## " wordt Kop 1.
  let title = '';
  let shift = 0;
  if (first?.kind === 'heading' && first.level === 1) {
    title = first.text;
    const firstPart = parts[0] as { kind: 'blocks'; blocks: Block[] };
    firstPart.blocks = firstPart.blocks.filter((b) => b !== first);
    const others = all.filter((b) => b !== first && b.kind === 'heading');
    if (!others.some((b) => b.kind === 'heading' && b.level === 1)) {
      shift = Math.max(Math.min(...others.map((b) => (b.kind === 'heading' ? b.level : 9)), 9) - 1, 0);
    }
  } else {
    const shallowest = Math.min(...all.map((b) => (b.kind === 'heading' ? b.level : 9)));
    if (shallowest < 9) shift = shallowest - 1;
  }

  const plainTitle = inlineRuns(title)
    .map((r) => r.text)
    .join('')
    .trim();
  return { parts, title, plainTitle, shift };
}


/** Een bestandsnaam zonder extensie: de titel, of anders het begin van het antwoord. */
export function documentBaseName(read: AnswerDocument, markdown: string): string {
  const firstLine =
    read.plainTitle ||
    inlineRuns(markdown.split('\n').find((l) => l.trim() && !l.trim().startsWith('```')) ?? '')
      .map((r) => r.text)
      .join('')
      .replace(/^#+\s*/, '')
      .split(/[.:!?]/)[0];
  return fileNameFrom(firstLine, `PromptPlein ${new Date().toLocaleDateString('nl-NL')}`);
}
