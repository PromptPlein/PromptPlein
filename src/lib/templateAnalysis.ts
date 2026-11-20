// Leest hoe een Word-, PowerPoint- of Excel-bestand is opgemaakt: het thema
// (letter en kleuren), en per soort wat de downloads overnemen. Zonder AI: het
// staat allemaal letterlijk in de XML van het bestand. De uitkomst tonen we als
// korte regels, zodat de gebruiker ziet wat er uit zijn sjabloon is gehaald.

import { choiceFromTheme, cleanHex, RIJK_CHOICE, type StyleChoice } from './exportStyle';
import type { ExcelLook } from './exportTemplates';

export type TemplateKind = 'word' | 'pptx' | 'xlsx';

export interface TemplateReading {
  kind: TemplateKind;
  name: string;
  bytes: Uint8Array;
  /** Letter en kleuren uit het thema. */
  choice: StyleChoice;
  /** Alleen bij Excel: de opmaak van de tabelkop. */
  excel?: ExcelLook;
  /** Wat we lazen, als korte regels voor de gebruiker. */
  gelezen: string[];
  /** Een melding als het bestand als sjabloon niet bruikbaar is. */
  probleem?: string;
}

export function templateKindOf(name: string): TemplateKind | null {
  if (/\.(docx|dotx)$/i.test(name)) return 'word';
  if (/\.(pptx|potx)$/i.test(name)) return 'pptx';
  if (/\.(xlsx|xltx)$/i.test(name)) return 'xlsx';
  return null;
}

const THEME_SLOTS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

function themeColors(themeXml: string): string[] {
  return THEME_SLOTS.map((slot) => {
    const block = new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`).exec(themeXml)?.[1] ?? '';
    return cleanHex(/srgbClr val="([0-9A-Fa-f]{6})"/.exec(block)?.[1]) ?? cleanHex(/lastClr="([0-9A-Fa-f]{6})"/.exec(block)?.[1]) ?? '';
  });
}

function count(n: number, one: string, more: string): string {
  return `${n} ${n === 1 ? one : more}`;
}

/** Leest één bestand. Gooit een Error met een leesbare melding als het geen Office-bestand is. */
export async function readTemplate(name: string, bytes: Uint8Array): Promise<TemplateReading> {
  const kind = templateKindOf(name);
  if (!kind) throw new Error('Kies een Word-, PowerPoint- of Excel-bestand.');
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(`"${name}" is geen geldig Office-bestand.`);
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const paths = Object.keys(files);
  const themePath = paths.filter((p) => /^(word|ppt|xl)\/theme\/theme\d*\.xml$/.test(p)).sort()[0];
  const theme = themePath ? text(themePath) : '';
  const fromTheme = theme ? choiceFromTheme(theme) : null;
  const choice: StyleChoice = fromTheme ?? { ...RIJK_CHOICE, font: 'Calibri' };
  const gelezen: string[] = [];
  if (theme) {
    const major = /<a:majorFont>\s*<a:latin typeface="([^"]*)"/.exec(theme)?.[1];
    const minor = /<a:minorFont>\s*<a:latin typeface="([^"]*)"/.exec(theme)?.[1];
    gelezen.push(major && minor && major !== minor ? `Letters: ${major} voor koppen, ${minor} voor tekst` : `Letter: ${minor || major}`);
    const colors = themeColors(theme).filter(Boolean);
    if (colors.length) gelezen.push(`Themakleuren: ${colors.slice(4).map((c) => `#${c}`).join(', ')}`);
  }

  if (kind === 'pptx') {
    const layouts = paths.filter((p) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p));
    const names = layouts.map((p) => /<p:cSld name="([^"]*)"/.exec(text(p))?.[1]).filter(Boolean) as string[];
    const slides = paths.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).length;
    const pictures = paths.filter((p) => /^ppt\/media\//.test(p)).length;
    const size = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(text('ppt/presentation.xml'));
    if (size) gelezen.push(`Formaat: ${Math.abs(+size[1] / +size[2] - 16 / 9) < 0.05 ? 'breed (16:9)' : Math.abs(+size[1] / +size[2] - 4 / 3) < 0.05 ? 'standaard (4:3)' : 'eigen formaat'}`);
    if (names.length) gelezen.push(`${count(names.length, 'dia-indeling', 'dia-indelingen')}: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''}`);
    if (pictures) gelezen.push(`${count(pictures, 'afbeelding', 'afbeeldingen')} in het diamodel, zoals een logo`);
    if (slides) gelezen.push(`${count(slides, 'voorbeelddia', "voorbeelddia's")}; die gaan er bij het maken uit`);
    const { checkPptxTemplate } = await import('./pptxTemplate');
    const probleem = (await checkPptxTemplate(bytes)) ?? undefined;
    return { kind, name, bytes, choice, gelezen, probleem };
  }

  if (kind === 'word') {
    const styles = text('word/styles.xml');
    // Zonder thema staat de letter in de standaardopmaak van het document.
    const defaultFont = /<w:rPrDefault>[\s\S]*?<w:rFonts[^>]*w:ascii="([^"]+)"/.exec(styles)?.[1];
    if (!fromTheme && defaultFont) {
      choice.font = defaultFont;
      gelezen.unshift(`Letter: ${defaultFont}`);
    }
    const heading = /<w:style w:type="paragraph"[^>]*w:styleId="([^"]+)"[^>]*>\s*<w:name w:val="heading 1"\/>[\s\S]*?<\/w:style>/i.exec(styles)?.[0];
    const headingColor = heading && cleanHex(/<w:color w:val="([0-9A-Fa-f]{6})"/.exec(heading)?.[1]);
    const headingFont = heading && /<w:rFonts[^>]*w:ascii="([^"]+)"/.exec(heading)?.[1];
    if (headingColor) {
      choice.heading = headingColor;
      gelezen.push(`Kop 1: #${headingColor}${headingFont ? ` in ${headingFont}` : ''}`);
    }
    const headers = paths.filter((p) => /^word\/header\d*\.xml$/.test(p)).length;
    const footers = paths.filter((p) => /^word\/footer\d*\.xml$/.test(p)).length;
    if (headers || footers) gelezen.push(`Koptekst ${headers ? 'ja' : 'nee'}, voettekst ${footers ? 'ja' : 'nee'}`);
    const pictures = paths.filter((p) => /^word\/media\//.test(p)).length;
    if (pictures) gelezen.push(`${count(pictures, 'afbeelding', 'afbeeldingen')}, zoals een logo`);
    const body = text('word/document.xml');
    gelezen.push(/\{\{?\s*inhoud\s*\}?\}/i.test(body) ? 'De tekst komt op de plek van {inhoud}' : 'Geen {inhoud}: de tekst vervangt de inhoud, kop- en voettekst blijven');
    const { checkWordTemplate } = await import('./wordExport');
    const probleem = (await checkWordTemplate(bytes)) ?? undefined;
    return { kind, name, bytes, choice, gelezen, probleem };
  }

  // Excel: de opmaak van de eerste cel van het eerste blad is de tabelkop.
  const styles = text('xl/styles.xml');
  const workbook = text('xl/workbook.xml');
  const sheetNames = [...workbook.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]);
  if (sheetNames.length) gelezen.push(`${count(sheetNames.length, 'tabblad', 'tabbladen')}: ${sheetNames.slice(0, 5).join(', ')}`);
  const sheet = text('xl/worksheets/sheet1.xml');
  const firstCell = /<c r="[A-Z]+1"[^>]*\bs="(\d+)"/.exec(sheet)?.[1];
  const xfs = [...(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const fonts = [...(/<fonts[^>]*>([\s\S]*?)<\/fonts>/.exec(styles)?.[1] ?? '').matchAll(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g)].map((m) => m[0]);
  const fills = [...(/<fills[^>]*>([\s\S]*?)<\/fills>/.exec(styles)?.[1] ?? '').matchAll(/<fill\b[^>]*?(?:\/>|>[\s\S]*?<\/fill>)/g)].map((m) => m[0]);
  const palette = theme ? themeColors(theme) : [];
  // Excel noemt themakleuren met lt1 en dk1 andersom: 0 is licht, 1 is donker.
  const themeIndex = [1, 0, 3, 2, 4, 5, 6, 7, 8, 9];
  const colorOf = (xml: string | undefined, tag: string) => {
    const el = xml && new RegExp(`<${tag}\\b[^>]*>`).exec(xml)?.[0];
    if (!el) return null;
    const rgb = /rgb="(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})"/.exec(el)?.[1];
    if (rgb) return cleanHex(rgb);
    const t = /theme="(\d+)"/.exec(el)?.[1];
    return t !== undefined ? palette[themeIndex[+t]] || null : null;
  };
  const baseFont = /<name val="([^"]+)"/.exec(fonts[0] ?? '')?.[1] ?? choice.font;
  let excel: ExcelLook = { font: baseFont, headFill: null, headText: '111827', headBold: true, border: 'D1D5DB' };
  if (firstCell !== undefined && xfs[+firstCell]) {
    const xf = xfs[+firstCell];
    const font = fonts[+(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0)];
    const fill = fills[+(/fillId="(\d+)"/.exec(xf)?.[1] ?? 0)];
    const solid = fill && /patternType="solid"/.test(fill);
    excel = {
      font: /<name val="([^"]+)"/.exec(font ?? '')?.[1] ?? baseFont,
      headFill: solid ? colorOf(fill, 'fgColor') : null,
      headText: colorOf(font, 'color') ?? '111827',
      headBold: /<b\/>|<b val="(1|true)"\/>/.test(font ?? ''),
      border: 'D1D5DB',
    };
    gelezen.push(
      `Tabelkop: ${excel.headFill ? `vlak #${excel.headFill}` : 'zonder vlak'}, tekst #${excel.headText}${excel.headBold ? ', vet' : ''}, in ${excel.font}`,
    );
    if (excel.headFill) {
      choice.tableHead = excel.headFill;
      // Zonder thema is de kop het enige wat we van de huisstijl weten.
      if (!fromTheme) Object.assign(choice, { heading: excel.headFill, accent: excel.headFill, cover: excel.headFill });
    }
  } else {
    gelezen.push(`Geen opgemaakte kop in het eerste tabblad; de tabelkop krijgt de kleuren van het thema, in ${baseFont}`);
  }
  if (/<pane [^>]*state="frozen"/.test(sheet)) gelezen.push('Bovenste rij staat vast');
  if (/<autoFilter\b/.test(sheet)) gelezen.push('Filter op de kop');
  return { kind, name, bytes, choice: { ...choice, font: fromTheme ? choice.font : baseFont }, excel, gelezen };
}

/** De tekst van een PowerPoint of Excel, voor het afleiden van de opbouw. */
export async function templateText(name: string, bytes: Uint8Array): Promise<string> {
  const kind = templateKindOf(name);
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(bytes);
  const decode = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const order = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0);
  if (kind === 'pptx') {
    return Object.keys(files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => order(a) - order(b))
      .map((p, i) => {
        const paragraphs = [...strFromU8(files[p]).matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
          .map((m) => [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => decode(t[1])).join(''))
          .filter((t) => t.trim());
        return `Dia ${i + 1}\n${paragraphs.join('\n')}`;
      })
      .join('\n\n');
  }
  if (kind === 'xlsx') {
    const shared = files['xl/sharedStrings.xml']
      ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
          [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => decode(t[1])).join(''),
        )
      : [];
    const names = [...strFromU8(files['xl/workbook.xml'] ?? new Uint8Array()).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => decode(m[1]));
    return Object.keys(files)
      .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
      .sort((a, b) => order(a) - order(b))
      .slice(0, 10)
      .map((p, i) => {
        const rows = [...strFromU8(files[p]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 40).map((row) =>
          [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
            .map(([, attrs, inner]) => {
              const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? '';
              if (/t="s"/.test(attrs)) return shared[+v] ?? '';
              if (/t="inlineStr"/.test(attrs)) return [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => decode(t[1])).join('');
              return decode(v);
            })
            .join(' | '),
        );
        return `Tabblad ${names[i] ?? i + 1}\n${rows.filter((r) => r.replace(/[\s|]/g, '')).join('\n')}`;
      })
      .join('\n\n');
  }
  return '';
}
