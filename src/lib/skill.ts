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

/**
 * Gegevens om de skill als plugin te delen: wat publiccode.yml, het
 * pluginmanifest en de herkomst in SKILL.md nodig hebben. Komt niet in de
 * instructie zelf.
 */
export interface SkillPublicatie {
  /** Organisatie die eigenaar is van de afspraken in de skill. */
  organisatie: string;
  /** Team of contactpersoon dat de skill beheert. */
  contact: string;
  /** Adres voor vragen; bij voorkeur een teammailbox. */
  email: string;
  /** URL van de repository waar de plugin komt te staan; mag leeg. */
  repository: string;
  /** SPDX-code van de licentie, standaard EUPL-1.2. */
  licentie: string;
  /** Wie de skill heeft goedgekeurd; leeg betekent dat hij een concept is. */
  goedgekeurdDoor: string;
}

export const DEFAULT_SKILL_LICENTIE = 'EUPL-1.2';

function emptyPublicatie(): SkillPublicatie {
  return {
    organisatie: '',
    contact: '',
    email: '',
    repository: '',
    licentie: DEFAULT_SKILL_LICENTIE,
    goedgekeurdDoor: '',
  };
}

/** Een eenvoudige controle op de vorm van een e-mailadres. */
function isEmailAdres(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
  publicatie: SkillPublicatie;
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
    publicatie: emptyPublicatie(),
  };
}

/** Eén punt dat nog openstaat voor een volledige skill, met het veld waar het hoort. */
export interface SkillOpenPunt {
  /** Id van het invoerveld, om ernaartoe te springen. */
  veld: string;
  tekst: string;
}

const VELD_KORT: Record<SkillVeldId, string> = {
  niet_gebruiken: 'Wanneer de skill niet geldt',
  valkuilen: 'Valkuilen',
  werkwijze: 'Werkwijze',
  resultaat: 'Goed resultaat',
  bronnen: 'Afspraken en bronnen',
  grenzen: 'Grenzen en doorverwijzen',
};

/**
 * Wat er nog ontbreekt voor een volledige skill en een plugin zonder
 * invulplekken. `openVragen` zijn de vragen van de AI bij velden die nog
 * precies het voorstel bevatten: die vraag is dan nog niet beantwoord.
 */
export function skillOpenPunten(
  d: SkillData,
  openVragen: Partial<Record<SkillVeldId, string>> = {},
): SkillOpenPunt[] {
  const punten: SkillOpenPunt[] = [];
  for (const { id } of SKILL_VELDEN) {
    const vraag = openVragen[id];
    if (vraag) punten.push({ veld: `sk-${id}`, tekst: `${VELD_KORT[id]}: ${vraag}` });
    else if (!d.velden[id].trim()) punten.push({ veld: `sk-${id}`, tekst: `${VELD_KORT[id]}: nog leeg` });
  }
  if (!d.naam.trim()) punten.push({ veld: 'sk-naam', tekst: 'Naam: nog leeg' });
  if (!d.beschrijving.trim()) punten.push({ veld: 'sk-beschrijving', tekst: 'Beschrijving: nog leeg' });
  const p = d.publicatie;
  if (!p.organisatie.trim()) punten.push({ veld: 'sk-organisatie', tekst: 'Eigenaar van de afspraken: nog leeg' });
  if (!p.contact.trim()) punten.push({ veld: 'sk-contact', tekst: 'Beheerder van de skill: nog leeg' });
  if (!p.email.trim()) punten.push({ veld: 'sk-email', tekst: 'E-mailadres voor vragen: nog leeg' });
  else if (!isEmailAdres(p.email)) punten.push({ veld: 'sk-email', tekst: 'E-mailadres voor vragen: geen geldig adres' });
  if (!p.repository.trim()) punten.push({ veld: 'sk-repository', tekst: 'Plek van de repository: nog leeg' });
  if (!p.licentie.trim()) punten.push({ veld: 'sk-licentie', tekst: 'Licentie: nog leeg' });
  return punten;
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

/**
 * Wat er in de kop van SKILL.md komt. Naast naam en beschrijving de herkomst
 * die de skills-marketplace van developer.overheid.nl per skill vastlegt
 * (verantwoording onder het Overheidsbreed standpunt generatieve AI): of hij
 * met AI is gemaakt, met welk model, op welke datum, en dat hij een concept is
 * tot een eigenaar hem goedkeurt.
 */
export interface SkillMeta {
  naam: string;
  beschrijving: string;
  /** De afspraken en bronnen uit de Skill Creator; gaan in de plugin mee als referentie. */
  bronnen?: string;
  /** Het model dat de skill schreef; leeg als de AI-service niet bereikbaar was. */
  model?: string;
  /** Eigenaar, beheerder, licentie en goedkeuring; vullen de invulplekken van de plugin. */
  publicatie?: SkillPublicatie;
}

/** Ingevulde waarde, of de invulplek tussen rechte haken. */
const ofInvulplek = (value: string | undefined, plek: string) => value?.trim() || `[${plek}]`;

/** Pad van het referentiebestand, relatief aan SKILL.md. */
const BRONNEN_PAD = 'references/bronnen.md';

function skillDescription(meta: SkillMeta): string {
  return (meta.beschrijving.trim() || 'Vaste werkwijze, gemaakt in PromptPlein.')
    .replace(/\s+/g, ' ')
    .slice(0, SKILL_DESCRIPTION_MAX);
}

/** Datum van vandaag als JJJJ-MM-DD, in lokale tijd. */
function vandaag(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Zet de skillprompt om naar een SKILL.md: YAML-frontmatter met naam,
 * beschrijving en herkomst, daaronder de prompt zelf. De beschrijving gaat als
 * JSON-string de frontmatter in; dat is geldige YAML en vangt dubbele punten en
 * aanhalingstekens in de tekst af.
 *
 * Met `metReferentie` verwijst de skill onderaan naar het bronnenbestand dat in
 * de plugin naast SKILL.md staat.
 */
export function buildSkillMd(meta: SkillMeta, prompt: string, metReferentie = false): string {
  const model = meta.model?.trim();
  const lines = [
    '---',
    `name: ${skillSlug(meta.naam)}`,
    `description: ${JSON.stringify(skillDescription(meta))}`,
    'metadata:',
    `  created-with-ai: "${model ? 'true' : 'false'}"`,
    ...(model ? [`  created-with-model: ${JSON.stringify(model)}`] : []),
    `  created-date: "${vandaag()}"`,
    '  created-with: PromptPlein',
    ...(meta.publicatie?.goedgekeurdDoor.trim()
      ? ['  status: goedgekeurd', `  approved-by: ${JSON.stringify(meta.publicatie.goedgekeurdDoor.trim())}`]
      : ['  status: concept']),
    ...(meta.publicatie?.organisatie.trim()
      ? [`  owner: ${JSON.stringify(meta.publicatie.organisatie.trim())}`]
      : []),
    '---',
    '',
    prompt.trim(),
    '',
  ];
  if (metReferentie) {
    lines.push(
      '## Bronnen',
      '',
      `De volledige afspraken en bronnen bij deze skill staan in [${BRONNEN_PAD}](${BRONNEN_PAD}). Lees dat bestand wanneer een taak op die afspraken leunt.`,
      '',
    );
  }
  return lines.join('\n');
}

/** Extra bestanden voor de plugin die de aanroeper ophaalt; ontbreekt er een, dan blijft hij weg. */
export interface SkillPluginExtras {
  /** Volledige tekst van de EUPL-1.2, voor LICENSE. */
  licentie?: string;
}

/** Plugintekst in YAML als dubbel gequote string; JSON-escaping is geldige YAML. */
const yaml = (value: string) => JSON.stringify(value.replace(/\s+/g, ' ').trim());

/**
 * publiccode.yml volgens de opbouw van de plugins op developer.overheid.nl
 * (skills-internet, NeRDS): de metadata waarmee de open-sourcecatalogus van de
 * overheid een repository opneemt. Wat alleen de organisatie weet (de URL van
 * de repository, eigenaar, contactpersoon) staat tussen rechte haken.
 */
function buildPublicCode(meta: SkillMeta): string {
  const p = meta.publicatie;
  const naam = meta.naam.trim() || skillSlug(meta.naam);
  const beschrijving = skillDescription(meta).replace(/\s*Zoekwoorden:.*$/i, '');
  const kort = beschrijving.length > 150 ? `${beschrijving.slice(0, 147).trimEnd()}...` : beschrijving;
  const status = p?.goedgekeurdDoor.trim()
    ? `De skill is goedgekeurd door ${p.goedgekeurdDoor.trim()}.`
    : 'De skill heeft de status concept tot de eigenaar van de afspraken hem goedkeurt.';
  const lang = `${beschrijving} De skill is een vaste instructie voor een AI-assistent: de assistent pakt elke nieuwe invoer op dezelfde manier aan, volgens de werkwijze, valkuilen en grenzen die erin staan. Gemaakt met PromptPlein. ${status}`;
  const invulplekken = !p?.repository.trim() || !p.organisatie.trim() || !p.contact.trim() || !p.email.trim();
  return [
    '# Machine-leesbare metadata volgens de publiccode.yml-standaard, voor de',
    '# open-sourcecatalogus op developer.overheid.nl.',
    ...(invulplekken ? ['# Vul de regels met [ ] in voordat je de repository publiceert.'] : []),
    '',
    'publiccodeYmlVersion: "0.5"',
    '',
    `name: ${yaml(naam)}`,
    `url: ${yaml(ofInvulplek(p?.repository, 'URL van de repository, bijvoorbeeld https://github.com/organisatie/naam'))}`,
    'softwareType: addon',
    'developmentStatus: development',
    '',
    'platforms:',
    '  - linux',
    '  - mac',
    '  - windows',
    '',
    'description:',
    '  nl:',
    `    shortDescription: ${yaml(kort)}`,
    `    longDescription: ${yaml(lang)}`,
    '    features:',
    '      - Vaste werkwijze als skill voor AI-assistenten',
    '      - Te gebruiken in Claude Code, Codex en Cursor',
    '      - Herkomst en status in de kop van SKILL.md',
    '',
    'legal:',
    `  license: ${p?.licentie.trim() || DEFAULT_SKILL_LICENTIE}`,
    `  mainCopyrightOwner: ${yaml(ofInvulplek(p?.organisatie, 'naam van de organisatie'))}`,
    '',
    'maintenance:',
    '  type: internal',
    '  contacts:',
    `    - name: ${yaml(ofInvulplek(p?.contact, 'naam van het team of de contactpersoon'))}`,
    `      email: ${yaml(ofInvulplek(p?.email, 'e-mailadres'))}`,
    '',
    'localisation:',
    '  localisationReady: false',
    '  availableLanguages:',
    '    - nl',
    '',
    'intendedAudience:',
    '  countries:',
    '    - NL',
    '  scope:',
    '    - government',
    '',
  ].join('\n');
}

/**
 * Bouwt de skill als plugin in de mapstructuur van de skills-marketplace van
 * developer.overheid.nl, zoals skills-internet en NeRDS die hebben:
 * `.plugin/plugin.json` als bron, `.claude-plugin/` voor Claude Code (Codex
 * leest die ook) en `.cursor-plugin/` voor Cursor, de skill zelf in
 * `skills/<naam>/SKILL.md` met de bronnen in `references/`, en daarnaast
 * README, CHANGELOG, publiccode.yml en LICENSE. Een SKILL.md in de wortel wordt
 * door de marketplace niet gevonden.
 *
 * Geeft een lijst van pad en inhoud terug; de aanroeper pakt hem in.
 */
export function buildSkillPlugin(
  meta: SkillMeta,
  prompt: string,
  extras: SkillPluginExtras = {},
): Record<string, string> {
  const slug = skillSlug(meta.naam);
  const naam = meta.naam.trim() || slug;
  const bronnen = meta.bronnen?.trim() ?? '';
  const metReferentie = bronnen.length > 0;
  const p = meta.publicatie;
  const licentieCode = p?.licentie.trim() || DEFAULT_SKILL_LICENTIE;
  // Auteur, repository en licentie in het manifest; leeg blijft weg, zodat er
  // geen invulplek in JSON terechtkomt.
  const auteur =
    p?.contact.trim() || p?.organisatie.trim()
      ? {
          author: {
            name: p.contact.trim() || p.organisatie.trim(),
            ...(isEmailAdres(p.email) ? { email: p.email.trim() } : {}),
          },
        }
      : {};
  const extra = {
    ...auteur,
    ...(p?.repository.trim() ? { repository: p.repository.trim() } : {}),
    license: licentieCode,
  };
  const manifest = `${JSON.stringify(
    { name: slug, description: skillDescription(meta), version: '0.1.0', ...extra },
    null,
    2,
  )}\n`;
  const cursorManifest = `${JSON.stringify(
    { name: slug, displayName: naam, description: skillDescription(meta), version: '0.1.0', ...extra },
    null,
    2,
  )}\n`;
  // De EUPL-tekst gaat alleen mee als die ook gekozen is; een andere licentie
  // voegt de organisatie zelf toe.
  const licentie = licentieCode === DEFAULT_SKILL_LICENTIE ? extras.licentie?.trim() : undefined;

  const files: Record<string, string> = {
    [`${slug}/.plugin/plugin.json`]: manifest,
    [`${slug}/.claude-plugin/plugin.json`]: manifest,
    [`${slug}/.cursor-plugin/plugin.json`]: cursorManifest,
    [`${slug}/skills/${slug}/SKILL.md`]: buildSkillMd(meta, prompt, metReferentie),
    [`${slug}/publiccode.yml`]: buildPublicCode(meta),
    [`${slug}/CHANGELOG.md`]: [
      '# Changelog',
      '',
      `## 0.1.0 (${vandaag()})`,
      '',
      '### Toegevoegd',
      '',
      `* eerste versie van de skill ${slug}, gemaakt met PromptPlein (status concept)`,
      '',
    ].join('\n'),
    [`${slug}/README.md`]: [
      `# ${naam}`,
      '',
      skillDescription(meta),
      '',
      p?.goedgekeurdDoor.trim()
        ? `Gemaakt met PromptPlein en goedgekeurd door ${p.goedgekeurdDoor.trim()}.`
        : 'Gemaakt met PromptPlein. De skill heeft de status concept: laat hem nalezen door de beheerder van de afspraken voordat collega\'s hem gebruiken.',
      '',
      ...(p?.organisatie.trim() || p?.contact.trim()
        ? [
            `Eigenaar: ${ofInvulplek(p.organisatie, 'organisatie')}. Beheer: ${ofInvulplek(p.contact, 'team of contactpersoon')}${isEmailAdres(p.email) ? ` (${p.email.trim()})` : ''}.`,
            '',
          ]
        : []),
      '## Wat er in deze map staat',
      '',
      '| Bestand | Waarvoor |',
      '| --- | --- |',
      `| \`skills/${slug}/SKILL.md\` | De skill zelf: de instructie voor de AI-assistent, met herkomst en status in de kop |`,
      ...(metReferentie
        ? [`| \`skills/${slug}/${BRONNEN_PAD}\` | De afspraken en bronnen waar de skill op leunt |`]
        : []),
      '| `.plugin/plugin.json` | Beschrijving van de plugin; hieruit maakt de marketplace de andere twee |',
      '| `.claude-plugin/plugin.json` | Voor Claude Code en Codex |',
      '| `.cursor-plugin/plugin.json` | Voor Cursor |',
      '| `publiccode.yml` | Metadata voor de open-sourcecatalogus van de overheid |',
      ...(licentie ? ['| `LICENSE` | De licentie, EUPL-1.2 |'] : []),
      '| `CHANGELOG.md` | Wat er per versie veranderde |',
      '',
      'De mappen die met een punt beginnen zijn op een Mac en in Windows standaard verborgen. Op een Mac zie je ze in de Finder met Cmd+Shift+punt.',
      '',
      '## Installeren',
      '',
      'Claude Code, lokaal uitproberen:',
      '',
      '```bash',
      `claude --plugin-dir ./${slug}`,
      '```',
      '',
      `Je roept de skill daarna aan als \`/${slug}:${slug}\`, of de assistent kiest hem zelf op basis van de beschrijving.`,
      '',
      'Gebruik je geen Claude Code, plak dan de inhoud van SKILL.md (zonder de kop tussen de streepjeslijnen) als instructie in je eigen AI-omgeving.',
      '',
      '## Aanmelden bij de overheidsmarketplace',
      '',
      `De skills-marketplace van developer.overheid.nl (github.com/developer-overheid-nl/skills-marketplace) neemt plugins op die in een publieke repository staan, een open-source licentie hebben en Nederlandse documentatie hebben. Deze map bevat ${licentie ? 'de EUPL-1.2, de licentie die de overheid aanbeveelt. Kiest je organisatie een andere, vervang dan LICENSE en het veld license in publiccode.yml' : licentieCode === DEFAULT_SKILL_LICENTIE ? 'nog geen licentie. Voeg een LICENSE toe met de tekst van de EUPL-1.2' : `nog geen licentietekst. Voeg een LICENSE toe met de tekst van ${licentieCode}`}. Zet de map in een repository, vul publiccode.yml aan en meld de plugin aan via een issue op de marketplace.`,
      '',
    ].join('\n'),
  };
  if (metReferentie) {
    files[`${slug}/skills/${slug}/${BRONNEN_PAD}`] = `# Bronnen en afspraken\n\n${bronnen}\n`;
  }
  if (licentie) files[`${slug}/LICENSE`] = `${licentie}\n`;
  return files;
}
