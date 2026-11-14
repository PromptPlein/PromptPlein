// Chatprojecten: een map met een projectinstructie en bronbestanden, waaronder
// gesprekken draaien.
//
// DE SCHEIDSLIJN MET chatStorage.ts
// Gesprekken staan uitsluitend op het apparaat (localStorage) en verdwijnen bij
// uitloggen. Een PROJECT is het tegenovergestelde: langlopend werk dat de
// gebruiker op elk apparaat terugverwacht en niet mag kwijtraken als hij zijn
// browser wist. Alleen de bron — instructie plus de tekst van de bestanden —
// staat daarom in de database (`chat_projects` / `chat_project_files`); geen
// enkele chatbeurt.
//
// RLS is de poort: elke query hieronder ziet alleen de rijen van de ingelogde
// gebruiker (migratie 0030). De filters hier zijn dus geen beveiliging maar
// alleen bedoeld om minder data op te halen.

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { analyzeProjectContext } from '@/services/optimizeService';
import { getAiSettings } from '@/services/settingsService';
import type { AiProvider } from '@/config/aiModels';
import type { ChatProject, ChatProjectContext, ChatProjectFile } from '@/types';

/** Maximum aantal bronbestanden per project. */
export const MAX_PROJECT_FILES = 50;

/** Maximale grootte van een bronbestand op schijf; de tekst eruit is veel kleiner. */
export const MAX_PROJECT_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Maximale tekstomvang per bronbestand. Spiegel van de CHECK-constraint
 * `chat_project_files_text_len` (0030, verruimd in 0046): verhoog je er één,
 * verhoog dan de ander mee, anders weigert de database de upload.
 */
export const MAX_PROJECT_FILE_CHARS = 1_000_000;

/**
 * Totaal tekenbudget dat per beurt als bron meegaat naar het model. Bewust een
 * eigen, lagere grens dan 50 × 1.000.000: die zou bij elke beurt vijftig miljoen
 * tekens de context in duwen (traag, duur, en bij de meeste modellen te groot).
 * Wordt het budget bereikt, dan gaan de OUDSTE bestanden mee tot het vol is en
 * meldt de UI wat er buiten viel; stil afkappen zou de gebruiker laten denken
 * dat het model alles gelezen heeft.
 */
export const MAX_PROJECT_CONTEXT_CHARS = 200_000;

/** Maximale lengte van de projectinstructie; spiegel van de CHECK in 0030. */
export const MAX_PROJECT_INSTRUCTIONS_CHARS = 20_000;

/** Maximale lengte van de projectnaam; spiegel van de CHECK in 0030. */
export const MAX_PROJECT_NAME_CHARS = 120;

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Projecten vereisen een geconfigureerde backend.');
  }
  return supabase;
}

// --- Rijen uit de database naar het app-model ---

interface ProjectRow {
  id: string;
  name: string;
  instructions: string | null;
  created_at: string;
  updated_at: string;
  chat_project_files?: { count: number }[];
}

function toProject(row: ProjectRow): ChatProject {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileCount: row.chat_project_files?.[0]?.count ?? 0,
  };
}

interface FileRow {
  id: string;
  project_id: string;
  name: string;
  chars: number;
  truncated: boolean;
  created_at: string;
  text?: string;
}

function toFile(row: FileRow): ChatProjectFile {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    chars: row.chars,
    truncated: row.truncated,
    createdAt: row.created_at,
    ...(typeof row.text === 'string' ? { text: row.text } : {}),
  };
}

// --- Projecten ---

/** Alle projecten van de ingelogde gebruiker, recentst bijgewerkt eerst. */
export async function listProjects(): Promise<ChatProject[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('chat_projects')
    // De count-embed levert het aantal bestanden zonder de teksten op te halen.
    .select('id, name, instructions, created_at, updated_at, chat_project_files(count)')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data as ProjectRow[]) ?? []).map(toProject);
}

/** Eén project; niet gevonden (of niet van jou) -> null. */
export async function getProject(id: string): Promise<ChatProject | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('chat_projects')
    .select('id, name, instructions, created_at, updated_at, chat_project_files(count)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toProject(data as ProjectRow) : null;
}

/**
 * Maak een project aan. `user_id` moet expliciet mee: de INSERT-policy eist
 * `user_id = auth.uid()` en de kolom heeft geen default.
 */
export async function createProject(args: {
  userId: string;
  name: string;
  instructions?: string;
}): Promise<ChatProject> {
  const client = requireClient();
  const { data, error } = await client
    .from('chat_projects')
    .insert({
      user_id: args.userId,
      name: args.name.trim().slice(0, MAX_PROJECT_NAME_CHARS),
      instructions: (args.instructions ?? '').slice(0, MAX_PROJECT_INSTRUCTIONS_CHARS),
    })
    .select('id, name, instructions, created_at, updated_at')
    .single();
  if (error) throw error;
  return toProject(data as ProjectRow);
}

/** Werk naam en/of projectinstructie bij. */
export async function updateProject(
  id: string,
  patch: { name?: string; instructions?: string },
): Promise<ChatProject> {
  const client = requireClient();
  const update: Record<string, string> = {};
  if (typeof patch.name === 'string') {
    update.name = patch.name.trim().slice(0, MAX_PROJECT_NAME_CHARS);
  }
  if (typeof patch.instructions === 'string') {
    update.instructions = patch.instructions.slice(0, MAX_PROJECT_INSTRUCTIONS_CHARS);
  }
  const { data, error } = await client
    .from('chat_projects')
    .update(update)
    .eq('id', id)
    .select('id, name, instructions, created_at, updated_at')
    .single();
  if (error) throw error;
  invalidateProjectContext(id);
  return toProject(data as ProjectRow);
}

/**
 * Verwijder een project. De bestanden gaan mee via ON DELETE CASCADE. Lokale
 * gesprekken die naar dit project verwezen blijven bestaan en draaien verder
 * als gewoon gesprek — zie {@link loadProjectContext}, dat dan null teruggeeft.
 */
export async function deleteProject(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('chat_projects').delete().eq('id', id);
  if (error) throw error;
  invalidateProjectContext(id);
}

// --- Bronbestanden ---

/** De bestandslijst van een project — zonder de teksten (die zijn groot). */
export async function listProjectFiles(projectId: string): Promise<ChatProjectFile[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('chat_project_files')
    .select('id, project_id, name, chars, truncated, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as FileRow[]) ?? []).map(toFile);
}

/** Voeg een geëxtraheerd bestand toe als bron van het project. */
export async function addProjectFile(args: {
  projectId: string;
  name: string;
  text: string;
  truncated: boolean;
}): Promise<ChatProjectFile> {
  const client = requireClient();
  const text = args.text.slice(0, MAX_PROJECT_FILE_CHARS);
  const { data, error } = await client
    .from('chat_project_files')
    .insert({
      project_id: args.projectId,
      name: args.name.trim().slice(0, 200),
      text,
      chars: text.length,
      truncated: args.truncated || args.text.length > MAX_PROJECT_FILE_CHARS,
    })
    .select('id, project_id, name, chars, truncated, created_at')
    .single();
  if (error) throw error;
  invalidateProjectContext(args.projectId);
  indexed.delete(args.projectId);
  return toFile(data as FileRow);
}

const markedUsed = new Set<string>();

/**
 * Zet de laatste keer gebruik van een project op nu (migratie 0051). Een project
 * dat drie maanden niet is gebruikt, verliest zijn bronbestanden (0053). Eén keer per project per
 * sessie is genoeg; de database schrijft hoogstens één keer per uur. Gooit nooit.
 */
export function markProjectUsed(projectId: string): void {
  if (!isSupabaseConfigured || !supabase || markedUsed.has(projectId)) return;
  markedUsed.add(projectId);
  void supabase.rpc('mark_chat_project_used', { p_project: projectId }).then(({ error }) => {
    if (error) markedUsed.delete(projectId);
  });
}

/** Bewaartermijn van de bronbestanden van een project (migratie 0053). */
export interface ProjectRetention {
  name: string;
  fileCount: number;
  /** De dag waarop de bestanden weggaan; alleen gezet na de waarschuwingsmail. */
  deleteOn: string | null;
  /** Zonder gebruik blijven de bestanden in elk geval tot deze dag staan. */
  keepUntil: string;
}

/** Stand van de bewaartermijn; niet gevonden (of niet van jou) -> null. */
export async function getProjectRetention(projectId: string): Promise<ProjectRetention | null> {
  const client = requireClient();
  const { data, error } = await client.rpc('chat_project_retention', { p_project: projectId });
  if (error) throw error;
  const row = (data as { name: string; file_count: number; delete_on: string | null; keep_until: string }[])?.[0];
  if (!row) return null;
  return { name: row.name, fileCount: row.file_count, deleteOn: row.delete_on, keepUntil: row.keep_until };
}

/**
 * De knop Bestanden bewaren. De database legt het besluit vast in het logboek
 * en geeft de dag terug tot wanneer de bestanden in elk geval blijven staan.
 */
export async function keepProjectFiles(projectId: string): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.rpc('keep_chat_project_files', { p_project: projectId });
  if (error) throw error;
  return data as string;
}

/** Verwijder één bronbestand. */
export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('chat_project_files').delete().eq('id', fileId);
  if (error) throw error;
  invalidateProjectContext(projectId);
}

// --- De context die per beurt naar het model gaat ---

/**
 * Cache van samengestelde projectcontexten. Zonder deze cache haalt elke
 * chatbeurt alle bestandsteksten opnieuw op — bij een project van 200.000
 * tekens is dat per beurt een extra ronde over de lijn vóór het model ook maar
 * begint. Elke schrijfactie hierboven invalideert zijn eigen project.
 */
const contextCache = new Map<string, ChatProjectContext>();

/** Gooi de gecachete context van één project (of alles) weg. */
export function invalidateProjectContext(projectId?: string): void {
  if (projectId) contextCache.delete(projectId);
  else contextCache.clear();
}

/** Wat er bij het samenstellen buiten het tekenbudget viel. */
export interface ProjectContextResult {
  context: ChatProjectContext;
  /** Namen van bestanden die niet meer in het budget pasten. */
  skipped: string[];
  /**
   * true als de context is opgebouwd uit de stukken die bij de vraag passen
   * (match_project_chunks) in plaats van uit hele bestanden. `skipped` is
   * dan leeg: niets viel buiten het budget, de rest van de tekst was gewoon
   * niet aan de orde.
   */
  searched: boolean;
}

/** Eén rij uit de RPC search_project_chunks (migratie 0046). */
interface ChunkRow {
  file_id: string;
  seq: number;
  text: string;
}

/** Roept de edge function aan met het token van de gebruiker. Gooit bij een fout. */
async function callProjectFunction<T>(body: Record<string, unknown>): Promise<T> {
  const client = requireClient();
  const functionUrl = getFunctionUrl('optimize-prompt');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!functionUrl || !token) throw new Error('Geen sessie');
  const anonKey = getAnonKey();
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || !result.success) throw new Error(result.error ?? 'Geen antwoord');
  return result;
}

const indexing = new Map<string, Promise<void>>();
/** Projecten waarvan in deze sessie alle stukken een vector hebben. */
const indexed = new Set<string>();

/**
 * Zo lang wacht de eerste vraag in een groot project op de vectoren. Daarna gaat
 * het zoeken toch door: stukken zonder vector vindt de woordzoeker, en het
 * verwerken loopt op de achtergrond verder.
 */
const INDEX_WAIT_MS = 20_000;

/**
 * Maakt de stukken van een project doorzoekbaar op betekenis: de edge function
 * verwerkt per aanroep een portie, tot er niets meer overblijft. `onProgress`
 * krijgt het aantal stukken dat nog moet. Loopt voor een project maar één keer
 * tegelijk en gaat na een onderbreking verder waar hij was.
 *
 * Gooit nooit. Stukken zonder vector zijn gewoon vindbaar met de woordzoeker,
 * dus een storing hier mag niemand een upload kosten.
 */
export function indexProject(
  projectId: string,
  onProgress?: (remaining: number) => void,
): Promise<void> {
  // Wie aanhaakt bij een verwerking die al loopt, krijgt ook de voortgang.
  let listeners = indexListeners.get(projectId);
  if (!listeners) {
    listeners = new Set();
    indexListeners.set(projectId, listeners);
  }
  if (onProgress) listeners.add(onProgress);
  const running = indexing.get(projectId);
  if (running) return running;
  const notify = (remaining: number) => listeners!.forEach((listener) => listener(remaining));
  const run = (async () => {
    try {
      for (;;) {
        const { remaining } = await callProjectFunction<{ remaining: number }>({
          mode: 'project-index',
          projectId,
        });
        notify(remaining);
        if (remaining <= 0) {
          indexed.add(projectId);
          return;
        }
      }
    } catch {
      notify(0);
    } finally {
      indexing.delete(projectId);
      indexListeners.delete(projectId);
    }
  })();
  indexing.set(projectId, run);
  return run;
}

const indexListeners = new Map<string, Set<(remaining: number) => void>>();

/**
 * Haalt de tekststukken op die bij de vraag passen: eerst op betekenis en woorden
 * samen (edge function, migratie 0049), en lukt dat niet met alleen de Nederlandse
 * tekstzoeker uit 0046. Geeft null terug als er niets matcht of als allebei
 * falen, zodat de aanroeper op hele bestanden kan terugvallen.
 */
async function searchProjectChunks(
  projectId: string,
  query: string,
  nameOf: Map<string, string>,
  budget: number = MAX_PROJECT_CONTEXT_CHARS,
): Promise<{ name: string; text: string }[] | null> {
  let rows: ChunkRow[];
  try {
    const { chunks } = await callProjectFunction<{ chunks: ChunkRow[] }>({
      mode: 'project-search',
      projectId,
      query,
    });
    rows = chunks;
  } catch {
    const { data, error } = await requireClient().rpc('search_project_chunks', {
      p_project: projectId,
      p_query: query,
    });
    if (error) return null;
    rows = (data as ChunkRow[]) ?? [];
  }

  // Groepeer de stukken per bestand. De RPC levert op trefferscore, dus de
  // volgorde van eerste verschijning is de volgorde van beste treffer.
  const perFile = new Map<string, { name: string; bySeq: Map<number, string> }>();
  for (const row of rows) {
    const name = nameOf.get(row.file_id);
    if (!name || typeof row.text !== 'string' || !row.text) continue;
    let group = perFile.get(row.file_id);
    if (!group) {
      group = { name, bySeq: new Map() };
      perFile.set(row.file_id, group);
    }
    if (!group.bySeq.has(row.seq)) group.bySeq.set(row.seq, row.text);
  }
  if (perFile.size === 0) return null;

  // Binnen een bestand volgen de stukken hun plek in het document; tussen de
  // bestanden geldt de trefferscore. Het scheidingsteken laat zien dat er
  // tekst tussen twee stukken ontbreekt.
  const separator = '\n\n…\n\n';
  const files: { name: string; text: string }[] = [];
  let used = 0;
  for (const group of perFile.values()) {
    const ordered = [...group.bySeq.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
    const parts: string[] = [];
    let size = 0;
    for (const text of ordered) {
      const extra = text.length + (parts.length ? separator.length : 0);
      if (used + size + extra > budget) break;
      size += extra;
      parts.push(text);
    }
    if (!parts.length) break;
    files.push({ name: group.name, text: parts.join(separator) });
    used += size;
  }
  return files.length ? files : null;
}

/**
 * Stel de bron van een project samen: projectinstructie plus bestandsteksten,
 * tot aan {@link MAX_PROJECT_CONTEXT_CHARS}. Bestaat het project niet (meer),
 * dan komt er null terug en draait het gesprek als gewone chat.
 *
 * Past niet alles in het budget en is `query` gegeven (de vraag van deze
 * beurt), dan stuurt alleen de stukken tekst mee die bij die vraag passen:
 * de Nederlands doorzoekbare stukken uit migratie 0046. Zonder query, of als
 * de zoekfunctie niets vindt, vallen we terug op hele bestanden op volgorde
 * van toevoegen.
 */
export async function loadProjectContext(
  projectId: string,
  query?: string,
): Promise<ProjectContextResult | null> {
  const cached = contextCache.get(projectId);
  if (cached) return { context: cached, skipped: [], searched: false };
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: projectData, error: projectError } = await supabase
    .from('chat_projects')
    .select('id, name, instructions, created_at, updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!projectData) return null;

  // Eerst alleen de namen en maten: in een groot project hoeft de volledige tekst
  // dan niet bij elke beurt door de browser.
  const { data: metaData, error: metaError } = await supabase
    .from('chat_project_files')
    .select('id, name, chars')
    .eq('project_id', projectId);
  if (metaError) throw metaError;
  const meta = (metaData as { id: string; name: string; chars: number }[]) ?? [];
  const row = projectData as ProjectRow;
  markProjectUsed(projectId);

  if (query?.trim() && meta.reduce((sum, f) => sum + f.chars, 0) > MAX_PROJECT_CONTEXT_CHARS) {
    // Vectoren komen pas als een project te groot wordt, dus de eerste vraag
    // maakt ze af. Dat kost die ene keer wat tijd; daarna is dit een snelle check.
    if (!indexed.has(projectId)) {
      await Promise.race([
        indexProject(projectId),
        new Promise((resolve) => setTimeout(resolve, INDEX_WAIT_MS)),
      ]);
    }
    const nameOf = new Map(meta.map((f) => [f.id, f.name]));
    const searched = await searchProjectChunks(projectId, query.trim(), nameOf);
    if (searched) {
      return {
        context: {
          id: row.id,
          name: row.name,
          instructions: (row.instructions ?? '').trim(),
          files: searched,
        },
        skipped: [],
        searched: true,
      };
    }
  }

  const { data: fileData, error: fileError } = await supabase
    .from('chat_project_files')
    .select('id, project_id, name, chars, truncated, created_at, text')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (fileError) throw fileError;

  const files: { name: string; text: string }[] = [];
  const skipped: string[] = [];
  let used = 0;
  for (const row of (fileData as FileRow[]) ?? []) {
    const text = typeof row.text === 'string' ? row.text : '';
    if (!text) continue;
    // Past hij niet meer heel? Dan slaan we hem over in plaats van hem
    // halverwege af te kappen: een half document is misleidender dan geen.
    if (used + text.length > MAX_PROJECT_CONTEXT_CHARS) {
      skipped.push(row.name);
      continue;
    }
    files.push({ name: row.name, text });
    used += text.length;
  }

  // Alleen een VOLLEDIGE context cachen: bij overgeslagen bestanden wil de
  // volgende beurt dezelfde melding kunnen tonen, en een zoekresultaat hoort
  // bij één vraag en mag niet voor een volgende dienen.
  if (skipped.length === 0) {
    const context: ChatProjectContext = {
      id: row.id,
      name: row.name,
      instructions: (row.instructions ?? '').trim(),
      files,
    };
    contextCache.set(projectId, context);
    return { context, skipped, searched: false };
  }

  return {
    context: {
      id: row.id,
      name: row.name,
      instructions: (row.instructions ?? '').trim(),
      files,
    },
    skipped,
    searched: false,
  };
}

// --- De brug naar de promptbouwer ---

/**
 * Hoeveel projecttekst er hoogstens in één bouwstap meegaat: de analyse plus de
 * passages die bij de opdracht passen. Spiegel van
 * MAX_PROJECT_CONTEXT_IN_GENERATOR in de edge function.
 *
 * Dit is GEEN grens op wat er gelezen wordt. De analyse leest alle gekozen
 * bronnen volledig, in delen als het moet (zie {@link ensureProjectBrief}), en
 * de passages komen uit alle gekozen bronnen. Alleen wat daarna in elke stap
 * meegaat is begrensd: de bouwer draait per prompt meerdere AI-stappen
 * (raamwerkkeuze, voor-invulling, vragenronde, schrijven) en die context gaat in
 * elke stap opnieuw mee.
 */
export const MAX_GENERATOR_CONTEXT_CHARS = 60_000;

/**
 * Zoveel tekens bronpassages gaan er hoogstens mee naast de analyse. Ruim onder
 * {@link MAX_GENERATOR_CONTEXT_CHARS}, zodat analyse en passages samen passen.
 */
const MAX_GENERATOR_PASSAGE_CHARS = 40_000;

/**
 * Zoveel tekens materiaal leest één analyse-aanroep. Groter materiaal wordt in
 * delen van deze maat geanalyseerd en daarna samengevoegd. Spiegel van
 * MAX_PROJECT_BRIEF_CHARS in de edge function, die er wat ruimte bovenop houdt.
 *
 * Waarom niet alles in één keer: het contextvenster zou het halen, maar een klein
 * model leest het midden van een heel lange tekst slecht. In delen leest het
 * elk deel echt.
 */
const BRIEF_PART_CHARS = 120_000;

/** Zoveel analyse-aanroepen lopen er tegelijk. */
const BRIEF_CONCURRENCY = 4;

/** Zoveel deelanalyses voegt één aanroep hoogstens samen. */
const BRIEF_MERGE_GROUP = 12;

/**
 * Welke bronbestanden mee naar de bouwer gaan: een eigen keuze, of `'all'` voor
 * de knop op de projectpagina.
 */
export type GeneratorFileSelection = 'all' | string[];

const instructionBlock = (instructions: string) => `Projectinstructie:\n${instructions}`;
const fileHeading = (name: string) => `Bronbestand "${name}":\n`;

/**
 * Hoeveel tekens instructie en bestanden samen tellen: de omvang van wat de
 * analyse leest. De keuzelijst toont dit getal.
 */
export function generatorCharsUsed(
  instructions: string,
  files: { name: string; chars: number }[],
): number {
  const base = instructions.trim() ? instructionBlock(instructions.trim()).length : 0;
  return files.reduce((sum, file) => sum + fileHeading(file.name).length + file.chars, base);
}

export interface GeneratorContext {
  /**
   * De PROJECTANALYSE, of bij een mislukte analyse het begin van het ruwe
   * bronmateriaal. Dit is de vaste basis; de passages bij een opdracht komen er
   * via {@link withGeneratorSources} bij.
   */
  text: string;
  /**
   * Is `text` de analyse (true) of het ruwe materiaal (false)? Bij een mislukte
   * analyse gaat alleen het ruwe materiaal mee.
   */
  analyzed: boolean;
  /** Id van het project; de keuzelijst vinkt hiermee het actieve project af. */
  id: string;
  /** Naam van het project, voor het label in de bouwer. */
  name: string;
  /** De bronbestanden die zijn gelezen; de bouwer toont ze als labels. */
  files: { id: string; name: string }[];
  /** Totale omvang van de gelezen bronbestanden, in tekens. */
  fileChars: number;
}

/** Voortgang van het lezen: hoeveel delen klaar zijn van hoeveel. */
export type BriefProgress = { done: number; total: number };

// --- De projectanalyse en zijn cache ---
//
// De bouwer krijgt niet het ruwe project maar de ANALYSE ervan: één vaste
// samenvatting van wat het project is, voor wie, welke toon, welke vaste termen
// en welke grenzen. Waarom dat beter werkt dan de ruwe tekst staat bij
// PROJECT_BRIEF_SYSTEM_PROMPT in de edge function; hier staat alleen hoe hij
// bewaard wordt.
//
// DRIE LAGEN, VAN GOEDKOOP NAAR DUUR
// 1. Geheugen — dezelfde sessie: nul verkeer.
// 2. De projectrij in de database (`generator_briefs`, migratie 0032) — morgen,
//    op een ander apparaat, of na een herlaad: één kleine query.
// 3. De edge function — alleen als er nog geen analyse is voor precies dit
//    bronmateriaal.
//
// De sleutel is een hash van het materiaal dat erin ging. Verandert de
// projectinstructie of de keuze aan bronnen, dan is dat andere invoer en dus een
// andere sleutel: een verouderde analyse kan niet stilzwijgend blijven hangen,
// en terug naar een eerdere keuze kost niets extra's.

/** Analyses van deze sessie: `${projectId}:${hash}` → de analysetekst. */
const briefCache = new Map<string, string>();

/** Hoeveel analyses er per project bewaard blijven; de oudste vallen af. */
const MAX_CACHED_BRIEFS = 4;

interface BriefEntry {
  brief: string;
  /** ISO-tijdstip; alleen gebruikt om bij het snoeien de oudste te herkennen. */
  at: string;
}

/**
 * Korte, stabiele vingerafdruk van het bronmateriaal.
 *
 * SHA-256 waar het kan; op een pagina zonder secure context (`crypto.subtle`
 * ontbreekt dan) een eenvoudige som. Dit is geen beveiliging maar een
 * cachesleutel: het enige dat telt is dat andere invoer een andere sleutel
 * oplevert.
 */
async function hashMaterial(text: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest).slice(0, 12))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // FNV-1a over de tekst, plus de lengte: goed genoeg om twee versies van
    // dezelfde instructie uit elkaar te houden.
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `f${hash.toString(16)}-${text.length}`;
  }
}

/** De bewaarde analyses van één project; onleesbare inhoud telt als leeg. */
async function readBriefs(projectId: string): Promise<Record<string, BriefEntry>> {
  if (!isSupabaseConfigured || !supabase) return {};
  const { data, error } = await supabase
    .from('chat_projects')
    .select('generator_briefs')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return {};
  const raw = (data as { generator_briefs?: unknown }).generator_briefs;
  return raw && typeof raw === 'object' ? (raw as Record<string, BriefEntry>) : {};
}

/**
 * Bewaar een analyse op de projectrij. Mislukt dat, dan gebeurt er niets ergers
 * dan dat de volgende sessie hem opnieuw laat maken — daarom geen fout naar
 * boven: het resultaat is er al en de gebruiker wacht erop.
 */
async function writeBrief(
  projectId: string,
  hash: string,
  brief: string,
  existing: Record<string, BriefEntry>,
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const next: Record<string, BriefEntry> = {
    ...existing,
    [hash]: { brief, at: new Date().toISOString() },
  };
  // Snoeien vóór het schrijven: de CHECK-constraint in 0032 weigert een map die
  // ongelimiteerd doorgroeit, en een geweigerde update zou de analyse verliezen.
  const entries = Object.entries(next)
    .sort((a, b) => (a[1]?.at ?? '').localeCompare(b[1]?.at ?? ''))
    .slice(-MAX_CACHED_BRIEFS);
  try {
    await supabase
      .from('chat_projects')
      .update({ generator_briefs: Object.fromEntries(entries) })
      .eq('id', projectId);
  } catch {
    /* de analyse is al gemaakt; bewaren is een bonus */
  }
}

/**
 * Knipt het materiaal in delen van hoogstens {@link BRIEF_PART_CHARS}. De
 * bestanden lopen op volgorde door; past een bestand niet meer in het lopende
 * deel, dan gaat de rest mee naar het volgende, geknipt op een alinea. De kop
 * van zo'n stuk zegt dat het een begin, vervolg of slot is, zodat het model weet
 * dat het geen heel document leest. De projectinstructie staat vooraan in elk
 * deel: zonder die beschrijving weet een deel uit het midden van een bestand
 * niet waar het over gaat.
 */
function splitMaterial(
  instructions: string,
  files: { name: string; text: string }[],
): string[] {
  const head = instructions ? instructionBlock(instructions) : '';
  // Een lange instructie herhalen kost per deel te veel; dan staat hij alleen in deel 1.
  const repeatHead = head.length <= BRIEF_PART_CHARS / 6;
  const room = BRIEF_PART_CHARS - (repeatHead ? head.length + 2 : 0);
  /** Kleiner dan dit begint een bestand liever in een nieuw deel. */
  const MIN_PIECE = 4_000;

  const parts: string[] = [];
  let current: string[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) parts.push(current.join('\n\n'));
    current = [];
    size = 0;
  };

  for (const file of files) {
    let rest = file.text;
    let first = true;
    while (rest) {
      const whole = first ? fileHeading(file.name) : `Bronbestand "${file.name}", vervolg:\n`;
      const free = room - size - (current.length ? 2 : 0);
      if (whole.length + rest.length <= free) {
        current.push(`${whole}${rest}`);
        size += whole.length + rest.length + (current.length > 1 ? 2 : 0);
        break;
      }
      const label = first
        ? `Bronbestand "${file.name}", begin (loopt door in het volgende deel):\n`
        : `Bronbestand "${file.name}", vervolg (loopt door in het volgende deel):\n`;
      const take = free - label.length;
      if (take < MIN_PIECE) {
        flush();
        continue;
      }
      // Knip op de laatste alinea in de tweede helft, anders op een regel, anders hard.
      let cut = rest.lastIndexOf('\n\n', take);
      if (cut < take / 2) cut = rest.lastIndexOf('\n', take);
      if (cut < take / 2) cut = take;
      current.push(`${label}${rest.slice(0, cut)}`);
      rest = rest.slice(cut).replace(/^\n+/, '');
      first = false;
      flush();
    }
  }
  flush();

  if (!parts.length) return head ? [head] : [];
  return parts.map((part, i) => (head && (repeatHead || i === 0) ? `${head}\n\n${part}` : part));
}

/** Voert de taken uit met hoogstens `limit` tegelijk, in de volgorde van de lijst. */
async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Levert de analyse van dit bronmateriaal: uit het geheugen, uit de database,
 * of anders vers gemaakt en meteen bewaard.
 *
 * Alles wordt gelezen. Past het materiaal in één aanroep, dan is het één
 * analyse. Is het groter, dan krijgt elk deel een eigen analyse en voegt een
 * laatste aanroep die samen tot één (bij heel veel delen in rondes). Zo leest
 * het model elk deel echt, in plaats van de staart weg te laten.
 *
 * Geeft een lege string terug wanneer er geen analyse te maken viel (geen
 * backend, niet ingelogd, provider onbereikbaar, of een deel mislukte). De
 * aanroeper valt dan terug op het ruwe materiaal.
 */
async function ensureProjectBrief(args: {
  projectId: string;
  projectName: string;
  instructions: string;
  files: { name: string; text: string }[];
  ai?: { provider?: AiProvider; model?: string };
  onProgress?: (progress: BriefProgress) => void;
}): Promise<string> {
  const { projectId, instructions, files } = args;
  const parts = splitMaterial(instructions, files);
  if (!parts.length) return '';
  // De sleutel blijft de hash van het hele materiaal: een analyse die vóór het
  // lezen in delen is gemaakt, geldt nog steeds voor precies dat materiaal.
  const material = [
    ...(instructions ? [instructionBlock(instructions)] : []),
    ...files.map((f) => `${fileHeading(f.name)}${f.text}`),
  ].join('\n\n');
  const hash = await hashMaterial(material);
  const memoryKey = `${projectId}:${hash}`;

  const remembered = briefCache.get(memoryKey);
  if (remembered) return remembered;

  // Loopt dezelfde analyse al (de voorbereiding na een upload, terwijl de
  // gebruiker het project in de bouwer aanhaakt), wacht dan daarop in plaats van
  // hem twee keer te betalen.
  const pending = briefInFlight.get(memoryKey);
  if (pending) return pending;
  const run = makeProjectBrief({ ...args, hash, memoryKey, parts });
  briefInFlight.set(memoryKey, run);
  try {
    return await run;
  } finally {
    briefInFlight.delete(memoryKey);
  }
}

/** Analyses die nu lopen, per `${projectId}:${hash}`. */
const briefInFlight = new Map<string, Promise<string>>();

async function makeProjectBrief(args: {
  projectId: string;
  projectName: string;
  ai?: { provider?: AiProvider; model?: string };
  onProgress?: (progress: BriefProgress) => void;
  hash: string;
  memoryKey: string;
  parts: string[];
}): Promise<string> {
  const { projectId, projectName, ai, onProgress, hash, memoryKey, parts } = args;
  const stored = await readBriefs(projectId);
  const hit = stored[hash]?.brief;
  if (typeof hit === 'string' && hit.trim()) {
    briefCache.set(memoryKey, hit);
    return hit;
  }

  const analyze = (text: string, extra?: { part?: { index: number; total: number }; merge?: boolean }) =>
    analyzeProjectContext({
      material: text,
      projectName,
      preferredProvider: ai?.provider,
      preferredModel: ai?.model,
      ...extra,
    });

  let brief: string;
  if (parts.length === 1) {
    onProgress?.({ done: 0, total: 1 });
    const result = await analyze(parts[0]);
    onProgress?.({ done: 1, total: 1 });
    if (!result.success || !result.brief) return '';
    brief = result.brief;
  } else {
    // Delen plus de samenvoegrondes tellen samen als de voortgang.
    let mergeCalls = 0;
    for (let n = parts.length; n > 1; n = Math.ceil(n / BRIEF_MERGE_GROUP)) {
      mergeCalls += Math.ceil(n / BRIEF_MERGE_GROUP);
    }
    const total = parts.length + mergeCalls;
    let done = 0;
    onProgress?.({ done, total });
    const tick = () => onProgress?.({ done: ++done, total });

    const partials = await runLimited(
      parts.map((text, i) => async () => {
        const result = await analyze(text, { part: { index: i + 1, total: parts.length } });
        tick();
        return result.success ? result.brief : '';
      }),
      BRIEF_CONCURRENCY,
    );
    // Een ontbrekend deel is een gat in wat er gelezen is; dan liever eerlijk
    // terugvallen dan een analyse die doet alsof hij alles kent.
    if (partials.some((p) => !p)) return '';

    let layer = partials.map((p, i) => `DEELANALYSE ${i + 1} VAN ${partials.length}:\n${p}`);
    while (layer.length > 1) {
      const groups: string[][] = [];
      for (let i = 0; i < layer.length; i += BRIEF_MERGE_GROUP) {
        groups.push(layer.slice(i, i + BRIEF_MERGE_GROUP));
      }
      const merged = await runLimited(
        groups.map((group) => async () => {
          const result = await analyze(group.join('\n\n'), { merge: true });
          tick();
          // Lukt het samenvoegen niet, dan zijn de deelanalyses zelf nog altijd
          // beter dan het ruwe begin van het materiaal.
          return result.success && result.brief ? result.brief : group.join('\n\n');
        }),
        BRIEF_CONCURRENCY,
      );
      layer =
        merged.length > 1
          ? merged.map((m, i) => `DEELANALYSE ${i + 1} VAN ${merged.length}:\n${m}`)
          : merged;
    }
    brief = layer[0];
  }

  briefCache.set(memoryKey, brief);
  void writeBrief(projectId, hash, brief, stored);
  return brief;
}

/**
 * Stelt de projectcontext samen zoals de PROMPTBOUWER hem nodig heeft: eerst het
 * project lezen, dán pas bouwen.
 *
 * Anders dan {@link loadProjectContext} (die de chat bedient) levert dit één
 * platte tekst in plaats van losse bronblokken: de generator-modi kennen geen
 * bijlagen, ze kennen alleen hun systeemprompt.
 *
 * De volgorde blijft die van uploaden, ook als er andersom is aangevinkt:
 * dezelfde keuze levert zo dezelfde tekst en dus dezelfde bewaarde analyse op.
 *
 * De projectinstructie gaat ALTIJD mee: dat is de beschrijving van het ding
 * waar de prompt over gaat. Bronbestanden gaan mee als de gebruiker ze kiest,
 * en dan VOLLEDIG: er is geen tekengrens meer op wat er gelezen wordt (zie
 * {@link ensureProjectBrief}). Wat er daarna in elke bouwstap meegaat, is de
 * analyse, plus de passages die bij de opdracht passen
 * ({@link withGeneratorSources}).
 */
export async function buildGeneratorContext(
  projectId: string,
  selection: GeneratorFileSelection,
  ai?: { provider?: AiProvider; model?: string },
  onProgress?: (progress: BriefProgress) => void,
  options: { markUsed?: boolean } = {},
): Promise<GeneratorContext | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data: projectData, error: projectError } = await supabase
    .from('chat_projects')
    .select('id, name, instructions')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!projectData) return null;
  const project = projectData as Pick<ProjectRow, 'id' | 'name' | 'instructions'>;
  const instructions = (project.instructions ?? '').trim();

  const files: { id: string; name: string; text: string }[] = [];
  if (selection === 'all' || selection.length > 0) {
    let query = supabase
      .from('chat_project_files')
      .select('id, name, text')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (selection !== 'all') query = query.in('id', selection);
    const { data: fileData, error: fileError } = await query;
    if (fileError) throw fileError;
    for (const file of (fileData ?? []) as { id: string; name: string; text: string | null }[]) {
      if (file.text) files.push({ id: file.id, name: file.name, text: file.text });
    }
  }

  // Een project zonder instructie én zonder bestanden levert geen context op;
  // dan is aanhaken zinloos en zeggen we dat eerlijk met null.
  if (!instructions && !files.length) return null;
  if (options.markUsed !== false) markProjectUsed(projectId);

  // De bouwer zoekt bij elke opdracht op betekenis; ontbreken er nog vectoren,
  // laat ze dan maken terwijl de analyse loopt.
  const fileChars = files.reduce((sum, f) => sum + f.text.length, 0);
  if (files.length && !indexed.has(projectId)) void indexProject(projectId);

  const brief = await ensureProjectBrief({
    projectId,
    projectName: project.name,
    instructions,
    files,
    ai,
    onProgress,
  });

  // Zonder analyse gaat het begin van het ruwe materiaal mee; de passages bij de
  // opdracht vullen daarna aan wat hier niet in past.
  const raw = [
    ...(instructions ? [instructionBlock(instructions)] : []),
    ...files.map((f) => `${fileHeading(f.name)}${f.text}`),
  ]
    .join('\n\n')
    .slice(0, MAX_GENERATOR_CONTEXT_CHARS - MAX_GENERATOR_PASSAGE_CHARS);

  return {
    text: brief || raw,
    analyzed: Boolean(brief),
    id: project.id,
    name: project.name,
    files: files.map((f) => ({ id: f.id, name: f.name })),
    fileChars,
  };
}

/** Gevonden passages per project, bronkeuze en opdracht; één zoekactie per opdracht. */
const passageCache = new Map<string, Promise<string>>();

/**
 * Zoekt in de gekozen bronbestanden de passages die bij deze opdracht passen:
 * op betekenis (de vectoren uit 0049) en op woorden samen, net als de chat. Geeft
 * een lege string terug als er niets past of het zoeken faalt; de analyse blijft
 * dan de context.
 */
function findGeneratorPassages(context: GeneratorContext, task: string): Promise<string> {
  const key = `${context.id}:${context.files.map((f) => f.id).join(',')}:${task}`;
  const cached = passageCache.get(key);
  if (cached) return cached;
  const run = (async () => {
    try {
      if (!indexed.has(context.id)) {
        await Promise.race([
          indexProject(context.id),
          new Promise((resolve) => setTimeout(resolve, INDEX_WAIT_MS)),
        ]);
      }
      // Alleen de gekozen bestanden: een stuk uit een bron die uit staat, valt weg.
      const nameOf = new Map(context.files.map((f) => [f.id, f.name]));
      const found = await searchProjectChunks(
        context.id,
        task.slice(0, 2000),
        nameOf,
        MAX_GENERATOR_PASSAGE_CHARS,
      );
      if (!found) return '';
      return found.map((f) => `Uit "${f.name}":\n${f.text}`).join('\n\n');
    } catch {
      return '';
    }
  })();
  passageCache.set(key, run);
  // Een mislukte zoekactie niet vasthouden: de volgende stap mag het opnieuw proberen.
  void run.then((text) => {
    if (!text) passageCache.delete(key);
  });
  return run;
}

/**
 * De projectcontext voor één bouwstap: de analyse, met daaronder de passages uit
 * de bronbestanden die bij deze opdracht passen. Zo kent de stap het project als
 * geheel én de details die voor deze prompt tellen. Zonder gekozen bestanden of
 * zonder opdracht is het alleen de analyse.
 */
export async function withGeneratorSources(
  context: GeneratorContext | null,
  task: string,
): Promise<string | undefined> {
  if (!context) return undefined;
  const clean = task.trim();
  if (!clean || !context.files.length) return context.text;
  const passages = await findGeneratorPassages(context, clean);
  if (!passages) return context.text;
  // De leeswijzer van de gebruiker vlak boven de passages, en niet alleen in de
  // analyse: de passages zijn ruwe brontekst, en zegt de gebruiker "alleen de
  // functionele kant", dan moet dat bij die tekst staan.
  const guide = readingGuide(context.text);
  return (
    `${context.text}\n\n` +
    `PASSAGES UIT DE BRONBESTANDEN DIE BIJ DEZE OPDRACHT PASSEN ` +
    `(letterlijk geciteerd; "…" betekent dat er tekst tussen zit).` +
    (guide
      ? `\nLeeswijzer van de gebruiker voor deze bronnen: ${guide}\n` +
        `Gebruik uit deze passages alleen wat die leeswijzer toelaat.`
      : '') +
    `\n\n${passages}`
  );
}

/**
 * De leeswijzer uit de analyse: wat de projectinstructie zegt over hoe de
 * bronbestanden gebruikt moeten worden. Leeg als er geen is.
 */
function readingGuide(brief: string): string {
  const lines = brief.split('\n');
  const start = lines.findIndex((line) => /^\s*LEESWIJZER BRONNEN\b/i.test(line));
  if (start < 0) return '';
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // Het volgende kopje: een regel in hoofdletters.
    if (/^\s*[A-ZÀ-Ý][A-ZÀ-Ý ]{5,}\s*$/.test(line)) break;
    body.push(line);
  }
  const text = body.join(' ').replace(/\s+/g, ' ').trim();
  if (!text || /^(geen|niet vermeld)\.?$/i.test(text)) return '';
  return text.slice(0, 1000);
}

/**
 * Hoe ver het verwerken van de bronnen van een project is. Twee stappen:
 * doorzoekbaar maken (de vectoren) en lezen voor de promptbouwer (de analyse).
 */
export interface ProjectPrepareStatus {
  phase: 'index' | 'read' | 'done' | 'failed';
  /** Stukken met een vector, van het totaal. */
  indexDone: number;
  indexTotal: number;
  /** Gelezen delen plus samenvoegstappen, van het totaal; 0 van 0 als hij al klaarstond. */
  readDone: number;
  readTotal: number;
}

/** Lopende voorbereidingen per project; `again` vraagt om nog een ronde erna. */
const preparing = new Map<string, { again: boolean }>();
/** De laatste stand per project, zodat een venster dat later opengaat hem meteen ziet. */
const prepareStatus = new Map<string, ProjectPrepareStatus>();

type PrepareListener = (projectId: string, status: ProjectPrepareStatus) => void;
const prepareListeners = new Set<PrepareListener>();

/** Volg het verwerken van projecten; geeft een functie om te stoppen. */
export function onProjectPrepare(listener: PrepareListener): () => void {
  prepareListeners.add(listener);
  return () => prepareListeners.delete(listener);
}

/** De laatst bekende stand van dit project, of null als er in deze sessie niets liep. */
export function getProjectPrepareStatus(projectId: string): ProjectPrepareStatus | null {
  return prepareStatus.get(projectId) ?? null;
}

/**
 * Vraagt de browser om bevestiging als het tabblad sluit terwijl er nog bronnen
 * worden verwerkt. Binnen de app wisselen van pagina breekt niets af; alleen het
 * tabblad sluiten of herladen doet dat.
 */
let unloadGuarded = false;
function guardUnload(): void {
  if (unloadGuarded || typeof window === 'undefined') return;
  unloadGuarded = true;
  window.addEventListener('beforeunload', (event) => {
    if (preparing.size === 0) return;
    event.preventDefault();
    // Oudere browsers tonen de vraag alleen met een returnValue.
    event.returnValue = '';
  });
}

/** Aantal stukken van een project; 0 als het tellen niet lukt. */
async function countChunks(projectId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('chat_project_file_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  return error ? 0 : (count ?? 0);
}

/**
 * Maakt een project klaar voor de promptbouwer, zodat hij daar niets meer hoeft
 * te analyseren: vectoren voor alle bronbestanden en de analyse van de
 * instructie met alle bronnen, bewaard op de projectrij. Draait na toevoegen of
 * verwijderen van een bestand, na opslaan van de instructie en bij het openen
 * van de projectinstellingen. Staat alles er al, dan kost dat een paar kleine
 * query's.
 *
 * Hangt niet aan een venster: sluiten of opslaan breekt het niet af, alleen het
 * tabblad sluiten. Loopt per project één keer tegelijk; een wijziging tijdens
 * het lopen geeft daarna nog een ronde, met het nieuwe materiaal. Gooit nooit:
 * lukt het niet, dan maakt de bouwer de analyse alsnog bij het aanhaken.
 */
export function prepareProjectForBuilder(projectId: string): void {
  if (!isSupabaseConfigured || !supabase) return;
  guardUnload();
  const running = preparing.get(projectId);
  if (running) {
    running.again = true;
    return;
  }
  const state = { again: false };
  preparing.set(projectId, state);
  let status: ProjectPrepareStatus = {
    phase: 'index',
    indexDone: 0,
    indexTotal: 0,
    readDone: 0,
    readTotal: 0,
  };
  const emit = (patch: Partial<ProjectPrepareStatus>) => {
    status = { ...status, ...patch };
    prepareStatus.set(projectId, status);
    prepareListeners.forEach((listener) => listener(projectId, status));
  };
  void (async () => {
    let analyzed = false;
    try {
      do {
        state.again = false;
        const total = await countChunks(projectId);
        emit({ phase: 'index', indexTotal: total, indexDone: 0, readDone: 0, readTotal: 0 });
        await indexProject(projectId, (remaining) =>
          emit({ indexDone: Math.max(0, total - remaining) }),
        );
        emit({ phase: 'read', indexDone: total });
        const ai = await getAiSettings().catch(() => null);
        const context = await buildGeneratorContext(
          projectId,
          'all',
          ai ? { provider: ai.provider, model: ai.model } : undefined,
          (progress) => emit({ readDone: progress.done, readTotal: progress.total }),
          { markUsed: false },
        );
        analyzed = !context || context.analyzed;
      } while (state.again);
    } catch {
      analyzed = false;
    } finally {
      preparing.delete(projectId);
      emit({ phase: analyzed ? 'done' : 'failed' });
    }
  })();
}
