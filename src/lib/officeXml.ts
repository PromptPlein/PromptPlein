// Kleine hulpstukken voor het schrijven van Office-bestanden (Word en Excel).
// Een .docx en een .xlsx zijn een zip met XML; meer is er niet nodig.

/** Maakt tekst veilig voor XML en haalt tekens weg die Word weigert. */
export function xmlEscape(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Pakt de onderdelen in tot een Office-bestand. fflate laadt pas bij gebruik. */
export async function zipOffice(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(entries, { level: 6 });
}

/** Een bestandsnaam uit een titel, zonder tekens die Windows weigert. */
export function fileNameFrom(title: string, fallback: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|#%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return clean || fallback;
}

/** De datum van vandaag zoals in een Nederlands document: 17 november 2026. */
export function todayLong(): string {
  return new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}
