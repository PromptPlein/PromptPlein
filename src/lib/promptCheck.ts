import { useSyncExternalStore } from 'react';
import { hasMemoryTrigger } from '@/lib/memoryTriggers';

/**
 * Promptcheck in de chat: terwijl iemand het eerste bericht typt, kijkt de browser
 * of het korter en scherper kan. Beleefdheden, twijfelwoorden en een vraag als
 * "zou je X kunnen maken" maken een antwoord niet beter, een gevraagde vorm
 * ("in een tabel", "hoogstens vijf punten") wel.
 *
 * Alles gebeurt hier, zonder AI-aanroep: de tekst gaat pas weg als de gebruiker
 * hem verstuurt, en dan langs de controle op persoonsgegevens. Het idee komt van
 * de Promptcheck van GreenPT voor BZK; de regels zijn eigen werk.
 */

// --- Aan of uit, per browser (net als Doorvragen) ---

const STORAGE_KEY = 'opl.chat.promptcheck';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'uit';
  } catch {
    return true;
  }
}

let enabled = typeof window === 'undefined' ? true : read();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    enabled = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Staat standaard aan; wie het uitzet, krijgt het niet meer tot hij het zelf weer aanzet. */
export function setPromptCheckEnabled(value: boolean): void {
  enabled = value;
  try {
    if (value) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, 'uit');
  } catch {
    /* opslag niet beschikbaar: de keuze geldt dan alleen deze sessie */
  }
  listeners.forEach((listener) => listener());
}

export function usePromptCheckEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => true);
}

// --- De controle ---

/** Langer dan dit is een uitgewerkte opdracht; daar is inkorten niet aan ons. */
const MAX_CHARS = 600;

/** Wie met kopjes of meerdere regels schrijft, heeft zelf een prompt gemaakt. */
const OWN_PROMPT = /\n|^\s*(rol|context|taak|doel|doelgroep|opdracht|format|vorm)\s*:|\bje bent\b/im;

/**
 * Woorden en zinsdelen die je zonder verlies weglaat. Elk item is een losse
 * regex, zodat de telling zegt hoeveel er weg kunnen. Bewust geen "even",
 * "echt" of "een beetje": die betekenen vaak wél iets ("even groot", "is dit
 * echt zo").
 */
const FILLERS: RegExp[] = [
  /^(hoi|hallo|hey|hé|hee|goedemorgen|goedemiddag|goedenavond)\b[\s,!.]*/i,
  /[\s,]*\b(en )?(alvast )?(heel |super |hartstikke )?(erg )?(bedankt|dank je( wel)?|dankjewel|dank u( wel)?)( alvast)?\b[\s!.]*/gi,
  /[\s,]*\b(groetjes|groet|mvg|met vriendelijke groet)\b[\s!.,\w]*$/i,
  /\b(ik hoop dat|hopelijk) (je|jij|u) (me|mij) (kunt|kan) helpen[\s,.!]*(met\s+)?/gi,
  /\b(even )?een (kort |klein |snel )?vraagje\b[\s:,!.]*/gi,
  /\bals (dat|het) (kan|lukt|mogelijk is)\b,?/gi,
  /\bmisschien\b\s*/gi,
  /\beventueel\b\s*/gi,
  /\b(alsjeblieft|alstublieft|a\.u\.b\.?|aub|svp)\b[\s,!]*/gi,
  /\bgewoon\b\s*/gi,
  /\beigenlijk\b\s*/gi,
  /\btoevallig\b\s*/gi,
  /\bzeg maar\b,?\s*/gi,
  /\bbest wel\b\s*/gi,
  /\s*\b(of zo|enzo|en zo)\b/gi,
  /\bheel erg\b\s*/gi,
];

/**
 * Werkwoorden in de infinitief en hoe ze als opdracht beginnen. Een `~` is de
 * plek van het lijdend voorwerp bij een scheidbaar werkwoord: "samenvatten"
 * wordt "Vat ~ samen", dus "Vat het rapport samen".
 */
const VERBS: Record<string, string> = {
  maken: 'Maak ~',
  schrijven: 'Schrijf ~',
  geven: 'Geef ~',
  bedenken: 'Bedenk ~',
  vertalen: 'Vertaal ~',
  herschrijven: 'Herschrijf ~',
  verbeteren: 'Verbeter ~',
  controleren: 'Controleer ~',
  beoordelen: 'Beoordeel ~',
  vergelijken: 'Vergelijk ~',
  analyseren: 'Analyseer ~',
  formuleren: 'Formuleer ~',
  vertellen: 'Vertel ~',
  noemen: 'Noem ~',
  zoeken: 'Zoek ~',
  berekenen: 'Bereken ~',
  corrigeren: 'Corrigeer ~',
  genereren: 'Genereer ~',
  ontwerpen: 'Ontwerp ~',
  beantwoorden: 'Beantwoord ~',
  structureren: 'Structureer ~',
  vereenvoudigen: 'Vereenvoudig ~',
  verklaren: 'Verklaar ~',
  uitleggen: 'Leg ~ uit',
  samenvatten: 'Vat ~ samen',
  opstellen: 'Stel ~ op',
  nakijken: 'Kijk ~ na',
  opsommen: 'Som ~ op',
  toelichten: 'Licht ~ toe',
  inkorten: 'Kort ~ in',
  aanpassen: 'Pas ~ aan',
  omzetten: 'Zet ~ om',
  uitzoeken: 'Zoek ~ uit',
  opzoeken: 'Zoek ~ op',
  doorlezen: 'Lees ~ door',
  voorbereiden: 'Bereid ~ voor',
  uitwerken: 'Werk ~ uit',
};
const VERB_ALT = Object.keys(VERBS).join('|');
const MODAL = '(?:kun|kan|kunt|zou|zoudt|wil|wilt)';
const YOU = '(?:je|jij|u)';
const TO_ME = '(?:(?:mij|me|voor mij|voor me|ons|voor ons)\\s+)?';

/**
 * "Ik vroeg me af of je ..." telt als omhaal, maar gaat er alleen af als de rest
 * een opdracht wordt: "ik vroeg me af wat X is" blijft anders een losse bijzin.
 */
const OPENER = /^(?:ik vroeg me af|ik zat te denken|ik wilde vragen)\b,?\s*(?=of\s+(?:je|jij|u)\b)/i;

/** "Kun je (mij) X maken?" en "Zou je X kunnen schrijven?" */
const ASK_FRONT = new RegExp(
  `^${MODAL}\\s+${YOU}\\s+${TO_ME}(.*?)\\s*(?:kunnen\\s+|willen\\s+)?(${VERB_ALT})\\b(.*)$`,
  'i',
);
/** Wat overblijft van "ik vroeg me af of je X zou kunnen maken". */
const ASK_OF = new RegExp(
  `^(?:of\\s+)?${YOU}\\s+${TO_ME}(.*?)\\s*${MODAL}\\s+(?:kunnen\\s+|willen\\s+)?(${VERB_ALT})\\b(.*)$`,
  'i',
);
/**
 * De vervoegde vorm in een bijzin: "dat je de tekst nakijkt". Uit het patroon
 * van de opdracht: het deeltje vooraan, en een t achter de stam als die er nog
 * niet staat ("maakt", "vertaalt", maar "zet" blijft "omzet").
 */
const FINITE: Record<string, string> = Object.fromEntries(
  Object.entries(VERBS).map(([infinitive, pattern]) => {
    const [stem, , particle = ''] = pattern.toLowerCase().split(' ');
    return [`${particle}${stem}${stem.endsWith('t') ? '' : 't'}`, infinitive];
  }),
);
/** "Ik wil (graag) dat je X maakt" is een omweg voor "Maak X". */
const WANT_THAT = new RegExp(
  `^ik (?:wil|zou) (?:graag |heel graag )?(?:willen )?dat ${YOU}\\s+${TO_ME}(.*?)\\s*(${Object.keys(FINITE).join('|')})\\b(.*)$`,
  'i',
);
/** "Heb je (een paar) tips voor X?" */
const HAVE_YOU = /^(?:heb|hebt|heeft) (?:je|jij|u) (?:nog )?((?:een paar |enkele |wat |een )?(?:goede |leuke |concrete )?(?:tips|ideeën|suggesties|voorbeelden|namen|titels|opties|alternatieven|argumenten)\b)(.*)$/i;

/** Een gevraagde vorm of een taak die de vorm al vastlegt. */
const HAS_FORMAT =
  /\b(kort|korte|beknopt|bondig|tabel|opsomming|bullets?|punten|maximaal|hoogstens|max\.?|stappenplan|\d+ (woorden|zinnen|punten|regels|alinea'?s|tips|ideeën|voorbeelden|vragen|stappen)|(een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien) (woorden|zinnen|zin|punten|regels|alinea'?s|tips|ideeën|voorbeelden|vragen|stappen)|vertaal|herschrijf|corrigeer|nakijken|kijk .* na|spelling|spelfouten|taalfouten|grammatica)\b/i;

/** Welke vorm past bij welke vraag; de eerste die past wint. */
const FORMAT_HINTS: [RegExp, string][] = [
  [/\b(vergelijk|vergelijking|verschil(len)?|versus|vs\.?)\b/i, 'Zet het in een tabel.'],
  [/\b(vat .*samen|samenvatting|samenvatten)\b/i, 'Gebruik hoogstens vijf punten.'],
  [/\b(tips|ideeën|suggesties|voorbeelden|opties|namen|titels|argumenten|stappen|lijst)\b/i, 'Gebruik hoogstens vijf punten.'],
  [/\b(mail|e-mail|brief|bericht|tekst|nieuwsbrief)\b/i, 'Hoogstens 150 woorden.'],
  [/\b(leg .*uit|uitleg|verklaar|wat is|wat zijn|waarom|hoe werkt)\b/i, 'Antwoord in hoogstens drie zinnen.'],
];

export interface PromptCheckResult {
  /** Hoeveel losse vulwoorden en beleefdheden eruit kunnen. */
  fillers: number;
  /** Aantal woorden nu en in het voorstel. */
  wordsBefore: number;
  wordsAfter: number;
  /** Het voorstel, zonder de toegevoegde vorm. */
  core: string;
  /** De vorm die erachter komt, of null als die er al staat of niets past. */
  format: string | null;
  /** Voorstel en vorm samen: dit komt in het tekstvak. */
  suggestion: string;
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function imperative(verb: string, object: string, rest: string): string {
  const pattern = VERBS[verb.toLowerCase()];
  // "kun je het even uitleggen": dat even hoort bij de vraag, niet bij de opdracht.
  const obj = object.replace(/\s*\beven$/i, '').trim();
  const body = obj ? pattern.replace('~', obj) : pattern.replace(' ~', '');
  return `${body}${rest}`;
}

/** Eén zin zonder omhaal: vulwoorden weg, vraag wordt opdracht. */
function tightenSentence(sentence: string): string {
  let s = sentence.trim();
  for (const filler of FILLERS) s = s.replace(filler, ' ');
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?:;])/g, '$1').trim();
  s = s.replace(/^[,.;:!?\s]+/, '').replace(/^(en|maar|dus)\s+/i, '');

  let asTask = false;
  const withoutOpener = s.replace(OPENER, '');
  let match = ASK_FRONT.exec(s) ?? ASK_OF.exec(withoutOpener);
  const want = match ? null : WANT_THAT.exec(s);
  if (match) {
    s = imperative(match[2], match[1], match[3]);
    asTask = true;
  } else if (want) {
    s = imperative(FINITE[want[2].toLowerCase()], want[1], want[3]);
    asTask = true;
  } else if ((match = HAVE_YOU.exec(s))) {
    s = `Geef ${match[1]}${match[2]}`;
    asTask = true;
  }
  s = s.replace(/[,\s]+$/, '').trim();
  if (!s) return '';
  // Een vraag die een opdracht werd, eindigt op een punt.
  if (asTask) s = s.replace(/[?!.]+$/, '') + '.';
  else if (!/[.?!]$/.test(s)) s += '.';
  s = s.replace(/!+$/, '.');
  return capitalize(s);
}

/**
 * Kijkt of het bericht korter en scherper kan. Geeft null als er niets te winnen
 * is, of als het bericht niet iets is om in te korten (een eigen prompt, een
 * lange opdracht, een wens voor het geheugen).
 */
export function checkPrompt(text: string): PromptCheckResult | null {
  const clean = text.trim();
  if (!clean || clean.length > MAX_CHARS) return null;
  if (OWN_PROMPT.test(clean) || hasMemoryTrigger(clean)) return null;

  let fillers = 0;
  for (const filler of FILLERS) {
    const flags = filler.flags.includes('g') ? filler.flags : `${filler.flags}g`;
    fillers += (clean.match(new RegExp(filler.source, flags)) ?? []).length;
  }

  if (OPENER.test(clean) || WANT_THAT.test(clean)) fillers += 1;

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const core = sentences
    .map(tightenSentence)
    .filter((s) => s.length > 1 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .join(' ');
  if (!core) return null;

  const format = HAS_FORMAT.test(core)
    ? null
    : (FORMAT_HINTS.find(([pattern]) => pattern.test(core))?.[1] ?? null);
  const suggestion = format ? `${core} ${format}` : core;

  const wordsBefore = countWords(clean);
  const wordsAfter = countWords(suggestion);

  // Alleen een seintje als er echt iets te halen valt: minstens twee vulwoorden,
  // of één en dan ook nog een vorm erbij. Een korte, nette vraag laten we met rust.
  const worthIt = fillers >= 2 || (fillers >= 1 && format !== null);
  if (!worthIt || suggestion === clean) return null;

  return { fillers, wordsBefore, wordsAfter, core, format, suggestion };
}
