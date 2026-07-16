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
    // De zeven vragen van de persona-bouwer; `why` is de toelichting onder het veld
    // en stuurt de AI-invulhulp aan. Gelijk aan migratie 0028_persona_questions.sql.
    follow_up_questions: [
      {
        id: 'rol',
        label: 'Welke functie of rol vervult deze persoon precies?',
        placeholder: 'Bijv. wetgevingsjurist bij een departement',
        why: 'Dit is de kapstok. Hoe specifieker, hoe minder de AI terugvalt op een generiek gemiddelde. "Wetgevingsjurist bij een departement" activeert echte denkkaders, "jurist" niet.',
      },
      {
        id: 'ervaring',
        label: 'Hoeveel ervaring en welke expertise heeft deze persoon?',
        placeholder: 'Bijv. 15 jaar ervaring, senior, specialist uitvoerbaarheid',
        why: 'Ervaring bepaalt de zekerheid waarmee de AI schrijft. Een senior nuanceert en kent uitzonderingen; een junior legt uit en volgt de regels.',
      },
      {
        id: 'belang',
        label: 'Welk belang bewaakt deze persoon?',
        placeholder: 'Bijv. bewaakt de uitvoerbaarheid en handhaafbaarheid',
        why: 'De belangrijkste vraag. Een rol zonder belang is een decorstuk. "Bewaakt de uitvoerbaarheid" geeft de tekst richting: de AI gaat afwegen in plaats van opsommen.',
      },
      {
        id: 'focus',
        label: 'Waar let deze persoon als eerste op?',
        placeholder: 'Bijv. eerst naar risico’s en juridische houdbaarheid',
        why: 'Dit stuurt de volgorde en de aandacht. Wie eerst naar risico’s kijkt schrijft een andere opbouw dan wie eerst naar kansen kijkt. Het maakt de persona operationeel.',
      },
      {
        id: 'niet',
        label: 'Wat doet of zegt deze persona juist níét?',
        placeholder: 'Bijv. geeft geen politiek oordeel, belooft geen termijnen',
        why: 'Negatieve afbakening is het scherpste stuurmiddel. "Geeft geen politiek oordeel", "gebruikt geen jargon". Zonder grens vult de AI de ruimte met eigen aannames.',
      },
      {
        id: 'communicatie',
        label: 'Hoe moet er gecommuniceerd worden?',
        placeholder: 'Bijv. zakelijk en bondig, korte zinnen, minimaal jargon',
        why: 'Toon, register, zinslengte, gebruik van vaktaal. Dit is het verschil tussen inhoudelijk kloppen en herkenbaar zijn.',
      },
      {
        id: 'blinde_vlek',
        label: 'Wat weet deze persoon niet, of waar twijfelt hij over?',
        placeholder: 'Bijv. minder thuis in de techniek; twijfelt over de planning',
        why: 'Dit voorkomt de alwetende AI-stem. Een persona met blinde vlekken is geloofwaardiger en benoemt onzekerheid in plaats van hem glad te strijken.',
      },
    ],
    template: `Je bent {{rol}}.

Ervaring en expertise: {{ervaring}}
Het belang dat je bewaakt: {{belang}}
Waar je als eerste op let: {{focus}}
Wat je juist niet doet: {{niet}}
Hoe je communiceert: {{communicatie}}
Wat je niet weet of waarover je twijfelt: {{blinde_vlek}}

Voer de onderstaande opdracht volledig vanuit dit perspectief uit. Houd de toon, de afwegingen en de grenzen van deze rol vast. Benoem onzekerheid waar die er is in plaats van hem glad te strijken.

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
    // Geen vaste vragen: deze techniek voert een interview en bepaalt zelf wat hij
    // vraagt. Zie migratie 0029_clear_self_directed_questions.sql.
    follow_up_questions: [],
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
    // Geen vaste vragen: de few-shot-bouwer doorloopt zijn eigen fasen.
    // Zie migratie 0029_clear_self_directed_questions.sql.
    follow_up_questions: [],
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
    // Geen vaste vragen: deze techniek voert een Socratisch interview en bepaalt
    // zelf wat hij vraagt. Zie migratie 0029_clear_self_directed_questions.sql.
    follow_up_questions: [],
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
  {
    id: 'tech-crispe',
    name: 'CRISPE',
    family: 'context',
    description:
      'Uitgebreid framework voor complexe opdrachten waarbij context, rol, instructies, stappen, randvoorwaarden en einddoel expliciet worden gemaakt.',
    strength:
      'Het doel van CRISPE is om AI gericht en gestructureerd te laten werken aan een complexe taak, met duidelijke kaders, processtappen en een concreet eindresultaat.',
    use_cases: [
      'Gebruik CRISPE wanneer een gebruiker een strategisch advies, analyse of uitgebreid plan wil laten maken.',
      'Gebruik CRISPE wanneer de uitkomst afhankelijk is van context, rol, beperkingen en een duidelijk einddoel.',
      'Gebruik CRISPE wanneer de AI niet alleen antwoord moet geven, maar ook volgens een bepaalde aanpak moet werken.',
      'Gebruik CRISPE wanneer de gebruiker controle wil over toon, proces, diepgang en outputvorm.',
    ],
    follow_up_questions: [
      { id: 'context', label: 'CONTEXT — achtergrond en situatie', placeholder: 'Beschrijf de situatie, achtergrond, doelgroep, organisatie of het probleem waar de prompt over gaat.' },
      { id: 'role', label: 'ROLE — rol of expertise', placeholder: 'Bijvoorbeeld: senior strateeg, beleidsadviseur, copywriter, coach, jurist of productmanager.' },
      { id: 'instructions', label: 'INSTRUCTIONS — concrete opdracht', placeholder: 'Beschrijf precies wat de AI moet doen.' },
      { id: 'steps', label: 'STEPS — gewenste werkwijze', placeholder: 'Beschrijf welke stappen de AI moet volgen, bijvoorbeeld analyseren, structureren, adviseren en samenvatten.' },
      { id: 'parameters', label: 'PARAMETERS — randvoorwaarden', placeholder: 'Bijvoorbeeld: AVG-proof, B1-taalniveau, maximaal 500 woorden, zakelijke toon, geen jargon.' },
      { id: 'end_goal', label: 'END GOAL — gewenste uitkomst', placeholder: 'Beschrijf wat het eindresultaat moet opleveren voor de gebruiker.' },
    ],
    template: `# CONTEXT:
{{context}}

# ROLE:
{{role}}

# INSTRUCTIONS:
{{instructions}}

# STEPS:
{{steps}}

# PARAMETERS:
{{parameters}}

# END GOAL:
{{end_goal}}

---

Geef, gegeven bovenstaande CRISPE-structuur, antwoord op:
{{PROMPT}}`,
  },
  {
    id: 'tech-raise',
    name: 'RAISE',
    family: 'context',
    description:
      'Taakgericht framework waarmee je snel aangeeft wie de AI moet zijn, welke actie nodig is, welke input gebruikt wordt, welke details belangrijk zijn en wat het gewenste resultaat is.',
    strength:
      'Het doel van RAISE is om praktische en uitvoerbare prompts te maken voor concrete taken waarbij snelheid, duidelijkheid en resultaatgerichtheid belangrijk zijn.',
    use_cases: [
      'Gebruik RAISE wanneer een gebruiker snel een duidelijke taak aan AI wil geven.',
      'Gebruik RAISE wanneer de opdracht praktisch, concreet en actiegericht is.',
      'Gebruik RAISE wanneer de gebruiker bestaande input wil laten verwerken tot een bruikbaar resultaat.',
      'Gebruik RAISE wanneer de AI output moet leveren zonder een te uitgebreid analyseproces.',
    ],
    follow_up_questions: [
      { id: 'role', label: 'ROLE — rol of perspectief', placeholder: 'Bijvoorbeeld: projectleider, tekstschrijver, onderzoeker, marketeer of trainer.' },
      { id: 'action', label: 'ACTION — gewenste actie', placeholder: 'Bijvoorbeeld: herschrijf, analyseer, vat samen, verbeter, vergelijk, maak of controleer.' },
      { id: 'input', label: 'INPUT — bronmateriaal of informatie', placeholder: 'Plak hier de tekst, data, notities, briefing of informatie die gebruikt moet worden.' },
      { id: 'specifics', label: 'SPECIFICS — specifieke eisen', placeholder: 'Bijvoorbeeld: doelgroep, toon, lengte, format, taalniveau, stijl of onderwerpen die wel/niet genoemd mogen worden.' },
      { id: 'end_goal', label: 'END GOAL — gewenst resultaat', placeholder: 'Beschrijf waarvoor de output gebruikt wordt en wat het moet opleveren.' },
    ],
    template: `# ROLE:
{{role}}

# ACTION:
{{action}}

# INPUT:
{{input}}

# SPECIFICS:
{{specifics}}

# END GOAL:
{{end_goal}}

---

Voer de taak uit op basis van bovenstaande RAISE-structuur:
{{PROMPT}}`,
  },
  {
    id: 'tech-co-star',
    name: 'CO-STAR',
    family: 'context',
    description:
      'Framework voor communicatie, marketing en contentcreatie waarbij context, doel, stijl, toon, doelgroep en gewenste respons expliciet worden gemaakt.',
    strength:
      'Het doel van CO-STAR is om AI communicatie te laten maken die inhoudelijk klopt, goed aansluit op de doelgroep en past bij de gewenste stijl en toon.',
    use_cases: [
      'Gebruik CO-STAR wanneer een gebruiker marketingtekst, websitecopy, e-mails of social posts wil laten maken.',
      'Gebruik CO-STAR wanneer doelgroep, toon en stijl belangrijk zijn voor de kwaliteit van de output.',
      'Gebruik CO-STAR wanneer communicatie moet overtuigen, informeren of activeren.',
      'Gebruik CO-STAR wanneer de gebruiker de vorm en het effect van de tekst duidelijk wil sturen.',
    ],
    follow_up_questions: [
      { id: 'context', label: 'CONTEXT — achtergrond en situatie', placeholder: 'Beschrijf waar de communicatie over gaat, wat de aanleiding is en in welke situatie de tekst gebruikt wordt.' },
      { id: 'objective', label: 'OBJECTIVE — communicatiedoel', placeholder: 'Bijvoorbeeld: informeren, overtuigen, activeren, uitnodigen, verkopen of vertrouwen opbouwen.' },
      { id: 'style', label: 'STYLE — schrijfstijl', placeholder: 'Bijvoorbeeld: professioneel, helder, compact, verhalend, activerend, zakelijk of toegankelijk.' },
      { id: 'tone', label: 'TONE — toon', placeholder: 'Bijvoorbeeld: warm, direct, rustig, deskundig, uitnodigend, nuchter of energiek.' },
      { id: 'audience', label: 'AUDIENCE — doelgroep', placeholder: 'Beschrijf voor wie de tekst bedoeld is, inclusief kennisniveau, behoefte, bezwaar of context.' },
      { id: 'response', label: 'RESPONSE — gewenste outputvorm', placeholder: 'Bijvoorbeeld: e-mail, landingspagina, advertentietekst, social post, tagline, nieuwsbrief of call-to-action.' },
    ],
    template: `# CONTEXT:
{{context}}

# OBJECTIVE:
{{objective}}

# STYLE:
{{style}}

# TONE:
{{tone}}

# AUDIENCE:
{{audience}}

# RESPONSE:
{{response}}

---

Maak de communicatie-uiting op basis van bovenstaande CO-STAR-structuur:
{{PROMPT}}`,
  },
  {
    id: 'tech-craft',
    name: 'CRAFT',
    family: 'context',
    description:
      'Zakelijk framework waarmee je heldere output kunt laten maken op basis van context, rol, actie, format en doelgroep.',
    strength:
      'Het doel van CRAFT is om AI zakelijke documenten, plannen, adviezen en berichten te laten maken die duidelijk gestructureerd zijn en aansluiten op de doelgroep.',
    use_cases: [
      'Gebruik CRAFT wanneer een gebruiker een zakelijke tekst, memo, voorstel, plan of advies wil laten maken.',
      'Gebruik CRAFT wanneer de output professioneel, bruikbaar en overzichtelijk moet zijn.',
      'Gebruik CRAFT wanneer het format en de doelgroep belangrijk zijn voor de structuur van het antwoord.',
      'Gebruik CRAFT wanneer een zakelijke opdracht snel moet worden vertaald naar concrete output.',
    ],
    follow_up_questions: [
      { id: 'context', label: 'CONTEXT — zakelijke achtergrond', placeholder: 'Beschrijf de zakelijke situatie, aanleiding, organisatie, vraag of uitdaging.' },
      { id: 'role', label: 'ROLE — professionele rol', placeholder: 'Bijvoorbeeld: projectmanager, beleidsadviseur, business consultant, HR-adviseur of teamleider.' },
      { id: 'action', label: 'ACTION — gewenste taak', placeholder: 'Bijvoorbeeld: schrijf, formuleer, analyseer, adviseer, structureer, verbeter of maak een voorstel.' },
      { id: 'format', label: 'FORMAT — gewenste vorm', placeholder: 'Bijvoorbeeld: memo, adviesnota, e-mail, managementsamenvatting, projectplan, tabel of bulletlijst.' },
      { id: 'target_audience', label: 'TARGET AUDIENCE — doelgroep', placeholder: 'Bijvoorbeeld: directie, managementteam, collega’s, opdrachtgever, klant, medewerkers of stakeholders.' },
    ],
    template: `# CONTEXT:
{{context}}

# ROLE:
{{role}}

# ACTION:
{{action}}

# FORMAT:
{{format}}

# TARGET AUDIENCE:
{{target_audience}}

---

Maak de zakelijke output op basis van bovenstaande CRAFT-structuur:
{{PROMPT}}`,
  },
  {
    id: 'tech-create',
    name: 'CREATE',
    family: 'context',
    description:
      'Framework voor creatieve en contentgerichte opdrachten waarbij context, rol, voorbeelden, actie, toon en eindresultaat samen richting geven aan de output.',
    strength:
      'Het doel van CREATE is om AI creatieve, originele en bruikbare content te laten maken die past bij de context, toon, voorbeelden en gewenste toepassing.',
    use_cases: [
      'Gebruik CREATE wanneer een gebruiker creatieve concepten, campagnes, scripts, posts of ideeën wil laten maken.',
      'Gebruik CREATE wanneer voorbeelden belangrijk zijn om stijl, niveau of richting te bepalen.',
      'Gebruik CREATE wanneer de output origineel moet zijn, maar wel binnen duidelijke kaders moet blijven.',
      'Gebruik CREATE wanneer de gebruiker meerdere creatieve varianten of invalshoeken wil verkennen.',
    ],
    follow_up_questions: [
      { id: 'context', label: 'CONTEXT — creatieve achtergrond', placeholder: 'Beschrijf het onderwerp, de aanleiding, het merk, de campagne of het creatieve probleem.' },
      { id: 'role', label: 'ROLE — creatieve rol', placeholder: 'Bijvoorbeeld: creatief strateeg, copywriter, scriptschrijver, conceptontwikkelaar of contentmarketeer.' },
      { id: 'examples', label: 'EXAMPLES — voorbeelden of inspiratie', placeholder: 'Voeg voorbeelden toe van stijl, toon, structuur, ideeën of content die als richting mogen dienen.' },
      { id: 'action', label: 'ACTION — creatieve opdracht', placeholder: 'Bijvoorbeeld: bedenk, schrijf, ontwikkel, herschrijf, maak varianten, verbeter of combineer ideeën.' },
      { id: 'tone', label: 'TONE — gewenste toon', placeholder: 'Bijvoorbeeld: speels, scherp, warm, professioneel, verrassend, activerend of toegankelijk.' },
      { id: 'end_result', label: 'END RESULT — gewenste creatieve output', placeholder: 'Bijvoorbeeld: 10 ideeën, 3 concepten, een script, een campagneboodschap, een social post of een headline-set.' },
    ],
    template: `# CONTEXT:
{{context}}

# ROLE:
{{role}}

# EXAMPLES:
{{examples}}

# ACTION:
{{action}}

# TONE:
{{tone}}

# END RESULT:
{{end_result}}

---

Maak de creatieve output op basis van bovenstaande CREATE-structuur:
{{PROMPT}}`,
  },
  {
    id: 'tech-react',
    name: 'REACT',
    family: 'context',
    description:
      'Framework voor agent-achtige workflows waarbij de AI redeneert, keuzes evalueert, acties uitvoert, resultaten controleert en helder terugkoppelt.',
    strength:
      'Het doel van REACT is om AI gestructureerd te laten werken aan taken die meerdere stappen, beslissingen, controles of tool-acties vereisen.',
    use_cases: [
      'Gebruik REACT wanneer een AI-agent een taak in meerdere stappen moet uitvoeren.',
      'Gebruik REACT wanneer de AI informatie moet analyseren, daarna actie moet ondernemen en vervolgens het resultaat moet controleren.',
      'Gebruik REACT wanneer betrouwbaarheid, terugkoppeling en controle belangrijk zijn.',
      'Gebruik REACT wanneer een workflow afhankelijk is van redeneren, uitvoeren, valideren en rapporteren.',
    ],
    follow_up_questions: [
      { id: 'reason', label: 'REASON — analyse en redenering', placeholder: 'Beschrijf wat de AI eerst moet begrijpen, analyseren of afwegen voordat er actie wordt ondernomen.' },
      { id: 'evaluate', label: 'EVALUATE — keuze en beoordeling', placeholder: 'Beschrijf welke opties, risico’s, beperkingen of criteria de AI moet beoordelen.' },
      { id: 'act', label: 'ACT — actie of uitvoering', placeholder: 'Beschrijf welke actie de AI moet uitvoeren, bijvoorbeeld zoeken, schrijven, aanpassen, controleren of structureren.' },
      { id: 'check', label: 'CHECK — controle en validatie', placeholder: 'Beschrijf hoe de AI moet controleren of de actie goed is uitgevoerd.' },
      { id: 'tell', label: 'TELL — terugkoppeling', placeholder: 'Beschrijf hoe de AI het resultaat moet rapporteren, inclusief bevindingen, gemaakte keuzes en eventuele vervolgstappen.' },
    ],
    template: `# REASON:
{{reason}}

# EVALUATE:
{{evaluate}}

# ACT:
{{act}}

# CHECK:
{{check}}

# TELL:
{{tell}}

---

Voer de agent-workflow uit op basis van bovenstaande REACT-structuur:
{{PROMPT}}`,
  },
];
