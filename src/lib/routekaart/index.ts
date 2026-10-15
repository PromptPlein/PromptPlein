// De vaste routekaart in rijksstijl. Het sjabloon 'Routekaart (rijksstijl)'
// (migratie 0039) levert een inhoudsblok met KOP, NAMEN, START, de haltes,
// FINISH en ONDERBALK. Vroeger ging dat blok samen met een lange bouwopdracht
// naar een taalmodel, dat de hele pagina elke keer opnieuw programmeerde; met
// Mistral kwam daar een pagina uit met een scriptfout of losse onderdelen die
// niet op elkaar aansloten. Nu leest deze module het blok en zet de inhoud in
// één vaste, zelf gebouwde pagina (routekaart.html). Zo ziet elke routekaart
// er hetzelfde uit en kan een fout van het model de pagina niet meer breken.

export interface RkItem {
  tekst: string;
  icoon?: string;
}

export interface RkStation {
  soort: 'start' | 'halte' | 'finish';
  /** "01", "02", … bij een halte. */
  nummer?: string;
  titel: string;
  datum?: string;
  kernvraag?: string;
  detailTitel?: string;
  themas: string[];
  label?: string;
  opDeHalte: string[];
  tussen: string[];
  resultaat: string[];
  opbrengst?: RkItem;
  opbrengstlabel: string[];
  uitkomsten: RkItem[];
}

export interface RoutekaartData {
  kop: {
    bovenregel: string;
    titel: string;
    ondertitel: string;
    rood: string;
    datum: string;
    stand: string;
  };
  namen: { rodeDraad: string; opDeHalte: string; tussen: string };
  stations: RkStation[];
  /** De halte uit Stand; 0 als Stand niet te vinden is. */
  standIndex: number;
  onderbalk: { eindresultaat: string; werkwijze: RkItem[] };
}

const SECTIE_KOP = /^(KOP|NAMEN|ONDERBALK)\s*:?\s*$/i;
const SECTIE_START = /^START\s*(?:[·:|]|\s-\s)\s*(.+)$/i;
const SECTIE_HALTE = /^HALTE\s*(\d{1,2})\s*(?:[·:|]|\s-\s)\s*(.+)$/i;
const SECTIE_FINISH = /^FINISH\s*(?:[·:|]|\s-\s)\s*(.+)$/i;
const REGEL = /^([A-Za-zÀ-ÿ' ]{3,40}?)\s*:\s*(.*)$/;

/** Markdown-resten weghalen die een model er soms omheen zet. */
function schoon(regel: string): string {
  return regel
    .replace(/^\s*(?:[-*•]\s+|#{1,6}\s+)/, '')
    .replace(/\*\*/g, '')
    .trim();
}

function delen(waarde: string): string[] {
  return waarde
    .split(/\s*·\s*/)
    .map((d) => d.trim())
    .filter(Boolean);
}

function metIcoon(deel: string): RkItem {
  const m = deel.match(/^(.*?)\s*\(\s*icoon\s*:\s*([^)]+)\)\s*$/i);
  if (!m) return { tekst: deel.trim() };
  return { tekst: m[1].trim(), icoon: m[2].trim().toLowerCase() };
}

function sleutel(naam: string): string {
  return naam
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

function nieuwStation(soort: RkStation['soort'], titel: string, nummer?: string): RkStation {
  return {
    soort,
    nummer,
    titel: titel.trim(),
    themas: [],
    opDeHalte: [],
    tussen: [],
    resultaat: [],
    opbrengstlabel: [],
    uitkomsten: [],
  };
}

/**
 * Leest het inhoudsblok van een routekaart. Werkt op het blok zelf en op de hele
 * opdracht waar het in staat (dan begint het bij de regel KOP en stopt het bij
 * de volgende kop met ##). Geeft null als er geen bruikbare routekaart in staat:
 * zonder titel, of met minder dan twee haltes inclusief Start en Finish.
 */
export function parseRoutekaart(tekst: string): RoutekaartData | null {
  const regels = tekst.replace(/\r\n/g, '\n').split('\n');
  const begin = regels.findIndex((r) => /^KOP\s*:?\s*$/i.test(schoon(r)));
  if (begin < 0) return null;

  const data: RoutekaartData = {
    kop: { bovenregel: '', titel: '', ondertitel: '', rood: '', datum: '', stand: '' },
    namen: { rodeDraad: '', opDeHalte: '', tussen: '' },
    stations: [],
    standIndex: 0,
    onderbalk: { eindresultaat: '', werkwijze: [] },
  };
  let sectie: 'kop' | 'namen' | 'onderbalk' | 'station' | null = null;
  let station: RkStation | null = null;

  for (let i = begin; i < regels.length; i++) {
    const ruw = regels[i];
    // Het blok houdt op bij de volgende sectiekop van de opdracht (## Uit de inhoud afleiden).
    if (i > begin && /^\s*##\s/.test(ruw)) break;
    const regel = schoon(ruw);
    if (!regel) continue;

    const kopMatch = regel.match(SECTIE_KOP);
    if (kopMatch) {
      sectie = kopMatch[1].toLowerCase() as 'kop' | 'namen' | 'onderbalk';
      station = null;
      continue;
    }
    const start = regel.match(SECTIE_START);
    const halte = regel.match(SECTIE_HALTE);
    const finish = regel.match(SECTIE_FINISH);
    if (start || halte || finish) {
      station = start
        ? nieuwStation('start', start[1])
        : halte
          ? nieuwStation('halte', halte[2], halte[1].padStart(2, '0'))
          : nieuwStation('finish', finish![1]);
      data.stations.push(station);
      sectie = 'station';
      continue;
    }

    const m = regel.match(REGEL);
    if (!m) continue;
    const k = sleutel(m[1]);
    const v = m[2].trim();

    if (sectie === 'kop') {
      if (k === 'bovenregel') data.kop.bovenregel = v;
      else if (k === 'titel') data.kop.titel = v;
      else if (k === 'ondertitel') data.kop.ondertitel = v;
      else if (k === 'roodindeondertitel') data.kop.rood = v;
      else if (k === 'datum') data.kop.datum = v;
      else if (k === 'stand') data.kop.stand = v;
    } else if (sectie === 'namen') {
      if (k === 'rodedraad') data.namen.rodeDraad = v;
      else if (k === 'opdehalte') data.namen.opDeHalte = v;
      else if (k === 'tussendehaltes') data.namen.tussen = v;
    } else if (sectie === 'onderbalk') {
      if (k === 'eindresultaat') data.onderbalk.eindresultaat = v;
      else if (k === 'werkwijze') data.onderbalk.werkwijze = delen(v).map(metIcoon);
    } else if (sectie === 'station' && station) {
      if (k === 'datum') station.datum = v;
      else if (k === 'kernvraag') station.kernvraag = v;
      else if (k === 'titelinhetdetailpaneel') station.detailTitel = v;
      else if (k === 'themas') station.themas = delen(v);
      else if (k === 'label') station.label = v;
      else if (k === 'opdehalte') station.opDeHalte = delen(v);
      else if (k === 'tussendehaltes') station.tussen = delen(v);
      else if (k === 'resultaat') station.resultaat = delen(v);
      else if (k === 'opbrengst') station.opbrengst = metIcoon(v);
      else if (k === 'opbrengstlabel') station.opbrengstlabel = delen(v);
      else if (k === 'uitkomsten') station.uitkomsten = delen(v).map(metIcoon);
    }
  }

  if (!data.kop.titel || data.stations.length < 2) return null;

  // Ontbrekende namen: dezelfde standaard als de schrijfprompt van het sjabloon.
  data.namen.rodeDraad ||= 'De rode draad';
  data.namen.opDeHalte ||= 'Bijeenkomst';
  data.namen.tussen ||= 'Tussendoor';

  const stand = sleutel(data.kop.stand);
  const gevonden = stand
    ? data.stations.findIndex(
        (s) => sleutel(s.titel) === stand || (stand === 'start' && s.soort === 'start'),
      )
    : -1;
  data.standIndex = gevonden >= 0 ? gevonden : 0;
  return data;
}

/** Bestandsnaam naar de titel: kleine letters, koppeltekens, .html erachter. */
export function routekaartBestandsnaam(data: RoutekaartData): string {
  const slug = data.kop.titel
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'routekaart'}.html`;
}

function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Zet de inhoud in de vaste pagina. De pagina zelf wordt pas bij gebruik
 * geladen, zodat hij buiten de startbundel blijft.
 */
export async function buildRoutekaartHtml(data: RoutekaartData): Promise<string> {
  const { default: sjabloon } = await import('./routekaart.html?raw');
  // `<` als <: zo kan geen tekst uit de inhoud het scriptblok afsluiten.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return sjabloon
    .replace('__ROUTEKAART_TITEL__', () => escapeHtml(data.kop.titel))
    .replace('__ROUTEKAART_DATA__', () => json);
}
