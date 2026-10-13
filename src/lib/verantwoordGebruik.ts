/**
 * Herkenning van overheidskaders in wat de medewerker intikt. Twee gebruikers:
 *
 * 1. De wijzer onder het invoerveld (VerantwoordGebruikHint): raakt de opdracht
 *    aan besluiten over burgers, persoonsgegevens of vertrouwelijke informatie,
 *    dan wijzen we op de instrumenten die de overheid daarvoor heeft
 *    (Beslishulp AI-verordening, Algoritmekader, IAMA, pre-scan DPIA). Zo vraagt
 *    het Overheidsbreed standpunt generatieve AI het ook: eerst nut, noodzaak en
 *    risico's bepalen.
 * 2. De selectie van de overheidskaders voor de bouwer ({@link selectKaders}):
 *    alleen de kaders die bij de opdracht horen gaan mee. Die keuze laten we
 *    bewust niet aan het model over. Een klein model dat "neem dit alleen op als
 *    het geldt" krijgt, neemt alles op, ook bij een besluitenlijst van een
 *    teamoverleg.
 *
 * Eenvoudige woordherkenning in de browser: er gaat niets naar buiten, en een
 * gemiste melding kost minder dan een melding bij elke brief.
 */

export type KaderId =
  | 'besluiten'
  | 'persoonsgegevens'
  | 'publiekstekst'
  | 'openbaarheid'
  | 'beveiliging';

export interface VerantwoordLink {
  label: string;
  href: string;
}

export interface VerantwoordSignaal {
  id: KaderId;
  titel: string;
  tekst: string;
  links: VerantwoordLink[];
}

interface Kader {
  id: KaderId;
  /** Herkent de opdracht; krijgt de tekst in kleine letters. */
  test: (t: string) => boolean;
  /** Melding onder het invoerveld; zonder melding telt het kader alleen voor de bouwer. */
  hint?: Omit<VerantwoordSignaal, 'id'>;
}

const KADERS: Kader[] = [
  {
    id: 'besluiten',
    test: (t) =>
      (/\b(toekenn|toe te kennen|toewijz|toe te wijzen|afwijz|af te wijzen|weiger|selecter|beslis|besluit\w* (over|nemen)|beoordeel\w* (de |van |een )?(aanvra|bezwa|dossier|melding)|sanctie|boete|fraude|risico-?(inschatting|score|profiel|selectie)|handhav)/.test(
        t,
      ) &&
        /\b(burger|inwoner|aanvrager|aanvra|cli[eë]nt|bedrijf|bedrijven|ondernemer|uitkering|bijstand|toeslag|subsidie|vergunning|belastingplichtige|student|sollicitant)/.test(
          t,
        )) ||
      /\b(algoritme|ai-systeem|machine learning|model trainen|automatische (beoordeling|besluitvorming|selectie))/.test(
        t,
      ),
    hint: {
      titel: 'AI bij een besluit over burgers of bedrijven',
      tekst:
        'Laat de AI alleen een voorstel doen en laat een medewerker beslissen. Bij structurele inzet gelden de AI-verordening en het Algoritmekader, en hoort het algoritme in het Algoritmeregister.',
      links: [
        {
          label: 'Beslishulp AI-verordening',
          href: 'https://algoritmes.rijksapp.nl/beslishulp-ai-verordening',
        },
        { label: 'Algoritmekader', href: 'https://minbzk.github.io/Algoritmekader/' },
        {
          label: 'IAMA',
          href: 'https://minbzk.github.io/Algoritmekader/voldoen-aan-wetten-en-regels/hulpmiddelen/IAMA/',
        },
      ],
    },
  },
  {
    id: 'persoonsgegevens',
    test: (t) =>
      /\b(persoonsgegevens|dossiers?\b|klantgegevens|cli[eë]ntgegevens|bsn|burgerservicenummer|medische?|gezondheidsgegevens|naw|adresgegevens|personeelsdossier|sollicita|bezwaarschrift|klachtbrief|e-mails? van (burgers|inwoners|klanten))/.test(
        t,
      ),
    hint: {
      titel: 'Werken met persoonsgegevens',
      tekst:
        'Plak alleen geanonimiseerde of verzonnen gegevens in de AI-chat. Gaat het om een nieuwe verwerking van persoonsgegevens, doe dan eerst een pre-scan DPIA.',
      links: [
        { label: 'Invulhulp pre-scan, DPIA en IAMA', href: 'https://invulhulpen.rijksapp.nl/' },
        {
          label: 'DPIA in het Algoritmekader',
          href: 'https://minbzk.github.io/Algoritmekader/voldoen-aan-wetten-en-regels/hulpmiddelen/DPIA/',
        },
      ],
    },
  },
  {
    id: 'publiekstekst',
    test: (t) =>
      /\b(publiekste?kst|webtekst|burgerbrief|b1)\b/.test(t) ||
      (/\b(burgers?|inwoners?|bewoners?|ondernemers?|het publiek)\b/.test(t) &&
        /\b(brief|brieven|tekst|website|webpagina|nieuwsbrief|folder|bericht|mail|faq|uitleg|publicatie|persbericht|antwoord)/.test(
          t,
        )),
  },
  {
    id: 'openbaarheid',
    test: (t) =>
      /\b(woo|wob|woo-verzoek|woo-besluit|openbaarmaking|openbaar (te )?maken|weglakken|lakken|informatieverzoek)\b/.test(
        t,
      ),
  },
  {
    id: 'beveiliging',
    test: (t) =>
      /\b(gerubriceerd|staatsgeheim|departementaal vertrouwelijk|stg\.? ?(confidentieel|geheim|zeer geheim)|vertrouwelijke? (stukken|informatie|documenten))/.test(
        t,
      ),
    hint: {
      titel: 'Vertrouwelijke of gerubriceerde informatie',
      tekst:
        'Plak geen gerubriceerde of vertrouwelijke informatie in een AI-chat. De BIO en het beveiligingsbeleid van je eigen organisatie gelden.',
      links: [],
    },
  },
];

/** De kaders die bij deze tekst horen, in vaste volgorde. */
export function detectKaders(text: string): KaderId[] {
  const t = text.toLowerCase();
  if (t.trim().length < 12) return [];
  return KADERS.filter((k) => k.test(t)).map((k) => k.id);
}

/** De meldingen voor onder het invoerveld. */
export function detectVerantwoordSignalen(text: string): VerantwoordSignaal[] {
  const found = new Set(detectKaders(text));
  return KADERS.filter((k) => k.hint && found.has(k.id)).map((k) => ({ id: k.id, ...k.hint! }));
}

const KADER_IDS = new Set<string>(KADERS.map((k) => k.id));

/**
 * Kiest uit de kadertekst van Beheer de blokken die bij deze opdracht horen.
 * De tekst bestaat uit een kop en blokken als `<persoonsgegevens>…</persoonsgegevens>`.
 * Een blok met een bekende naam gaat alleen mee als de opdracht eronder valt;
 * een blok met een eigen naam van de beheerder gaat altijd mee. Valt de opdracht
 * onder geen enkel bekend blok en is er geen eigen blok, dan gaat er niets mee.
 * Staan er helemaal geen blokken in, dan gaat de tekst ongewijzigd mee.
 */
export function selectKaders(instruction: string, opdracht: string): string | undefined {
  const text = instruction.trim();
  if (!text) return undefined;
  const blocks = [...text.matchAll(/<([a-z_-]+)>([\s\S]*?)<\/\1>/g)];
  if (blocks.length === 0) return text;
  const found = new Set<string>(detectKaders(opdracht));
  const kept = blocks.filter(([, id]) => !KADER_IDS.has(id) || found.has(id));
  if (kept.length === 0) return undefined;
  const head = text.slice(0, blocks[0].index).trim();
  return [head, ...kept.map(([block]) => block.trim())].filter(Boolean).join('\n\n');
}
