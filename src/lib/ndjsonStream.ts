// Gedeelde NDJSON-streamlezer voor de edge function.
//
// De edge function streamt vrije-tekstmodi (generate, execute, chat) als
// NDJSON: één JSON-object per regel ({"type":"meta"|"delta"|"done"|"unclear"|
// "error"}). Deze module leest die stream uit en roept `onChunk` aan met de
// tot dan toe opgebouwde tekst, zodat de gebruiker live meeleest.
//
// Hier geëxtraheerd uit optimizeService zodat ook de chat hem kan gebruiken,
// mét ondersteuning voor een AbortSignal (stop-knop): bij afbreken komt de
// deeltekst terug met `aborted: true` in plaats van een kale exception.

/** Callback met de volledige tot-nu-toe opgebouwde (opgeschoonde) tekst. */
export type StreamHandler = (textSoFar: string) => void;

/**
 * Voortgang van een streamende schrijfmodus, los van de tekst zelf. Hiermee kan
 * de UI tonen welk model eraan werkt, of er na een storing is teruggevallen op
 * een ander, en waar we in het proces zijn — zodat een wachttijd zichtbaar iets
 * doet in plaats van stil te staan.
 */
export interface StreamStatus {
  /** Providers die zijn geprobeerd, in volgorde; de laatste is aan het werk. */
  models?: string[];
  /**
   * 'searching' = er wordt eerst op internet gezocht, 'drafting' = het model
   * leest mee, 'thinking' = het redeneert eerst (de denkstand staat aan),
   * 'writing' = de tekst loopt.
   */
  phase?: string;
  /** De provider die de tekst daadwerkelijk levert. */
  provider?: string;
  /**
   * De internetbronnen die het antwoord heeft gekregen. Komt één keer voorbij,
   * direct na het zoeken en dus vóór de eerste tekst. Een lege lijst betekent
   * dat er gezocht is maar niets bruikbaars gevonden.
   */
  sources?: { title: string; url: string }[];
  /**
   * Melding die de gebruiker moet zien, bijvoorbeeld dat zoeken niets opleverde
   * of niet mocht. Kan meer dan eens voorbijkomen.
   */
  notice?: string;
}

/** Callback voor {@link StreamStatus}-updates; elke update bevat één veld. */
export type StatusHandler = (status: StreamStatus) => void;

/** Uitkomst van een streamende aanroep van de edge function. */
export interface StreamOutcome {
  text: string;
  provider?: string;
  unclear?: boolean;
  reason?: string;
  error?: string;
  /** De aanroep is via het AbortSignal afgebroken; `text` bevat de deeltekst. */
  aborted?: boolean;
  /** De bron-URL's die in de eindtekst terugkomen; alleen als er bronnen waren. */
  usedSources?: string[];
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : err instanceof Error && err.name === 'AbortError';
}

/** Eén NDJSON-regel van de edge function; `type` bepaalt wat de rest betekent. */
export type NdjsonEvent = Record<string, unknown> & { type?: string };

/** Uitkomst van {@link readNdjsonEvents}. */
export interface NdjsonReadResult {
  /** De respons was een echte NDJSON-stream en is regel voor regel afgeleverd. */
  streamed: boolean;
  /**
   * Draait er nog een oudere edge function zonder stream-ondersteuning, dan
   * staat hier het gewone JSON-antwoord zodat de aanroeper kan terugvallen.
   */
  json?: unknown;
  /** Via het AbortSignal afgebroken. */
  aborted?: boolean;
}

/**
 * Leest een NDJSON-respons en levert elke regel als los event af.
 *
 * Anders dan {@link streamNdjson} — die alleen tekstfragmenten kent — laat deze
 * lezer de vorm van de events aan de aanroeper. Nodig voor modi die geen vrije
 * tekst maar afgeronde brokjes sturen (de framework-aanbeveling stuurt een
 * samenvatting, losse aanbevelingen en fase-meldingen).
 */
export async function readNdjsonEvents(args: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  onEvent: (event: NdjsonEvent) => void;
  signal?: AbortSignal;
}): Promise<NdjsonReadResult> {
  const { url, headers, body, onEvent, signal } = args;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) return { streamed: false, aborted: true };
    throw err;
  }

  if (!response.ok) {
    let message = `Edge function gaf status ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === 'string' && data.error.trim()) message = data.error;
    } catch {
      /* geen JSON-body — generieke melding volstaat */
    }
    throw new Error(message);
  }

  // Oudere edge function zonder stream-ondersteuning: gewoon één JSON-object.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('ndjson')) {
    return { streamed: false, json: await response.json() };
  }

  if (!response.body) throw new Error('De AI-service gaf geen leesbare stream terug');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed) as NdjsonEvent);
    } catch {
      // Onvolledige of onbekende regel: overslaan, de stream loopt door.
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) return { streamed: true, aborted: true };
    throw err;
  }
  handleLine(buffer); // laatste regel zonder afsluitende newline

  return { streamed: true };
}

/**
 * Roept de edge function streamend aan en leest de NDJSON-respons uit.
 *
 * @param args.tidy   Opschoonfunctie voor de tussenstand (bijv. sterretjes
 *                    weghalen), zodat de live meegelezen tekst er hetzelfde
 *                    uitziet als het eindresultaat.
 * @param args.signal Optioneel AbortSignal; afbreken levert `{aborted: true}`
 *                    met de tot dan toe ontvangen tekst.
 */
export async function streamNdjson(args: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  onChunk: StreamHandler;
  tidy?: (text: string) => string;
  signal?: AbortSignal;
  /** Voortgang naast de tekst: welke modellen meedoen, wie wint, welke fase. */
  onStatus?: StatusHandler;
}): Promise<StreamOutcome> {
  const { url, headers, body, onChunk, signal, onStatus } = args;
  const tidy = args.tidy ?? ((t: string) => t);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) return { text: '', aborted: true };
    throw err;
  }

  if (!response.ok) {
    // Probeer de nette foutmelding uit de JSON-body te halen (bijv. de
    // 401-melding van de chat-modus); anders een generieke statusfout.
    let message = `Edge function gaf status ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (typeof data.error === 'string' && data.error.trim()) message = data.error;
    } catch {
      /* geen JSON-body — generieke melding volstaat */
    }
    throw new Error(message);
  }

  // Draait er nog een oudere edge function, zonder stream-ondersteuning? Die
  // negeert de `stream`-vlag en antwoordt gewoon met één JSON-object. Herken
  // dat aan het content-type en handel het af als een normaal antwoord.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('ndjson')) {
    const data = (await response.json()) as {
      success?: boolean;
      optimized_content?: string;
      output?: string;
      provider?: string;
      unclear?: boolean;
      reason?: string;
      error?: string;
    };
    if (data.unclear) {
      return { text: '', provider: data.provider, unclear: true, reason: data.reason };
    }
    const text = (data.optimized_content ?? data.output ?? '').trim();
    if (text) onChunk(tidy(text));
    return {
      text,
      provider: data.provider,
      error: text ? undefined : (data.error ?? 'De AI-service gaf een leeg antwoord'),
    };
  }

  if (!response.body) throw new Error('De AI-service gaf geen leesbare stream terug');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  const outcome: StreamOutcome = { text: '' };

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: {
      type?: string;
      text?: string;
      provider?: string;
      reason?: string;
      error?: string;
      /** Alleen bij 'models': de providers die tot nu toe zijn geprobeerd. */
      providers?: unknown;
      /** Alleen bij 'phase': waar de generatie is. */
      phase?: string;
      /** Alleen bij 'sources': de geraadpleegde internetbronnen. */
      sources?: unknown;
      /** Alleen bij 'done': de bron-URL's die in de eindtekst staan. */
      usedSources?: unknown;
    };
    try {
      event = JSON.parse(trimmed);
    } catch {
      // Onvolledige of onbekende regel: overslaan, de stream loopt door.
      return;
    }
    switch (event.type) {
      case 'models':
        if (Array.isArray(event.providers)) {
          onStatus?.({ models: event.providers.filter((p): p is string => typeof p === 'string') });
        }
        break;
      case 'phase':
        if (event.phase) onStatus?.({ phase: event.phase });
        break;
      case 'sources':
        if (Array.isArray(event.sources)) {
          onStatus?.({
            sources: event.sources.flatMap((s) => {
              const row = s as { title?: unknown; url?: unknown };
              return typeof row?.url === 'string' && row.url
                ? [{ title: typeof row.title === 'string' ? row.title : row.url, url: row.url }]
                : [];
            }),
          });
        }
        break;
      case 'meta':
        outcome.provider = event.provider;
        onStatus?.({ provider: event.provider });
        break;
      case 'delta':
        accumulated += event.text ?? '';
        onChunk(tidy(accumulated));
        break;
      case 'reset':
        // Tweede ronde: de verbeterde versie begint en vervangt de eerste.
        accumulated = '';
        onChunk('');
        break;
      case 'notice':
        if (event.text) onStatus?.({ notice: event.text });
        break;
      case 'done':
        // De server stuurt de volledige tekst mee; die is leidend boven onze
        // eigen optelsom.
        outcome.text = event.text ?? accumulated;
        if (event.provider) outcome.provider = event.provider;
        if (Array.isArray(event.usedSources)) {
          outcome.usedSources = event.usedSources.filter(
            (u): u is string => typeof u === 'string',
          );
        }
        break;
      case 'unclear':
        outcome.unclear = true;
        outcome.reason = event.reason;
        if (event.provider) outcome.provider = event.provider;
        break;
      case 'error':
        outcome.error = event.error ?? 'Onbekende fout van de AI-service';
        break;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
  } catch (err) {
    // Afgebroken met de stop-knop: de deeltekst is het resultaat.
    if (isAbortError(err) || signal?.aborted) {
      return { ...outcome, text: outcome.text || accumulated, aborted: true };
    }
    throw err;
  }
  // Laatste regel zonder afsluitende newline.
  handleLine(buffer);

  if (!outcome.text) outcome.text = accumulated;
  return outcome;
}
