// Haalt bestanden uit een chatantwoord. Een model levert een HTML-pagina als
// codeblok (```html … ```) of soms als kale tekst die met <!DOCTYPE html>
// begint. In de chat tonen we zo'n blok als bestand dat je kunt bekijken en
// downloaden, in plaats van als honderden regels code tussen de tekst.

/** Een stuk van een antwoord: gewone tekst, of een codeblok. */
export type AnswerSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'code';
      /** De taal achter de openende ```, in kleine letters; leeg als die ontbreekt. */
      lang: string;
      code: string;
      /** Het blok is afgesloten; zolang het model nog schrijft is dat niet zo. */
      closed: boolean;
      /** Dit blok is een volledige HTML-pagina en wordt als bestand getoond. */
      isHtmlFile: boolean;
    };

const FENCE_OPEN = /^\s*```\s*([\w+#.-]*)\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
/** Een kale HTML-pagina zonder codeblok eromheen. */
const BARE_HTML_START = /^\s*(<!doctype html|<html[\s>])/i;
const HTML_END = /<\/html>\s*$/i;

function looksLikeHtmlPage(lang: string, code: string): boolean {
  if (lang === 'html' || lang === 'htm') return true;
  return BARE_HTML_START.test(code);
}

/** Splitst een antwoord in tekst en codeblokken, ook als het laatste blok nog open is. */
export function splitAnswer(text: string): AnswerSegment[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const segments: AnswerSegment[] = [];
  let textLines: string[] = [];
  let block: { lang: string; lines: string[]; bare: boolean } | null = null;

  const flushText = () => {
    if (textLines.some((l) => l.trim())) segments.push({ kind: 'text', text: textLines.join('\n') });
    textLines = [];
  };
  const flushBlock = (closed: boolean) => {
    if (!block) return;
    const code = block.lines.join('\n');
    segments.push({
      kind: 'code',
      lang: block.lang,
      code,
      closed,
      isHtmlFile: looksLikeHtmlPage(block.lang, code),
    });
    block = null;
  };

  for (const line of lines) {
    if (block) {
      if (block.bare) {
        // Een kale pagina loopt tot en met de regel met </html>.
        block.lines.push(line);
        if (HTML_END.test(line)) flushBlock(true);
      } else if (FENCE_CLOSE.test(line)) {
        flushBlock(true);
      } else {
        block.lines.push(line);
      }
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      flushText();
      block = { lang: open[1].toLowerCase(), lines: [], bare: false };
      continue;
    }
    if (BARE_HTML_START.test(line)) {
      flushText();
      block = { lang: 'html', lines: [line], bare: true };
      if (HTML_END.test(line)) flushBlock(true);
      continue;
    }
    textLines.push(line);
  }
  flushBlock(false);
  flushText();
  return segments;
}

/** Een bestandsnaam uit de <title> van de pagina, anders een vaste naam. */
export function htmlFileName(code: string): string {
  const title = code.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'pagina'}.html`;
}

/** Is de pagina compleet, ook als het codeblok zelf niet netjes is afgesloten? */
export function htmlLooksComplete(code: string): boolean {
  return HTML_END.test(code.trim());
}
