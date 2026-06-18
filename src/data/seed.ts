import type { Category, Role, Technique } from '@/types';

// --- Rollen (hardcoded voor Phase 1) ---
export const SEED_ROLES: Role[] = [
  { id: 'role-beleidsmedewerker', name: 'Beleidsmedewerker', description: 'Ontwikkelt en evalueert beleid.' },
  { id: 'role-communicatie', name: 'Communicatieadviseur', description: 'Externe en interne communicatie.' },
  { id: 'role-jurist', name: 'Jurist', description: 'Juridische advisering en toetsing.' },
  { id: 'role-data-analist', name: 'Data-analist', description: 'Analyse van data en rapportages.' },
  { id: 'role-projectleider', name: 'Projectleider', description: 'Aansturing van projecten en programma’s.' },
  { id: 'role-bestuursadviseur', name: 'Bestuursadviseur', description: 'Advisering aan bestuur en management.' },
  { id: 'role-klantcontact', name: 'Klantcontactmedewerker', description: 'Contact met burgers en bedrijven.' },
];

// --- Categorieën (hardcoded voor Phase 1) ---
export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-beleid', name: 'Beleid & Advies', description: 'Beleidsnota’s, adviezen en memo’s.', icon: 'FileText' },
  { id: 'cat-communicatie', name: 'Communicatie', description: 'Persberichten, nieuwsbrieven en woordvoering.', icon: 'Megaphone' },
  { id: 'cat-juridisch', name: 'Juridisch', description: 'Juridische teksten en toetsing.', icon: 'Scale' },
  { id: 'cat-data', name: 'Data & Analyse', description: 'Data-analyse, rapportages en dashboards.', icon: 'BarChart3' },
  { id: 'cat-burgerbrieven', name: 'Burgerbrieven', description: 'Correspondentie met burgers en bedrijven.', icon: 'Mail' },
  { id: 'cat-vergaderingen', name: 'Vergaderingen', description: 'Agenda’s, notulen en samenvattingen.', icon: 'Users' },
  { id: 'cat-onderzoek', name: 'Onderzoek', description: 'Literatuuronderzoek en samenvattingen.', icon: 'Search' },
];

// --- Prompttechnieken (beheerd door admin) ---
export const SEED_TECHNIQUES: Technique[] = [
  {
    id: 'tech-persona',
    name: 'Persona Prompting',
    description:
      'Laat de prompt schrijven vanuit het perspectief van een specifieke persoon of doelgroep.',
    follow_up_questions: [
      { id: 'persona', label: 'Wie is de persoon?', placeholder: 'Bijv. een 70-jarige burger zonder digitale ervaring' },
      { id: 'belangrijk', label: 'Wat is belangrijk voor hen?', placeholder: 'Bijv. duidelijkheid en geruststelling' },
      { id: 'weten', label: 'Wat willen ze graag weten?', placeholder: 'Bijv. welke stappen ze moeten zetten' },
      { id: 'belangen', label: 'Wat zijn hun belangen?', placeholder: 'Bijv. tijdig de juiste toeslag ontvangen' },
    ],
    template: `Je bent {{persona}}.

Belangrijk voor jou: {{belangrijk}}
Je wilt graag weten: {{weten}}
Jouw belangen: {{belangen}}

Beantwoord, schrijf of voer de volgende opdracht uit volledig vanuit dit perspectief. Houd rekening met de toon, taal en behoeften die bij deze persoon passen.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-chain-of-thought',
    name: 'Chain-of-Thought',
    description: 'Laat het model stap voor stap redeneren voor complexere taken.',
    follow_up_questions: [
      { id: 'doel', label: 'Wat is het einddoel?', placeholder: 'Bijv. een onderbouwd advies' },
      { id: 'stappen', label: 'Welke tussenstappen zijn belangrijk?', placeholder: 'Bijv. eerst de feiten, dan de afweging' },
    ],
    template: `Voer de volgende opdracht stap voor stap uit. Redeneer hardop en maak elke tussenstap expliciet voordat je tot een conclusie komt.

Einddoel: {{doel}}
Belangrijke tussenstappen: {{stappen}}

Werkwijze:
1. Verzamel en benoem de relevante feiten.
2. Weeg de opties expliciet tegen elkaar af.
3. Trek een onderbouwde conclusie.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-few-shot',
    name: 'Few-Shot Voorbeelden',
    description: 'Geef het model enkele voorbeelden zodat het de gewenste stijl en structuur overneemt.',
    follow_up_questions: [
      { id: 'voorbeeld1', label: 'Voorbeeld 1 (gewenste output)', placeholder: 'Plak een goed voorbeeld' },
      { id: 'voorbeeld2', label: 'Voorbeeld 2 (optioneel)', placeholder: 'Nog een voorbeeld' },
      { id: 'stijl', label: 'Wat kenmerkt de gewenste stijl?', placeholder: 'Bijv. formeel, beknopt, B1-taalniveau' },
    ],
    template: `Gebruik onderstaande voorbeelden als referentie voor toon, stijl en structuur.

Voorbeeld 1:
{{voorbeeld1}}

Voorbeeld 2:
{{voorbeeld2}}

Gewenste stijl: {{stijl}}

Voer nu de opdracht uit en volg dezelfde stijl en structuur als de voorbeelden.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-structured-output',
    name: 'Gestructureerde Output',
    description: 'Dwing een vast outputformaat af, zoals een tabel, lijst of vaste secties.',
    follow_up_questions: [
      { id: 'formaat', label: 'Welk outputformaat wil je?', placeholder: 'Bijv. tabel met kolommen: onderwerp, advies, risico' },
      { id: 'taalniveau', label: 'Welk taalniveau?', placeholder: 'Bijv. B1 (begrijpelijke taal)' },
      { id: 'lengte', label: 'Gewenste lengte?', placeholder: 'Bijv. maximaal 1 A4' },
    ],
    template: `Lever het resultaat aan in het volgende formaat: {{formaat}}.

Eisen aan de output:
- Taalniveau: {{taalniveau}}
- Lengte: {{lengte}}
- Houd je strikt aan het gevraagde formaat en voeg geen extra inleiding of afsluiting toe.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },

  // --- Phase 2: 5 extra technieken ---
  {
    id: 'tech-multi-persona',
    name: 'Multi-Persona Prompting',
    description: 'Stem de prompt af op meerdere belanghebbenden tegelijk.',
    follow_up_questions: [
      { id: 'persona1', label: 'Persona 1 — naam/rol', placeholder: 'Bijv. Projectleider' },
      { id: 'belang1', label: 'Persona 1 — belang & prioriteit', placeholder: 'Bijv. tijdige oplevering' },
      { id: 'persona2', label: 'Persona 2 — naam/rol', placeholder: 'Bijv. Jurist' },
      { id: 'belang2', label: 'Persona 2 — belang & prioriteit', placeholder: 'Bijv. juridische houdbaarheid' },
      { id: 'persona3', label: 'Persona 3 — naam/rol (optioneel)', placeholder: 'Bijv. Communicatieadviseur' },
      { id: 'belang3', label: 'Persona 3 — belang & prioriteit (optioneel)', placeholder: 'Bijv. begrijpelijke boodschap' },
    ],
    template: `Je gaat deze tekst schrijven voor meerdere doelgroepen tegelijk.

PERSONA 1 — {{persona1}}:
- Belang en prioriteit: {{belang1}}

PERSONA 2 — {{persona2}}:
- Belang en prioriteit: {{belang2}}

PERSONA 3 — {{persona3}}:
- Belang en prioriteit: {{belang3}}

Zorg dat elke persona waarde uit het resultaat haalt: adresseer hun belangen expliciet en houd rekening met hun perspectief.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-socratic',
    name: 'Socratic Prompting',
    description: 'Laat de AI vragen stellen in plaats van direct antwoorden geven (Socratische methode).',
    follow_up_questions: [
      { id: 'aannames', label: 'Wat zijn de kern-aannames in de input?', placeholder: 'Bijv. dat de doelgroep digivaardig is' },
      { id: 'ontdekken', label: 'Wat wil je eigenlijk ontdekken?', placeholder: 'Bijv. of de aanpak wel klopt' },
    ],
    template: `Analyseer de aannames in onderstaande tekst en pas de Socratische methode toe.

Bekende aannames: {{aannames}}
Wat we willen ontdekken: {{ontdekken}}

Ga als volgt te werk:
1. Identificeer alle impliciete en expliciete aannames.
2. Stel vragen die deze aannames in twijfel trekken.
3. Onderzoek alternatieve perspectieven.
4. Leid de gebruiker via vragen naar nieuwe inzichten.

Stijl: interview-achtig en Socratisch; zet stellingen ter discussie in plaats van conclusies te poneren.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-meta',
    name: 'Meta Prompting',
    description: 'De AI analyseert en verbetert haar eigen prompting-aanpak.',
    follow_up_questions: [],
    template: `Analyseer en verbeter je eigen prompting-benadering voor de onderstaande opdracht.

Doe het volgende:
1. Analyseer: wat werkt goed aan deze opdracht/prompt, en wat niet?
2. Identificeer: welke aannames maak je impliciet?
3. Optimaliseer: hoe zou je dit anders formuleren voor een beter resultaat?
4. Reflecteer: wat leer je hieruit over effectief prompten?

Geef een meta-analyse van je aanpak, gevolgd door een verbeterde versie van de opdracht.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-crisp',
    name: 'CRISP',
    description: 'Gestructureerd prompten met Context, Rules, Instructions, Specifics en Pattern.',
    follow_up_questions: [
      { id: 'context', label: 'CONTEXT — achtergrond & situatie', placeholder: 'Waar gaat het over?' },
      { id: 'rules', label: 'RULES — regels & randvoorwaarden', placeholder: 'Bijv. AVG-proof, B1-taalniveau' },
      { id: 'instructions', label: 'INSTRUCTIONS — concrete instructies', placeholder: 'Wat moet er gebeuren?' },
      { id: 'specifics', label: 'SPECIFICS — specifieke details', placeholder: 'Bijv. exacte cijfers, namen, datums' },
      { id: 'pattern', label: 'PATTERN — gewenst patroon/structuur', placeholder: 'Bijv. inleiding, kern, conclusie' },
    ],
    template: `# CONTEXT:
{{context}}

# RULES:
{{rules}}

# INSTRUCTIONS:
{{instructions}}

# SPECIFICS:
{{specifics}}

# PATTERN:
{{pattern}}

---

Geef, gegeven bovenstaande CRISP-structuur, antwoord op:
{{PROMPT}}`,
  },
  {
    id: 'tech-care',
    name: 'CARE',
    description: 'Uitgebreid prompten met Context, Ask, Rules en Examples.',
    follow_up_questions: [
      { id: 'context', label: 'CONTEXT — achtergrond', placeholder: 'Waar gaat het over?' },
      { id: 'ask', label: 'ASK — de concrete vraag', placeholder: 'Wat vraag je precies?' },
      { id: 'rules', label: 'RULES — regels & randvoorwaarden', placeholder: 'Bijv. formeel, max. 1 A4' },
      { id: 'examples', label: 'EXAMPLES — voorbeelden', placeholder: 'Plak een of meer voorbeelden' },
    ],
    template: `# CONTEXT:
{{context}}

# ASK:
{{ask}}

# RULES:
{{rules}}

# EXAMPLES:
{{examples}}

---

Genereer, gegeven bovenstaande CARE-structuur, het volgende:
{{PROMPT}}`,
  },
];
