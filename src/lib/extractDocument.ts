/**
 * Haalt platte tekst uit een geüpload document, zodat de AI het volledig kan
 * doorlezen en de layout/structuur kan analyseren. Ondersteunt .txt/.md (direct),
 * .pdf (via pdfjs) en .docx (via mammoth). De zware libraries worden pas dynamisch
 * geladen wanneer er echt een PDF of Word-bestand wordt geüpload, zodat de
 * hoofdbundel licht blijft.
 */

/** Maximale bestandsgrootte (10 MB) — grotere bestanden weigeren we vriendelijk. */
const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_DOC_ACCEPT =
  '.txt,.md,.markdown,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ExtractedDocument {
  name: string;
  /** De geëxtraheerde platte tekst. */
  text: string;
  /** Aantal tekens — handig om de gebruiker te tonen hoeveel is ingelezen. */
  chars: number;
}

/** Bepaalt het type op basis van extensie (betrouwbaarder dan de MIME-type van de browser). */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Extraheer de tekst uit één bestand. Gooit een Error met een begrijpelijke
 * (Nederlandse) melding bij een niet-ondersteund type, een te groot bestand of
 * een leesfout.
 */
export async function extractDocument(
  file: File,
  maxBytes: number = MAX_DOC_BYTES,
): Promise<ExtractedDocument> {
  if (file.size > maxBytes) {
    throw new Error(`"${file.name}" is te groot (max. ${maxBytes / (1024 * 1024)} MB).`);
  }
  const ext = extensionOf(file.name);

  let text: string;
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
    text = await file.text();
  } else if (ext === '.pdf') {
    text = await extractPdf(file);
  } else if (ext === '.docx') {
    text = await extractDocx(file);
  } else {
    throw new Error(`"${file.name}" heeft een niet-ondersteund type. Gebruik .txt, .md, .pdf of .docx.`);
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`Uit "${file.name}" kon geen tekst worden gehaald (mogelijk een scan zonder tekstlaag).`);
  }
  return { name: file.name, text: trimmed, chars: trimmed.length };
}

/** Extraheer alle tekst uit een PDF, pagina voor pagina, met pdfjs. */
async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Laad de pdfjs-worker via het door Vite native ondersteunde worker-URL-patroon
  // (`new Worker(new URL(...), { type: 'module' })`). Dat is betrouwbaarder dan
  // `?url`, dat op .mjs-modules in dev de broncode i.p.v. een URL teruggaf en de
  // worker liet mislukken. We geven de worker als `workerPort` aan pdfjs mee.
  const worker = new Worker(new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url), {
    type: 'module',
  });
  pdfjs.GlobalWorkerOptions.workerPort = worker;

  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await readPdfPages(pdfjs, data);
  } finally {
    // De worker netjes opruimen na gebruik.
    worker.terminate();
  }
}

/** Leest alle pagina's van een geladen PDF uit tot platte tekst. */
async function readPdfPages(
  pdfjs: typeof import('pdfjs-dist'),
  data: Uint8Array,
): Promise<string> {
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }
  return pages.join('\n\n');
}

/** Extraheer de tekst uit een .docx-bestand met mammoth. */
async function extractDocx(file: File): Promise<string> {
  // Import de hoofd-entry: Vite past mammoth's `browser`-veld toe zodat de
  // node-only delen (unzip) door browser-varianten worden vervangen.
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
