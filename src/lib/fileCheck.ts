// Controle van een bestand dat de AI heeft geschreven, direct nadat het af is.
// Een HTML-pagina met één scriptfout blijft leeg zodra je hem opent (het hele
// script valt dan weg), en dat zag je pas na het downloaden. Daarom draait elke
// pagina eerst onzichtbaar in een afgeschermd frame: elke fout die daar opduikt,
// komt met regelnummer terug. Andere codeblokken (JSON, JavaScript, SVG) krijgen
// een snelle controle zonder ze uit te voeren.

export interface FileProblem {
  /** Regelnummer in het bestand, als de browser het geeft. */
  line?: number;
  message: string;
  /** De regel zelf, ingekort, zodat je ziet waar het misgaat. */
  snippet?: string;
}

export interface FileCheckResult {
  ok: boolean;
  problems: FileProblem[];
}

/** Zo lang mag de pagina na het laden nog fouten melden (opstartcode, timers). */
const NA_LADEN_MS = 1500;
/** Vangnet als de pagina nooit klaar meldt (oneindige lus, geblokkeerd laden). */
const MAX_WACHT_MS = 8000;

function regel(code: string, line?: number): string | undefined {
  if (!line) return undefined;
  const tekst = code.split('\n')[line - 1]?.trim();
  if (!tekst) return undefined;
  return tekst.length > 140 ? `${tekst.slice(0, 137)}…` : tekst;
}

/**
 * Het meldscript komt op dezelfde regel als de openingstag, zonder regeleinden,
 * zodat de regelnummers van de fouten gelijk blijven aan die in het bestand.
 */
const MELDER =
  '<script>(function(){var m=function(t,l){parent.postMessage({__ppCheck:1,message:String(t),line:l||0},"*")};' +
  'addEventListener("error",function(e){m(e.message,e.lineno)});' +
  'addEventListener("unhandledrejection",function(e){var r=e.reason;m("Onafgehandelde fout: "+(r&&r.message?r.message:r),0)});' +
  'addEventListener("load",function(){setTimeout(function(){parent.postMessage({__ppCheck:2},"*")},' +
  NA_LADEN_MS +
  ')})})();</script>';

function metMelder(code: string): string {
  const head = /<head[^>]*>/i.exec(code);
  if (head) return code.slice(0, head.index + head[0].length) + MELDER + code.slice(head.index + head[0].length);
  const html = /<html[^>]*>/i.exec(code);
  if (html) return code.slice(0, html.index + html[0].length) + MELDER + code.slice(html.index + html[0].length);
  return MELDER + code;
}

/**
 * Draait een HTML-pagina onzichtbaar en verzamelt de fouten. Het frame krijgt
 * alleen `allow-scripts`: de pagina kan niet bij de opslag of de sessie van
 * PromptPlein, en wordt na de controle weer weggehaald.
 */
export function checkHtml(code: string): Promise<FileCheckResult> {
  return new Promise((resolve) => {
    const problems: FileProblem[] = [];
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    // Op ware grootte, want veel pagina's meten hun eigen opmaak bij het starten.
    frame.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1280px;height:800px;border:0;visibility:hidden;pointer-events:none';

    let klaar = false;
    const afronden = () => {
      if (klaar) return;
      klaar = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(vangnet);
      frame.remove();
      if (!/<\/html>\s*$/i.test(code.trim())) {
        problems.push({ message: 'Het bestand houdt halverwege op: de afsluitende </html> ontbreekt.' });
      }
      // Dezelfde fout kan bij elke animatieronde opnieuw komen; één keer is genoeg.
      const uniek = problems.filter(
        (p, i) => problems.findIndex((q) => q.message === p.message && q.line === p.line) === i,
      );
      resolve({ ok: uniek.length === 0, problems: uniek.slice(0, 5) });
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      const data = e.data as { __ppCheck?: number; message?: string; line?: number } | null;
      if (!data || !data.__ppCheck) return;
      if (data.__ppCheck === 2) {
        afronden();
        return;
      }
      const line = data.line || undefined;
      problems.push({ line, message: data.message ?? 'Onbekende fout', snippet: regel(code, line) });
    };
    const vangnet = window.setTimeout(afronden, MAX_WACHT_MS);
    window.addEventListener('message', onMessage);
    frame.srcdoc = metMelder(code);
    document.body.appendChild(frame);
  });
}

/**
 * Snelle controle van een codeblok zonder het uit te voeren. Null = voor deze
 * taal is er geen controle.
 */
export function checkCode(lang: string, code: string): FileCheckResult | null {
  const taal = lang.toLowerCase();
  try {
    if (taal === 'json') {
      JSON.parse(code);
      return { ok: true, problems: [] };
    }
    if (taal === 'js' || taal === 'javascript') {
      // Modules (import/export) kan Function niet lezen; die slaan we over.
      if (/^\s*(import|export)\s/m.test(code)) return null;
      // Alleen ontleden: Function voert de code pas uit als je hem aanroept.
      new Function(code);
      return { ok: true, problems: [] };
    }
    if (taal === 'svg' || taal === 'xml') {
      const doc = new DOMParser().parseFromString(code, 'image/svg+xml');
      const fout = doc.querySelector('parsererror');
      if (fout) {
        return { ok: false, problems: [{ message: fout.textContent?.trim().split('\n')[0] ?? 'Ongeldige opmaak' }] };
      }
      return { ok: true, problems: [] };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const pos = /position (\d+)/.exec(message);
    const line = pos ? code.slice(0, Number(pos[1])).split('\n').length : undefined;
    return { ok: false, problems: [{ message, line, snippet: regel(code, line) }] };
  }
  return null;
}

/** Het bericht waarmee de chat de AI vraagt een gevonden fout te herstellen. */
export function repairRequest(fileName: string, problems: FileProblem[]): string {
  const lijst = problems
    .map((p) => {
      const waar = p.line ? `regel ${p.line}: ` : '';
      const code = p.snippet ? `\n  ${p.snippet}` : '';
      return `- ${waar}${p.message}${code}`;
    })
    .join('\n');
  return `In ${fileName} zitten fouten die de pagina breken:\n${lijst}\n\nHerstel deze fouten en geef het volledige, gecorrigeerde bestand in één codeblok.`;
}
