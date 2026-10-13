/** Trigger een client-side download van tekstinhoud. */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

/**
 * Pakt tekstbestanden in tot een zip en downloadt die. fflate wordt pas bij
 * gebruik geladen, zodat hij buiten de startbundel blijft.
 */
export async function downloadZip(filename: string, files: Record<string, string>): Promise<void> {
  const { zipSync, strToU8 } = await import('fflate');
  const data = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])),
  );
  downloadBlob(filename, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
