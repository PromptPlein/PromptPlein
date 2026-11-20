// Markdown en CSV uit een chatantwoord, in de browser. Markdown is het antwoord
// zoals de AI het schreef, met de bronnen eronder. CSV zijn de tabellen, met een
// puntkomma ertussen: zo opent een Nederlandse Excel ze meteen in kolommen.

import { documentBaseName, readAnswer } from './answerDocument';
import { findTables } from './excelExport';
import { zipOffice } from './officeXml';

export interface ExportFile {
  data: Uint8Array;
  fileName: string;
  mime: string;
}

export interface ExportInput {
  markdown: string;
  sources?: { title: string; url: string }[];
}

const encoder = new TextEncoder();

/** Het antwoord als .md, met de internetbronnen als genummerde lijst eronder. */
export function buildMarkdown({ markdown, sources }: ExportInput): ExportFile {
  let text = markdown.trim();
  if (sources?.length) {
    text +=
      '\n\n## Bronnen\n\n' +
      sources.map((s, i) => `${i + 1}. [${s.title.replace(/[[\]]/g, '')}](${s.url})`).join('\n');
  }
  return {
    data: encoder.encode(`${text}\n`),
    fileName: `${documentBaseName(readAnswer(markdown), markdown)}.md`,
    mime: 'text/markdown',
  };
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Tekens die een spreadsheet als formule leest, krijgen een apostrof ervoor. */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value;
}

function csvText(header: string[], rows: string[][]): string {
  // De BOM zegt tegen Excel dat het UTF-8 is, anders worden é en ë rare tekens.
  return '﻿' + [header, ...rows].map((row) => row.map((c) => csvCell(safeCell(c))).join(';')).join('\r\n') + '\r\n';
}

/**
 * De tabellen als CSV. Eén tabel wordt één .csv; meer tabellen gaan samen in een
 * zip, want een CSV-bestand kent maar één tabel. Null als er geen tabel is.
 */
export async function buildCsv(markdown: string): Promise<ExportFile | null> {
  const tables = findTables(markdown);
  if (!tables.length) return null;
  const base = documentBaseName(readAnswer(markdown), markdown);
  if (tables.length === 1) {
    return {
      data: encoder.encode(csvText(tables[0].header, tables[0].rows)),
      fileName: `${base}.csv`,
      mime: 'text/csv',
    };
  }
  const used = new Set<string>();
  const files: Record<string, string> = {};
  tables.forEach((table, i) => {
    let name = (table.name || `Tabel ${i + 1}`).replace(/[\\/:*?"<>|#%]+/g, ' ').trim().slice(0, 50) || `Tabel ${i + 1}`;
    let n = 2;
    const stem = name;
    while (used.has(name.toLowerCase())) name = `${stem} ${n++}`;
    used.add(name.toLowerCase());
    files[`${name}.csv`] = csvText(table.header, table.rows);
  });
  return { data: await zipOffice(files), fileName: `${base} (tabellen).zip`, mime: 'application/zip' };
}
