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

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { analyzeProjectContext } from '@/services/optimizeService';
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
  return toFile(data as FileRow);
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
   * (search_project_chunks) in plaats van uit hele bestanden. `skipped` is
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

/**
 * Haalt de tekststukken op die bij de vraag passen, via de Nederlandse
 * tekstzoeker uit migratie 0046. Geeft null terug als er niets matcht of als
 * de functie faalt, zodat de aanroeper op hele bestanden kan terugvallen.
 */
async function searchProjectChunks(
  projectId: string,
  query: string,
  nameOf: Map<string, string>,
): Promise<{ name: string; text: string }[] | null> {
  const client = requireClient();
  const { data, error } = await client.rpc('search_project_chunks', {
    p_project: projectId,
    p_query: query,
  });
  if (error) return null;

  // Groepeer de stukken per bestand. De RPC levert op trefferscore, dus de
  // volgorde van eerste verschijning is de volgorde van beste treffer.
  const perFile = new Map<string, { name: string; bySeq: Map<number, string> }>();
  for (const row of (data as ChunkRow[]) ?? []) {
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
      if (used + size + extra > MAX_PROJECT_CONTEXT_CHARS) break;
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

  const row = projectData as ProjectRow;
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

  if (query?.trim()) {
    const nameOf = new Map(((fileData as FileRow[]) ?? []).map((f) => [f.id, f.name]));
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
 * Tekenbudget van de projectcontext in de GENERATOR. Bewust veel lager dan
 * {@link MAX_PROJECT_CONTEXT_CHARS} voor de chat: de bouwer draait per prompt
 * meerdere AI-stappen (raamwerkkeuze, voor-invulling, vragenronde, schrijven) en
 * die context gaat in elke stap opnieuw mee. Wat in de chat één keer 200.000
 * tekens kost, kost hier een veelvoud. Spiegel van
 * MAX_PROJECT_CONTEXT_IN_GENERATOR in de edge function.
 */
export const MAX_GENERATOR_CONTEXT_CHARS = 60_000;

/**
 * Welke bronbestanden mee naar de bouwer gaan: een eigen keuze, of `'all'` voor
 * de knop op de projectpagina (oudste eerst, tot het budget vol is).
 */
export type GeneratorFileSelection = 'all' | string[];

const instructionBlock = (instructions: string) => `Projectinstructie:\n${instructions}`;
const fileHeading = (name: string) => `Bronbestand "${name}":\n`;

/**
 * Hoeveel tekens instructie en bestanden samen van het bouwerbudget gebruiken.
 * Dezelfde telling als in {@link buildGeneratorContext}, zodat de teller in de
 * keuzelijst precies zegt wat er straks wel of niet past.
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
   * De tekst die als `projectContext` naar de AI-stappen gaat. Normaal is dit de
   * PROJECTANALYSE (zie {@link ensureProjectBrief}); alleen wanneer die niet
   * gemaakt kon worden staat hier het ruwe bronmateriaal.
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
  /** De bronbestanden die echt zijn meegegaan; de bouwer toont ze als labels. */
  files: { id: string; name: string }[];
  /** Bestanden die niet meer in het generator-budget pasten. */
  skipped: string[];
}

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
 * Levert de analyse van dit bronmateriaal: uit het geheugen, uit de database,
 * of anders vers gemaakt en meteen bewaard.
 *
 * Geeft een lege string terug wanneer er geen analyse te maken viel (geen
 * backend, niet ingelogd, provider onbereikbaar). De aanroeper valt dan terug op
 * het ruwe materiaal: ongefilterde context is minder goed dan de analyse, maar
 * veel beter dan een prompt die het project helemaal niet kent.
 */
async function ensureProjectBrief(args: {
  projectId: string;
  projectName: string;
  material: string;
  ai?: { provider?: AiProvider; model?: string };
}): Promise<string> {
  const { projectId, projectName, material, ai } = args;
  const hash = await hashMaterial(material);
  const memoryKey = `${projectId}:${hash}`;

  const remembered = briefCache.get(memoryKey);
  if (remembered) return remembered;

  const stored = await readBriefs(projectId);
  const hit = stored[hash]?.brief;
  if (typeof hit === 'string' && hit.trim()) {
    briefCache.set(memoryKey, hit);
    return hit;
  }

  const result = await analyzeProjectContext({
    material,
    projectName,
    preferredProvider: ai?.provider,
    preferredModel: ai?.model,
  });
  if (!result.success || !result.brief) return '';

  briefCache.set(memoryKey, result.brief);
  void writeBrief(projectId, hash, result.brief, stored);
  return result.brief;
}

/**
 * Stelt de projectcontext samen zoals de PROMPTBOUWER hem nodig heeft: eerst het
 * project lezen, dán pas bouwen.
 *
 * Anders dan {@link loadProjectContext} (die de chat bedient) levert dit één
 * platte tekst in plaats van losse bronblokken: de generator-modi kennen geen
 * bijlagen, ze kennen alleen hun systeemprompt.
 *
 * De bestanden komen hier bewust rechtstreeks uit de database en niet uit
 * {@link loadProjectContext}: die stopt bij het chatbudget op volgorde van
 * uploaden, waardoor een bron die de gebruiker zelf koos stilletjes zou
 * ontbreken. De volgorde blijft die van uploaden, ook als er andersom is
 * aangevinkt: dezelfde keuze levert zo dezelfde tekst en dus dezelfde
 * bewaarde analyse op.
 *
 * De projectinstructie gaat ALTIJD mee: dat is de beschrijving van het ding
 * waar de prompt over gaat, en zonder die beschrijving schrijft de bouwer een
 * algemene prompt. Bronbestanden gaan alleen mee als de gebruiker ze kiest:
 * voor "schrijf een prompt over mijn plugin" is de instructie meestal genoeg, en
 * tienduizenden tekens spec door meerdere achtereenvolgende AI-stappen duwen is
 * traag en duur voor wat het toevoegt.
 *
 * Wat er daarna uitgaat is niet dat materiaal zelf maar de analyse ervan (zie
 * {@link ensureProjectBrief}). Een projectinstructie is geschreven voor een mens
 * of voor een chat (stack, mappen, tabellen) en wie daar een prompt over wil,
 * heeft daar een handvol regels van nodig. Het model kreeg voorheen alles en
 * gebruikte er niets van.
 */
export async function buildGeneratorContext(
  projectId: string,
  selection: GeneratorFileSelection,
  ai?: { provider?: AiProvider; model?: string },
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

  const parts: string[] = [];
  if (instructions) parts.push(instructionBlock(instructions));

  const included: { id: string; name: string }[] = [];
  const skipped: string[] = [];
  if (selection === 'all' || selection.length > 0) {
    let query = supabase
      .from('chat_project_files')
      .select('id, name, text')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (selection !== 'all') query = query.in('id', selection);
    const { data: fileData, error: fileError } = await query;
    if (fileError) throw fileError;

    let used = generatorCharsUsed(instructions, []);
    for (const file of (fileData ?? []) as { id: string; name: string; text: string | null }[]) {
      if (!file.text) continue;
      const block = `${fileHeading(file.name)}${file.text}`;
      // Niet halverwege afkappen: een half document leest als een compleet
      // document en stuurt de prompt dan de verkeerde kant op.
      if (used + block.length > MAX_GENERATOR_CONTEXT_CHARS) {
        skipped.push(file.name);
        continue;
      }
      parts.push(block);
      included.push({ id: file.id, name: file.name });
      used += block.length;
    }
  }

  const material = parts.join('\n\n').trim();
  // Een project zonder instructie én zonder (passende) bestanden levert geen
  // context op; dan is aanhaken zinloos en zeggen we dat eerlijk met null.
  if (!material) return null;

  const brief = await ensureProjectBrief({
    projectId,
    projectName: project.name,
    material,
    ai,
  });

  return {
    text: brief || material,
    analyzed: Boolean(brief),
    id: project.id,
    name: project.name,
    files: included,
    skipped,
  };
}
