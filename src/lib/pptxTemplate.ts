// Een presentatie in het eigen PowerPoint-sjabloon van de gebruiker. We houden
// alles van het sjabloon (thema, diamodel, indelingen, logo's) en halen alleen de
// voorbeelddia's eruit. De nieuwe dia's gebruiken de indelingen van het sjabloon
// zelf: de titeldia voor de titel, "Titel en inhoud" voor de rest. Letter, kleur
// en opsommingstekens zetten we bewust niet, die komen uit het sjabloon.

import { readAnswer, documentBaseName } from './answerDocument';
import { inlineRuns, type InlineRun } from './markdownBlocks';
import { todayLong, XML_HEAD, xmlEscape } from './officeXml';
import { columnWidths, Links, planSlides, PPTX_MIME, tableFontSize, type SlideSpec, type TextItem } from './pptxExport';
import type { ExportFile, ExportInput } from './textExport';

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PT = 12700;
/** Grotere letters dan dit zetten we terug, anders past er per dia bijna niets op. */
const MAX_BODY_SIZE = 20;

export class PptxTemplateError extends Error {}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  path: string;
  xml: string;
  type: string;
}

/** Het pad van een onderdeel, vanuit de map van het bestand dat ernaar verwijst. */
function resolvePath(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

function relsPath(part: string): string {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

function relationships(xml: string): { id: string; type: string; target: string }[] {
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => ({
    id: /\bId="([^"]+)"/.exec(m[0])?.[1] ?? '',
    type: /\bType="([^"]+)"/.exec(m[0])?.[1] ?? '',
    target: /\bTarget="([^"]+)"/.exec(m[0])?.[1] ?? '',
  }));
}

/** De vormen met een plaatshouder, met de plaatshouder en de positie als die er staat. */
function placeholders(xml: string): { ph: string; type: string; idx: string; rect: Rect | null; sp: string }[] {
  return [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
    .map((m) => {
      const ph = /<p:ph\b[^>]*\/?>/.exec(m[0])?.[0];
      if (!ph) return null;
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(m[0]);
      return {
        ph: ph.endsWith('/>') ? ph : ph.replace(/>$/, '/>'),
        type: /\btype="([^"]+)"/.exec(ph)?.[1] ?? 'obj',
        idx: /\bidx="([^"]+)"/.exec(ph)?.[1] ?? '0',
        rect: off ? { x: +off[1], y: +off[2], w: +off[3], h: +off[4] } : null,
        sp: m[0],
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null && !/orient="vert"/.test(p.ph));
}

const isTitle = (type: string) => type === 'title' || type === 'ctrTitle';
const isBody = (type: string) => type === 'obj' || type === 'body';

/** De positie van een plaatshouder; staat die niet in de indeling, dan uit het diamodel. */
function rectOf(layout: string, master: string, want: (type: string) => boolean): Rect | null {
  const own = placeholders(layout).find((p) => want(p.type));
  if (own?.rect) return own.rect;
  const fromMaster = placeholders(master).find((p) => want(p.type) || (isBody(p.type) && want('obj')));
  return fromMaster?.rect ?? null;
}

/** De lettergrootte van de tekst op het eerste niveau, in punten. */
function bodySize(layout: string, master: string): number {
  const body = placeholders(layout).find((p) => isBody(p.type));
  const own = body && /<a:lvl1pPr[^>]*>[\s\S]*?<a:defRPr[^>]*\bsz="(\d+)"/.exec(body.sp)?.[1];
  const fromMaster = /<p:bodyStyle>\s*<a:lvl1pPr[^>]*>[\s\S]*?<a:defRPr[^>]*\bsz="(\d+)"/.exec(master)?.[1];
  return Number(own ?? fromMaster ?? 1800) / 100;
}

// --- Tekst zonder eigen kleur of letter: die komen uit het sjabloon ---

function runXml(run: InlineRun, links: Links, size: number | null, extra: { bold?: boolean; italic?: boolean; code?: boolean }): string {
  const bold = extra.bold || run.bold;
  const italic = extra.italic || run.italic;
  const code = extra.code || run.code;
  const attrs = `lang="nl-NL"${size ? ` sz="${Math.round(size * 100)}"` : ''}${bold ? ' b="1"' : ''}${italic ? ' i="1"' : ''} dirty="0"`;
  const font = code ? '<a:latin typeface="Consolas"/><a:cs typeface="Consolas"/>' : '';
  const link = run.link ? `<a:hlinkClick r:id="${links.id(run.link)}"/>` : '';
  return `<a:r><a:rPr ${attrs}>${font}${link}</a:rPr><a:t>${xmlEscape(run.text)}</a:t></a:r>`;
}

function runsXml(text: string, links: Links, size: number | null, extra: { bold?: boolean; italic?: boolean; code?: boolean } = {}): string {
  const runs = extra.code ? [{ text: text || ' ' }] : inlineRuns(text);
  return runs.filter((r) => r.text).map((r) => runXml(r, links, size, extra)).join('');
}

function itemXml(item: TextItem, links: Links, size: number | null): string {
  let pPr: string;
  if (item.bullet === 'dot') pPr = `<a:pPr lvl="${Math.min(item.level, 4)}"/>`;
  else if (item.bullet === 'num')
    pPr = `<a:pPr lvl="${Math.min(item.level, 4)}"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="${item.number ?? 1}"/></a:pPr>`;
  else pPr = `<a:pPr marL="0" indent="0"${item.code ? '><a:spcBef><a:spcPts val="0"/></a:spcBef>' : '>'}<a:buNone/></a:pPr>`;
  const runs = runsXml(item.text, links, item.code ? 12 : size, { bold: item.bold, italic: item.italic, code: item.code });
  return `<a:p>${pPr}${runs}<a:endParaRPr lang="nl-NL" dirty="0"/></a:p>`;
}

const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

/** Een vorm in een plaatshouder van de indeling, met de positie en opmaak van het sjabloon. */
function placeholderShape(id: number, name: string, ph: string, paragraphs: string, autofit = true): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr>` +
    `<p:spPr/><p:txBody><a:bodyPr>${autofit ? '<a:normAutofit/>' : ''}</a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
  );
}

function tableFrame(id: number, spec: NonNullable<SlideSpec['table']>, rect: Rect, styleId: string, links: Links): string {
  const widths = columnWidths(spec.header, spec.rows, rect.w);
  const size = tableFontSize(spec.header.length);
  const rowH = Math.round(size * 1.2 * PT + 128016);
  const cell = (text: string, c: number, head: boolean) => {
    const align = spec.align[c] === 'right' ? 'r' : spec.align[c] === 'center' ? 'ctr' : 'l';
    return (
      `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${align}"/>${runsXml(text, links, size, { bold: head })}<a:endParaRPr lang="nl-NL" dirty="0"/></a:p></a:txBody>` +
      '<a:tcPr marL="91440" marR="91440" marT="64008" marB="64008"/></a:tc>'
    );
  };
  const rows = [spec.header, ...spec.rows]
    .map((row, r) => `<a:tr h="${rowH}">${spec.header.map((_, c) => cell(row[c] ?? '', c, r === 0)).join('')}</a:tr>`)
    .join('');
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabel ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${rect.x}" y="${rect.y}"/><a:ext cx="${rect.w}" cy="${rowH * (spec.rows.length + 1)}"/></p:xfrm>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
    `<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>${styleId}</a:tableStyleId></a:tblPr>` +
    `<a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows}</a:tbl>` +
    '</a:graphicData></a:graphic></p:graphicFrame>'
  );
}

function slideXml(shapes: string): string {
  return (
    XML_HEAD +
    `<p:sld ${NS}><p:cSld><p:spTree>${GROUP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

interface TemplateParts {
  files: Record<string, Uint8Array>;
  text: (path: string) => string;
  masterPath: string;
  master: string;
  layouts: Layout[];
}

async function openTemplate(template: Uint8Array): Promise<TemplateParts> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(template);
  } catch {
    throw new PptxTemplateError('Dit is geen PowerPoint-bestand.');
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  if (!text('ppt/presentation.xml')) throw new PptxTemplateError('Dit is geen PowerPoint-bestand.');
  const presRels = relationships(text('ppt/_rels/presentation.xml.rels'));
  const masterRel = presRels.find((r) => r.type === `${REL}/slideMaster`);
  if (!masterRel) throw new PptxTemplateError('Dit sjabloon heeft geen diamodel.');
  const masterPath = resolvePath('ppt/presentation.xml', masterRel.target);
  const master = text(masterPath);
  const layouts = relationships(text(relsPath(masterPath)))
    .filter((r) => r.type === `${REL}/slideLayout`)
    .map((r) => {
      const path = resolvePath(masterPath, r.target);
      const xml = text(path);
      return { path, xml, type: /<p:sldLayout\b[^>]*\btype="([^"]+)"/.exec(xml)?.[1] ?? 'cust' };
    })
    .filter((l) => l.xml);
  return { files, text, masterPath, master, layouts };
}

function pickLayouts(layouts: Layout[]) {
  const hasTitle = (l: Layout) => placeholders(l.xml).some((p) => isTitle(p.type));
  const hasBody = (l: Layout) => placeholders(l.xml).some((p) => isBody(p.type) && p.idx !== '0');
  const content =
    layouts.find((l) => l.type === 'obj') ??
    layouts.find((l) => l.type === 'tx') ??
    layouts.find((l) => hasTitle(l) && hasBody(l));
  const cover = layouts.find((l) => l.type === 'title') ?? content;
  const tableLayout = layouts.find((l) => l.type === 'titleOnly') ?? content;
  return { content, cover, tableLayout };
}

/** Is dit een sjabloon waar we dia's in kunnen maken? Een melding als dat niet zo is. */
export async function checkPptxTemplate(template: Uint8Array): Promise<string | null> {
  try {
    const parts = await openTemplate(template);
    if (!pickLayouts(parts.layouts).content) {
      return 'Dit sjabloon heeft geen dia-indeling met een titel en tekst, zoals "Titel en inhoud".';
    }
    return null;
  } catch (error) {
    return error instanceof PptxTemplateError ? error.message : 'Dit sjabloon kon niet worden gelezen.';
  }
}

/** De themakleuren en letter van het sjabloon, voor PDF en Word zonder eigen sjabloon. */
export async function pptxTheme(template: Uint8Array): Promise<string | null> {
  try {
    const parts = await openTemplate(template);
    const themeRel = relationships(parts.text(relsPath(parts.masterPath))).find((r) => r.type === `${REL}/theme`);
    return themeRel ? parts.text(resolvePath(parts.masterPath, themeRel.target)) || null : null;
  } catch {
    return null;
  }
}

export async function buildPptxFromTemplate(input: ExportInput, template: Uint8Array): Promise<ExportFile> {
  const { zipSync, strToU8 } = await import('fflate');
  const parts = await openTemplate(template);
  const { content, cover, tableLayout } = pickLayouts(parts.layouts);
  if (!content || !cover || !tableLayout) {
    throw new PptxTemplateError('Je PowerPoint-sjabloon heeft geen dia-indeling met een titel en tekst.');
  }

  const bodyPh = placeholders(content.xml).find((p) => isBody(p.type) && p.idx !== '0')!;
  const bodyRect = rectOf(content.xml, parts.master, isBody);
  const slideCx = Number(/<p:sldSz cx="(\d+)"/.exec(parts.text('ppt/presentation.xml'))?.[1] ?? 12192000);
  const rect: Rect = bodyRect ?? { x: Math.round(slideCx * 0.06), y: 1600000, w: Math.round(slideCx * 0.88), h: 4500000 };
  const templateSize = bodySize(content.xml, parts.master);
  const size = Math.min(templateSize, MAX_BODY_SIZE);
  const explicitSize = templateSize > MAX_BODY_SIZE ? size : null;
  const { title, slides } = planSlides(input, { width: rect.w, budget: (rect.h / PT) * 0.92, bodySize: size, codeSize: 12 });

  const coverPhs = placeholders(cover.xml);
  const coverTitle = coverPhs.find((p) => isTitle(p.type));
  const coverSub = coverPhs.find((p) => p.type === 'subTitle' || (isBody(p.type) && p.idx !== '0'));
  const titleOf = (layout: Layout) => placeholders(layout.xml).find((p) => isTitle(p.type))?.ph ?? '<p:ph type="title"/>';
  const styleId =
    /<a:tblStyleLst[^>]*\bdef="(\{[^"]+\})"/.exec(parts.text('ppt/tableStyles.xml'))?.[1] ?? '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}';
  const para = (text: string) =>
    `<a:p>${runsXml(text, new Links(), null)}<a:endParaRPr lang="nl-NL" dirty="0"/></a:p>`;

  const made: { xml: string; layout: Layout; links: Links }[] = [];
  {
    const links = new Links();
    let shapes = '';
    if (coverTitle) shapes += placeholderShape(2, 'Titel', coverTitle.ph, para(title));
    if (coverSub) shapes += placeholderShape(3, 'Ondertitel', coverSub.ph, para(`PromptPlein, ${todayLong()}`));
    made.push({ xml: slideXml(shapes), layout: cover, links });
  }
  for (const spec of slides) {
    const links = new Links();
    const layout = spec.table && !spec.items.length ? tableLayout : content;
    let shapes = placeholderShape(2, 'Titel', titleOf(layout), `<a:p>${runsXml(spec.title, links, null)}<a:endParaRPr lang="nl-NL" dirty="0"/></a:p>`);
    if (spec.items.length) {
      shapes += placeholderShape(3, 'Inhoud', bodyPh.ph, spec.items.map((item) => itemXml(item, links, explicitSize)).join(''));
    }
    if (spec.table) shapes += tableFrame(4, spec.table, rect, styleId, links);
    made.push({ xml: slideXml(shapes), layout, links });
  }

  // --- Het pakket: voorbeelddia's eruit, onze dia's erin ---
  const out: Record<string, Uint8Array> = {};
  const skip = /^ppt\/(slides|notesSlides|comments)\//;
  for (const [path, data] of Object.entries(parts.files)) if (!skip.test(path)) out[path] = data;

  let types = parts.text('[Content_Types].xml')
    .replace(/<Override PartName="\/ppt\/(slides|notesSlides|comments)\/[^"]*"[^>]*\/>/g, '')
    .replace(/presentationml\.(template|slideshow)\.main\+xml/g, 'presentationml.presentation.main+xml');
  let presRels = parts.text('ppt/_rels/presentation.xml.rels').replace(
    /<Relationship\b[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slide"[^>]*\/>/g,
    '',
  );
  let pres = parts.text('ppt/presentation.xml')
    .replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\/>/, '')
    .replace(/<p:custShowLst>[\s\S]*?<\/p:custShowLst>/, '')
    // Secties verwijzen naar de oude dia's; PowerPoint wil het bestand dan repareren.
    .replace(/<p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}">[\s\S]*?<\/p:ext>/, '');

  const slideIds: string[] = [];
  made.forEach((slide, i) => {
    const n = i + 1;
    const path = `ppt/slides/slide${n}.xml`;
    out[path] = strToU8(slide.xml);
    const layoutTarget = `../slideLayouts/${slide.layout.path.split('/').pop()}`;
    out[relsPath(path)] = strToU8(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${REL}/slideLayout" Target="${layoutTarget}"/>` +
        slide.links.targets
          .map((url, j) => `<Relationship Id="rIdL${j + 1}" Type="${REL}/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`)
          .join('') +
        '</Relationships>',
    );
    types = types.replace(
      '</Types>',
      `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    );
    presRels = presRels.replace(
      '</Relationships>',
      `<Relationship Id="rIdPP${n}" Type="${REL}/slide" Target="slides/slide${n}.xml"/></Relationships>`,
    );
    slideIds.push(`<p:sldId id="${255 + n}" r:id="rIdPP${n}"/>`);
  });
  pres = pres.replace(/<p:sldSz\b/, `<p:sldIdLst>${slideIds.join('')}</p:sldIdLst><p:sldSz`);

  out['[Content_Types].xml'] = strToU8(types);
  out['ppt/_rels/presentation.xml.rels'] = strToU8(presRels);
  out['ppt/presentation.xml'] = strToU8(pres);
  out['docProps/app.xml'] = strToU8(
    XML_HEAD +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>PromptPlein</Application><Slides>${made.length}</Slides></Properties>`,
  );
  if (out['docProps/core.xml']) {
    const core = parts.text('docProps/core.xml');
    out['docProps/core.xml'] = strToU8(
      /<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/.test(core)
        ? core.replace(/<dc:title>[\s\S]*?<\/dc:title>|<dc:title\/>/, `<dc:title>${xmlEscape(title)}</dc:title>`)
        : core,
    );
  }

  // [Content_Types].xml vooraan, zoals Office het zelf schrijft.
  const ordered: Record<string, Uint8Array> = { '[Content_Types].xml': out['[Content_Types].xml'] };
  for (const [path, data] of Object.entries(out)) if (path !== '[Content_Types].xml') ordered[path] = data;
  const data = zipSync(ordered, { level: 6 });
  const read = readAnswer(input.markdown);
  return { data, fileName: `${documentBaseName(read, input.markdown)}.pptx`, mime: PPTX_MIME };
}
