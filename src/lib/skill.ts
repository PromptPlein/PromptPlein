/**
 * Datamodel + serialisatie voor de Skill Creator.
 *
 * Een skill is hier één prompt: een vaste instructie die de medewerker één keer
 * in een AI-omgeving plakt (een Mistral-agent, een projectinstructie, een ander
 * pakket), waarna de AI elke invoer op dezelfde manier afhandelt. Wie hem als
 * Agent Skill wil gebruiken, downloadt dezelfde tekst als SKILL.md met een
 * naam en een beschrijving erboven.
 *
 * De vragen zijn zo gekozen dat ze ophalen wat het model zonder skill NIET
 * weet. "Wat zou een slimme nieuwe collega hier fout doen?" levert meer op dan
 * "wat zijn de regels?", omdat het de kennis boven tafel haalt die iemand
 * zelf niet meer als regel ziet.
 */

/** Hoe strak het resultaat elke keer moet zijn. */
export type SkillStrakheid = 'vast' | 'onderdelen' | 'vrij';

export const SKILL_STRAKHEID: { value: SkillStrakheid; label: string; hint: string }[] = [
  {
    value: 'vast',
    label: 'Vast sjabloon',
    hint: 'Elke keer precies dezelfde koppen in dezelfde volgorde. Voor feedback of een toets die vergelijkbaar moet zijn.',
  },
  {
    value: 'onderdelen',
    label: 'Vaste onderdelen, eigen invulling',
    hint: 'De koppen liggen vast, de lengte en de invulling eronder zijn vrij.',
  },
  {
    value: 'vrij',
    label: 'Eigen oordeel',
    hint: 'De AI kiest zelf de vorm, maar weet wat er minstens in moet staan.',
  },
];

/**
 * De velden die de AI kan voorstellen ('skill-draft'). De id's zijn gelijk aan
 * SKILL_DRAFT_FIELDS in de edge function.
 */
export type SkillVeldId =
  | 'niet_gebruiken'
  | 'valkuilen'
  | 'werkwijze'
  | 'resultaat'
  | 'bronnen'
  | 'grenzen';

export const SKILL_VELDEN: { id: SkillVeldId; vraag: string; placeholder: string; rows: number }[] = [
  {
    id: 'niet_gebruiken',
    vraag: 'Wanneer hoort deze skill er juist niet bij?',
    placeholder: 'Bijv. vragen over de inhoud van het beleid zelf; die gaan naar de beleidsdirectie',
    rows: 2,
  },
  {
    id: 'valkuilen',
    vraag: 'Wat zou een slimme nieuwe collega hier fout doen?',
    placeholder: 'Bijv. schrijft "u" en "uw" met een hoofdletter, of noemt een termijn zonder het wetsartikel',
    rows: 3,
  },
  {
    id: 'werkwijze',
    vraag: 'Hoe pak jij het zelf aan, stap voor stap?',
    placeholder: '1. Eerst lees ik ...\n2. Dan controleer ik ...\n3. ...',
    rows: 4,
  },
  {
    id: 'resultaat',
    vraag: 'Hoe ziet een goed resultaat eruit? Plak een voorbeeld, of noem de vaste onderdelen.',
    placeholder: 'Bijv. Samenvatting, Wat goed is, Wat beter moet (met regelnummer), Advies',
    rows: 4,
  },
  {
    id: 'bronnen',
    vraag: 'Welke afspraken, regels of documenten gelden hier?',
    placeholder: 'Plak de kern. Hele documenten koppel je later als kennis in je eigen AI-omgeving.',
    rows: 3,
  },
  {
    id: 'grenzen',
    vraag: 'Wat mag nooit, en wanneer moet de AI doorverwijzen naar een mens?',
    placeholder: 'Bijv. nooit een juridisch oordeel geven; bij een klacht doorverwijzen naar de klachtencoördinator',
    rows: 2,
  },
];

/** Eén testverzoek uit de triggertest, met het oordeel van de gebruiker. */
export interface SkillTestVerzoek {
  tekst: string;
  /** Wat de AI uit de beschrijving afleidde. */
  aiDacht: boolean;
  /** Wat de gebruiker vindt; begint gelijk aan aiDacht. */
  hoortErbij: boolean;
}

/** De volledige staat van de Skill Creator. */
export interface SkillData {
  /** Wat de medewerker de AI nu telkens opnieuw moet uitleggen. */
  kern: string;
  /** Drie verzoeken zoals de medewerker ze echt intikt. */
  verzoeken: string;
  velden: Record<SkillVeldId, string>;
  strakheid: SkillStrakheid;
  naam: string;
  beschrijving: string;
}

export function emptySkill(): SkillData {
  return {
    kern: '',
    verzoeken: '',
    velden: {
      niet_gebruiken: '',
      valkuilen: '',
      werkwijze: '',
      resultaat: '',
      bronnen: '',
      grenzen: '',
    },
    strakheid: 'vast',
    naam: '',
    beschrijving: '',
  };
}

/** Is er genoeg ingevuld om een zinvolle skill te bouwen? */
export function skillHasContent(d: SkillData): boolean {
  return Boolean(d.kern.trim());
}

/**
 * Maakt van een vrije naam een geldige skillnaam: kleine letters, cijfers en
 * koppeltekens, hoogstens 64 tekens. Accenten vallen weg ("één" wordt "een").
 */
export function skillSlug(naam: string): string {
  const slug = naam
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'mijn-skill';
}

/** De beschrijving mag in het skillformaat hoogstens 1024 tekens zijn. */
export const SKILL_DESCRIPTION_MAX = 1024;

const STRAKHEID_LABEL: Record<SkillStrakheid, string> = {
  vast: 'Vast sjabloon',
  onderdelen: 'Vaste onderdelen',
  vrij: 'Eigen oordeel',
};

/**
 * Serialiseert de antwoorden tot gelabelde tekst voor de compose. De labels
 * sluiten aan op de secties die SKILL_STRUCTURE_INSTRUCTION in de edge
 * function voorschrijft, zodat elk antwoord op één plek terechtkomt.
 */
export function serializeSkill(d: SkillData): string {
  const parts: string[] = [];
  const add = (label: string, value: string) => {
    if (value.trim()) parts.push(`${label}:\n${value.trim()}`);
  };
  add('WAT DE AI ZONDER DEZE SKILL TELKENS UITGELEGD MOET KRIJGEN', d.kern);
  add('VOORBEELDVERZOEKEN ZOALS DE MEDEWERKER ZE INTIKT', d.verzoeken);
  add('BESCHRIJVING VAN DE SKILL (wanneer hij geldt)', d.beschrijving);
  add('WANNEER DEZE SKILL NIET GELDT', d.velden.niet_gebruiken);
  add('VALKUILEN (wat een nieuwe collega fout zou doen)', d.velden.valkuilen);
  add('AFSPRAKEN, REGELS EN BRONNEN', d.velden.bronnen);
  add('WERKWIJZE', d.velden.werkwijze);
  add('GOED RESULTAAT (voorbeeld of vaste onderdelen)', d.velden.resultaat);
  add('GRENZEN EN DOORVERWIJZEN', d.velden.grenzen);
  parts.push(`HOE STRAK: ${STRAKHEID_LABEL[d.strakheid]}`);
  return parts.join('\n\n');
}

/** Naam en beschrijving voor de kop van SKILL.md. */
export interface SkillMeta {
  naam: string;
  beschrijving: string;
}

/**
 * Zet de skillprompt om naar een SKILL.md: YAML-frontmatter met naam en
 * beschrijving, daaronder de prompt zelf. De beschrijving gaat als JSON-string
 * de frontmatter in; dat is geldige YAML en vangt dubbele punten en
 * aanhalingstekens in de tekst af.
 */
export function buildSkillMd(meta: SkillMeta, prompt: string): string {
  const description = (meta.beschrijving.trim() || 'Vaste werkwijze, gemaakt in PromptPlein.')
    .replace(/\s+/g, ' ')
    .slice(0, SKILL_DESCRIPTION_MAX);
  return [
    '---',
    `name: ${skillSlug(meta.naam)}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    prompt.trim(),
    '',
  ].join('\n');
}
