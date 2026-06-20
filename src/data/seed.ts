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
      'Laat de prompt schrijven vanuit het perspectief van een specifieke interne persona.',
    strength:
      'Sterk in het meenemen van een specifiek deskundig perspectief. Het model neemt de toon, kennis en afwegingen van die rol over, waardoor de output gerichter en geloofwaardiger wordt.',
    use_cases: [
      'Een nota of advies beoordelen vanuit een SG, manager of jurist',
      'Een tekst aanscherpen vanuit het oog van een ervaren beleidsmedewerker',
      'Een stuk laten toetsen op bestuurlijke of juridische houdbaarheid',
    ],
    follow_up_questions: [
      { id: 'gewenst_doel', label: 'Gewenst doel — wat wil je bereiken?', placeholder: 'Bijv. een onderbouwd advies dat mijn manager direct kan gebruiken' },
      { id: 'persona', label: 'Vanuit welke interne persona?', placeholder: 'Bijv. een ervaren beleidsmedewerker, een communicatieadviseur, een projectleider, een DT-lid of een manager' },
      { id: 'belangrijk', label: 'Wat is belangrijk voor deze persona?', placeholder: 'Bijv. juridische houdbaarheid en bestuurlijke afweging (jurist), of een heldere kernboodschap (communicatieadviseur)' },
      { id: 'weten', label: 'Waar let deze persona vooral op?', placeholder: 'Bijv. risico’s en draagvlak (manager), haalbaarheid en planning (projectleider), of de rode draad (DT-lid)' },
      { id: 'belangen', label: 'Wat zijn de belangen van deze persona?', placeholder: 'Bijv. een onderbouwd, uitvoerbaar advies (beleidsmedewerker) of een consistent verhaal naar buiten (communicatieadviseur)' },
    ],
    template: `Gewenst doel: {{gewenst_doel}}

Je bent {{persona}}.

Belangrijk voor jou: {{belangrijk}}
Je let vooral op: {{weten}}
Jouw belangen: {{belangen}}

Beantwoord, schrijf of voer de volgende opdracht uit volledig vanuit dit perspectief. Houd rekening met de toon, taal en behoeften die bij deze persona passen.

Oorspronkelijke opdracht:
{{PROMPT}}`,
  },
  {
    id: 'tech-chain-of-thought',
    name: 'Chain-of-Thought',
    description: 'Laat het model stap voor stap redeneren voor complexere taken.',
    strength:
      'Sterk bij complexe afwegingen en analyses. Doordat het model elke tussenstap expliciet maakt, worden conclusies beter onderbouwd en is de redenering controleerbaar.',
    use_cases: [
      'Een beleidskeuze of scenario afwegen met meerdere opties',
      'Een risico- of impactanalyse onderbouwen',
      'Een complex vraagstuk ontleden voordat je tot een advies komt',
    ],
    follow_up_questions: [
      { id: 'doel', label: 'Gewenst doel — wat wil je bereiken?', placeholder: 'Bijv. een onderbouwd advies waarin de afweging navolgbaar is' },
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
    strength:
      'Sterk in het reproduceren van een vaste stijl, toon of format. Met een paar goede voorbeelden levert het model consistent werk dat aansluit op je huisstijl of sjabloon.',
    use_cases: [
      'Teksten in een vaste huisstijl of toon laten schrijven',
      'Een bestaand sjabloon (memo, nota, samenvatting) consequent laten volgen',
      'Output uniform maken over meerdere stukken heen',
    ],
    follow_up_questions: [
      { id: 'gewenst_doel', label: 'Gewenst doel — wat wil je bereiken?', placeholder: 'Bijv. notities consistent in onze huisstijl laten herschrijven' },
      { id: 'voorbeeld1', label: 'Voorbeeld 1 (gewenste output)', placeholder: 'Plak een goed voorbeeld' },
      { id: 'voorbeeld2', label: 'Voorbeeld 2 (optioneel)', placeholder: 'Nog een voorbeeld' },
      { id: 'stijl', label: 'Wat kenmerkt de gewenste stijl?', placeholder: 'Bijv. formeel, beknopt, B1-taalniveau' },
    ],
    template: `Gewenst doel: {{gewenst_doel}}

Gebruik onderstaande voorbeelden als referentie voor toon, stijl en structuur.

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
    strength:
      'Sterk wanneer de vorm vastligt. Het model levert direct bruikbare output in exact het gevraagde formaat, zonder overbodige inleiding of afsluiting.',
    use_cases: [
      'Een overzicht of vergelijking in een tabel laten zetten',
      'Een samenvatting in vaste secties of bullets opleveren',
      'Data of bevindingen in een herbruikbaar format gieten',
    ],
    follow_up_questions: [
      { id: 'gewenst_doel', label: 'Gewenst doel — wat wil je bereiken?', placeholder: 'Bijv. een overzicht dat ik direct in een nota kan plakken' },
      { id: 'formaat', label: 'Welk outputformaat wil je?', placeholder: 'Bijv. tabel met kolommen: onderwerp, advies, risico' },
      { id: 'taalniveau', label: 'Welk taalniveau?', placeholder: 'Bijv. B1 (begrijpelijke taal)' },
      { id: 'lengte', label: 'Gewenste lengte?', placeholder: 'Bijv. maximaal 1 A4' },
    ],
    template: `Gewenst doel: {{gewenst_doel}}

Lever het resultaat aan in het volgende formaat: {{formaat}}.

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
    description: 'Stem de prompt af op meerdere interne belanghebbenden tegelijk.',
    strength:
      'Sterk wanneer meerdere interne belangen samenkomen. Het model weegt de perspectieven van verschillende rollen tegen elkaar af en adresseert ieders belang expliciet.',
    use_cases: [
      'Een stuk dat zowel projectleider, jurist als communicatie moet aanspreken',
      'Een afweging waarbij meerdere afdelingen een belang hebben',
      'Een voorstel toetsen op draagvlak bij verschillende stakeholders',
    ],
    follow_up_questions: [
      { id: 'gewenst_doel', label: 'Gewenst doel — wat wil je bereiken?', placeholder: 'Bijv. een voorstel dat bij projectleider, jurist én communicatie draagvlak heeft' },
      { id: 'persona1', label: 'Persona 1 — naam/rol', placeholder: 'Bijv. Projectleider' },
      { id: 'belang1', label: 'Persona 1 — belang & prioriteit', placeholder: 'Bijv. tijdige oplevering' },
      { id: 'persona2', label: 'Persona 2 — naam/rol', placeholder: 'Bijv. Jurist' },
      { id: 'belang2', label: 'Persona 2 — belang & prioriteit', placeholder: 'Bijv. juridische houdbaarheid' },
      { id: 'persona3', label: 'Persona 3 — naam/rol (optioneel)', placeholder: 'Bijv. Communicatieadviseur' },
      { id: 'belang3', label: 'Persona 3 — belang & prioriteit (optioneel)', placeholder: 'Bijv. een heldere kernboodschap' },
    ],
    template: `Gewenst doel: {{gewenst_doel}}

Je gaat deze tekst schrijven voor meerdere interne belanghebbenden tegelijk.

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
    strength:
      'Sterk in het blootleggen van aannames en blinde vlekken. In plaats van een kant-en-klaar antwoord stelt het model kritische vragen die je denken scherper maken.',
    use_cases: [
      'Een aanpak of voorstel kritisch tegen het licht houden',
      'Verborgen aannames in een beleidsstuk opsporen',
      'Een vraagstuk verkennen voordat je een richting kiest',
    ],
    follow_up_questions: [
      { id: 'gewenst_doel', label: 'Gewenst doel — wat wil je bereiken?', placeholder: 'Bijv. blinde vlekken in mijn aanpak blootleggen voordat ik verderga' },
      { id: 'aannames', label: 'Wat zijn de kern-aannames in de input?', placeholder: 'Bijv. dat de aanpak uitvoerbaar is binnen de huidige capaciteit van het team' },
      { id: 'ontdekken', label: 'Wat wil je eigenlijk ontdekken?', placeholder: 'Bijv. of de aanpak wel klopt' },
    ],
    template: `Gewenst doel: {{gewenst_doel}}

Analyseer de aannames in onderstaande tekst en pas de Socratische methode toe.

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
    strength:
      'Sterk wanneer je niet zeker weet hoe je de opdracht het best formuleert. Het model reflecteert op de aanpak zelf en stelt een verbeterde formulering voor.',
    use_cases: [
      'Een vage of brede opdracht scherper laten formuleren',
      'Leren hoe je een terugkerende taak beter kunt prompten',
      'Een bestaande prompt laten verbeteren',
    ],
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
    family: 'context',
    description: 'Gestructureerd prompten met Context, Rules, Instructions, Specifics en Pattern.',
    strength:
      'Sterk bij complexe opdrachten met veel randvoorwaarden. Door context, regels, instructies, details en patroon te scheiden, krijgt het model maximale sturing.',
    use_cases: [
      'Een omvangrijke of gevoelige opdracht met strikte eisen',
      'Werk waarbij randvoorwaarden (bijv. AVG, kaders) cruciaal zijn',
      'Een herbruikbare, goed gestructureerde standaardprompt opzetten',
    ],
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
    family: 'context',
    description: 'Uitgebreid prompten met Context, Ask, Rules en Examples.',
    strength:
      'Sterk als je een duidelijke vraag wilt combineren met context, regels én voorbeelden. Een toegankelijke structuur die snel tot bruikbaar resultaat leidt.',
    use_cases: [
      'Een concrete schrijf- of analyseopdracht met een voorbeeld erbij',
      'Werk waarbij je de gewenste uitkomst kunt illustreren',
      'Een gestructureerde maar lichte aanpak zonder veel overhead',
    ],
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
