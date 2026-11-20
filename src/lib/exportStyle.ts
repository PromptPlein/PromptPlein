// De opmaak van de downloads (Word, PDF, PowerPoint): een letter en een paar
// kleuren. Rijkshuisstijl en Eenvoudig zijn vaste varianten. Een eigen opmaak
// beschrijft de gebruiker in gewone woorden; de AI maakt daar deze paar kleuren
// van, en de rest wordt hier afgeleid, met een controle op contrast zodat tekst
// altijd leesbaar blijft. Een sjabloon levert zijn kleuren en letter via het thema.

/** Wat de gebruiker kiest of de AI voorstelt. Kleuren als hex zonder #. */
export interface StyleChoice {
  font: string;
  /** Titel en koppen. */
  heading: string;
  /** Lijnen, opsommingstekens, citaatstreep en links. */
  accent: string;
  /** De kop van een tabel. */
  tableHead: string;
  /** De achtergrond van de titeldia in PowerPoint; FFFFFF is wit. */
  cover: string;
}

/** De volledige opmaak die de exports lezen. */
export interface ExportStyle {
  font: string;
  heading: string;
  subheading: string;
  text: string;
  muted: string;
  link: string;
  accent: string;
  border: string;
  tableHeadFill: string;
  tableHeadText: string;
  tableBand: string | null;
  codeFill: string;
  quoteBar: string;
  titleRule: string;
  coverFill: string;
  coverText: string;
  coverMuted: string;
  /** Een dunne lijn boven de voettekst. */
  footerRule: boolean;
}

export const RIJK_STYLE: ExportStyle = {
  font: 'Rijks Sans',
  heading: '154273',
  subheading: '01689B',
  text: '1E293B',
  muted: '64748B',
  link: '01689B',
  accent: '154273',
  border: 'CBD5E1',
  tableHeadFill: '154273',
  tableHeadText: 'FFFFFF',
  tableBand: 'F1F5F9',
  codeFill: 'F1F5F9',
  quoteBar: '01689B',
  titleRule: '154273',
  coverFill: '154273',
  coverText: 'FFFFFF',
  coverMuted: 'DCE3EA',
  footerRule: true,
};

export const EENVOUDIG_STYLE: ExportStyle = {
  font: 'Calibri',
  heading: '1F2937',
  subheading: '374151',
  text: '111827',
  muted: '6B7280',
  link: '1D4ED8',
  accent: 'D1D5DB',
  border: 'D1D5DB',
  tableHeadFill: 'F3F4F6',
  tableHeadText: '111827',
  tableBand: null,
  codeFill: 'F3F4F6',
  quoteBar: '9CA3AF',
  titleRule: 'D1D5DB',
  coverFill: 'FFFFFF',
  coverText: '111827',
  coverMuted: '6B7280',
  footerRule: false,
};

/** Letters die op vrijwel elke werkplek staan. Rijks Sans alleen bij de Rijksoverheid. */
export const STYLE_FONTS = [
  'Rijks Sans',
  'Arial',
  'Calibri',
  'Aptos',
  'Verdana',
  'Segoe UI',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Cambria',
  'Times New Roman',
  'Garamond',
] as const;

const SERIF = /georgia|cambria|times|garamond|book antiqua|palatino|serif/i;

/** Schreefletter of niet: de PDF kent alleen Helvetica en Times. */
export function isSerif(font: string): boolean {
  return SERIF.test(font) && !/sans/i.test(font);
}

// --- Kleuren en contrast ---

export function cleanHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(hex)) return hex;
  if (/^[0-9A-F]{3}$/.test(hex)) return hex.split('').map((c) => c + c).join('');
  return null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Mengt een kleur met een andere; amount 0 is de eerste, 1 de tweede. */
function mix(hex: string, other: string, amount: number): string {
  const a = channels(hex);
  const b = channels(other);
  return a
    .map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Maakt een kleur donkerder tot hij op wit minstens `ratio` haalt. */
function readableOnWhite(hex: string, ratio = 4.5): string {
  let color = hex;
  for (let i = 0; i < 20 && contrast(color, 'FFFFFF') < ratio; i++) color = mix(color, '000000', 0.12);
  return color;
}

/** Wit of bijna zwart, wat het best leesbaar is op deze achtergrond. */
function textOn(fill: string): string {
  return contrast('FFFFFF', fill) >= contrast('111827', fill) ? 'FFFFFF' : '111827';
}

/** De hele opmaak uit de paar keuzes, met leesbare tekst in alle combinaties. */
export function styleFrom(choice: StyleChoice): ExportStyle {
  const heading = readableOnWhite(choice.heading);
  const accent = choice.accent;
  const link = readableOnWhite(accent);
  const lightAccent = contrast(accent, 'FFFFFF') < 1.6;
  const coverFill = choice.cover;
  const coverText = textOn(coverFill);
  return {
    font: choice.font,
    heading,
    subheading: readableOnWhite(mix(heading, accent, 0.4)),
    text: '1E293B',
    muted: '64748B',
    link,
    accent: lightAccent ? mix(accent, '000000', 0.25) : accent,
    border: mix(accent, 'FFFFFF', 0.7),
    tableHeadFill: choice.tableHead,
    tableHeadText: textOn(choice.tableHead),
    tableBand: mix(choice.tableHead, 'FFFFFF', 0.92),
    codeFill: 'F3F4F6',
    quoteBar: accent,
    titleRule: lightAccent ? mix(accent, '000000', 0.25) : accent,
    coverFill,
    coverText,
    coverMuted: coverText === 'FFFFFF' ? mix(coverFill, 'FFFFFF', 0.8) : '64748B',
    footerRule: true,
  };
}

/** Een keuze uit wat de AI of een oude opslag teruggaf; null als het geen geldige keuze is. */
export function cleanChoice(raw: unknown): StyleChoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const heading = cleanHex(r.heading);
  if (!heading) return null;
  const accent = cleanHex(r.accent) ?? heading;
  const font =
    typeof r.font === 'string' && r.font.trim()
      ? (STYLE_FONTS.find((f) => f.toLowerCase() === r.font!.toString().trim().toLowerCase()) ?? r.font.toString().trim().slice(0, 40))
      : 'Arial';
  return {
    font,
    heading,
    accent,
    tableHead: cleanHex(r.tableHead) ?? heading,
    cover: cleanHex(r.cover) ?? 'FFFFFF',
  };
}

/** De keuze die bij een vaste variant hoort, als begin voor bijstellen. */
export const RIJK_CHOICE: StyleChoice = {
  font: 'Rijks Sans',
  heading: '154273',
  accent: '01689B',
  tableHead: '154273',
  cover: '154273',
};

// --- Uit het thema van een sjabloon ---

function themeColor(themeXml: string, name: string): string | null {
  const block = new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`).exec(themeXml)?.[1];
  if (!block) return null;
  return cleanHex(/srgbClr val="([0-9A-Fa-f]{6})"/.exec(block)?.[1]) ?? cleanHex(/lastClr="([0-9A-Fa-f]{6})"/.exec(block)?.[1]);
}

/**
 * Leest de kleuren en de letter uit het thema van een Word- of PowerPoint-
 * sjabloon. Koppen krijgen de tweede donkere themakleur, tenzij die zwart of
 * grijs is: dan de eerste accentkleur.
 */
export function choiceFromTheme(themeXml: string): StyleChoice | null {
  const accent1 = themeColor(themeXml, 'accent1');
  const dk2 = themeColor(themeXml, 'dk2');
  if (!accent1 && !dk2) return null;
  const colorful = (hex: string | null) => {
    if (!hex) return false;
    const [r, g, b] = channels(hex);
    return Math.max(r, g, b) - Math.min(r, g, b) > 40;
  };
  const heading = colorful(dk2) ? dk2! : (accent1 ?? dk2!);
  const minor = /<a:minorFont>\s*<a:latin typeface="([^"]+)"/.exec(themeXml)?.[1];
  const major = /<a:majorFont>\s*<a:latin typeface="([^"]+)"/.exec(themeXml)?.[1];
  return {
    font: minor || major || 'Arial',
    heading,
    accent: accent1 ?? heading,
    tableHead: accent1 ?? heading,
    cover: heading,
  };
}

/** Het thema uit een Word- of PowerPoint-sjabloon, als keuze. Null als er geen thema in zit. */
export async function choiceFromTemplate(bytes: Uint8Array): Promise<StyleChoice | null> {
  try {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(bytes, { filter: (f) => /^(word|ppt)\/theme\/theme\d*\.xml$/.test(f.name) });
    const name = Object.keys(files).sort()[0];
    return name ? choiceFromTheme(strFromU8(files[name])) : null;
  } catch {
    return null;
  }
}
