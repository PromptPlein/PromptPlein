import type { PromptCategoryId } from './promptCategories';

/**
 * Eén voorbeeldprompt: waar hij over gaat (categorie), hoe hij heet en de
 * prompt zelf.
 */
export interface PromptExample {
  category: PromptCategoryId;
  title: string;
  subtitle: string;
  prompt: string;
}

/**
 * Voorbeeldprompts als hulp, inspiratie en om mee te testen. Gedeeld door
 * /genereren (waar ze het invoerveld vullen) en /technieken (waar ze de context
 * van een framework vullen), zodat er één lijst is om te onderhouden.
 *
 * Bewust géén raamwerknaam op het kaartje: de gebruiker herkent zijn werk aan
 * het soort taak, niet aan CRISPE of CO-STAR. Op /genereren zoekt de AI het
 * passende raamwerk er zelf bij, op /technieken heeft de gebruiker er al een
 * gekozen. Vandaar een titel, een subtitel en een categorie uit dezelfde lijst
 * als de startsjablonen in de chat.
 *
 * De voorbeelden gaan over rijkswerk en noemen de producten waar dat werk uit
 * bestaat: Kamerbrieven en beslisnota's, de stappen van het Beleidskompas,
 * BNC-fiches bij Commissievoorstellen, Woo-besluiten met uitzonderingsgronden,
 * inspectierapporten, publieksteksten. Elk voorbeeld is een prompt die iemand
 * echt zo zou kunnen indienen: concreet genoeg om te optimaliseren, algemeen
 * genoeg om je eigen dossier ervoor in de plaats te zetten.
 */
export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    category: 'begrijpelijk',
    title: 'Brief beoordelen op B1 en toon',
    subtitle: 'Eerst een oordeel, daarna een suggestie op taalniveau B1',
    prompt:
      'Maak een prompt die een brief beoordeelt op B1-taalniveau en toon. Laat daarna een suggestie schrijven voor hoe het wel op B1-taalniveau is.',
  },
  {
    category: 'beleid',
    title: 'Beleidsvoorstel onderbouwen',
    subtitle: 'Probleem, doel, opties en gevolgen langs het Beleidskompas',
    prompt:
      'Help me een beleidsvoorstel onderbouwen langs de stappen van het Beleidskompas: wat is het probleem en waaruit blijkt dat, wat is het beoogde doel, welke beleidsopties zijn er (inclusief niets doen), wat zijn de gevolgen van elke optie en welke optie heeft de voorkeur. Benoem per stap welke belanghebbenden ik moet betrekken en welke onderbouwing ik nog mis.',
  },
  {
    category: 'bestuurlijk',
    title: 'Beslisnota bij een Kamerbrief',
    subtitle: 'Kernboodschap, opties en risico’s voor de bewindspersoon',
    prompt:
      'Schrijf een beslisnota bij een Kamerbrief voor de bewindspersoon. Geef de kernboodschap in drie zinnen, het gevraagde besluit, de belangrijkste overwegingen, de politieke gevoeligheden, de uitvoerbaarheid volgens de uitvoeringsorganisatie en de risico’s als we niets doen. Sluit af met een helder dictum. Maximaal twee pagina’s, zakelijk en zonder bijvoeglijke naamwoorden die niets toevoegen.',
  },
  {
    category: 'bestuurlijk',
    title: 'Schriftelijke Kamervragen beantwoorden',
    subtitle: 'Feitelijk per vraag, consistent met eerdere standpunten',
    prompt:
      'Maak een concept-antwoord op een set schriftelijke Kamervragen over de uitvoering van een regeling. Beantwoord elke vraag apart en feitelijk, blijf consistent met eerdere kabinetsstandpunten, geef geen informatie prijs die nog niet openbaar is, en markeer duidelijk welke cijfers ik bij de uitvoeringsorganisatie moet ophalen. Verzin geen cijfers of bronnen.',
  },
  {
    category: 'europa',
    title: 'BNC-fiche bij een Commissievoorstel',
    subtitle: 'Nederlandse beoordeling van een nieuw EU-voorstel',
    prompt:
      'Help me een BNC-fiche opstellen over een nieuw voorstel van de Europese Commissie. Vat eerst inhoud en doel van het voorstel samen. Werk daarna de Nederlandse beoordeling uit: bevoegdheid, subsidiariteit en proportionaliteit met motivering, financiële gevolgen voor rijksbegroting en EU-begroting, gevolgen voor regeldruk, uitvoering en handhaving, en een inschatting van het krachtenveld in de Raad en het Europees Parlement.',
  },
  {
    category: 'openbaarheid',
    title: 'Woo-verzoek behandelen',
    subtitle: 'Inventarisatie, uitzonderingsgronden en besluitbrief',
    prompt:
      'Help me een Woo-verzoek behandelen. Stel eerst voor hoe ik het verzoek afbaken en met de verzoeker preciseer. Geef daarna een werkwijze om de documenten te inventariseren, per document te wegen welke uitzonderingsgronden uit de Woo kunnen spelen en hoe ik het algemeen belang van openbaarheid tegen die belangen afweeg. Sluit af met een opzet voor de besluitbrief met een motivering die een burger kan volgen. Ik laat het eindresultaat door een jurist toetsen.',
  },
  {
    category: 'begrijpelijk',
    title: 'Standaardbrief naar begrijpelijke taal',
    subtitle: 'Formele beschikking omzetten naar taalniveau B1',
    prompt:
      'Herschrijf een standaardbrief van onze uitvoeringsorganisatie naar begrijpelijk Nederlands op taalniveau B1. Houd de juridische strekking, de wettelijke grondslag en de rechtsmiddelenverwijzing volledig intact. Gebruik korte zinnen, actieve taal en aanspreekvorm "u", zet vooraan wat de ontvanger moet doen, en leg vaktermen uit in gewone woorden. Geef er een lijstje bij van de vaktermen die je hebt vervangen.',
  },
  {
    category: 'burgercontact',
    title: 'Reactie op een klacht van een burger',
    subtitle: 'Erkennen wat misging zonder toezeggingen te doen',
    prompt:
      'Schrijf een reactie op een boze brief van iemand over de afhandeling van zijn aanvraag. Erken wat er is misgegaan, leg feitelijk uit welke stappen zijn gezet en wat er nu gebeurt, en noem alleen termijnen die vaststaan. Wijs op de mogelijkheid om een klacht in te dienen of naar de Nationale ombudsman te gaan. Rustig en respectvol van toon, geen jargon, maximaal 300 woorden.',
  },
  {
    category: 'samenvatten',
    title: 'Rapport samenvatten voor de leiding',
    subtitle: 'Bevindingen, aannames en wat het voor ons betekent',
    prompt:
      'Vat een lang onderzoeksrapport samen voor de directie. Geef de belangrijkste bevindingen, de aanbevelingen die ons departement raken, de aannames waarop de conclusies rusten en de beperkingen van het onderzoek. Zet er een korte passage onder over wat dit betekent voor ons lopende beleid. Houd strikt gescheiden wat in het rapport staat en wat een eigen conclusie zou zijn.',
  },
  {
    category: 'onderzoek',
    title: 'Uitvraag voor een extern onderzoek',
    subtitle: 'Onderzoeksvragen, afbakening en beoordelingscriteria',
    prompt:
      'Help me een uitvraag opstellen voor een extern evaluatieonderzoek naar een subsidieregeling. Formuleer een scherpe hoofdvraag en deelvragen die te beantwoorden zijn, de afbakening in tijd en doelgroep, de gewenste methode, de op te leveren producten en de criteria waarop ik de offertes ga beoordelen. Benoem ook welke gegevens wij zelf moeten aanleveren.',
  },
  {
    category: 'toezicht',
    title: 'Inspectiebevindingen opschrijven',
    subtitle: 'Waarneming, norm en oordeel navolgbaar scheiden',
    prompt:
      'Help me de bevindingen van een inspectiebezoek opschrijven in een rapportbrief aan de onder toezicht staande organisatie. Scheid per bevinding de waarneming, de norm met wetsartikel, het oordeel en de gevraagde maatregel met termijn. Schrijf zo dat het oordeel navolgbaar blijft in een eventuele bezwaarprocedure, en vermijd woorden die een oordeel suggereren zonder onderbouwing.',
  },
  {
    category: 'communicatie',
    title: 'Publieksuitleg bij nieuw beleid',
    subtitle: 'Webtekst met Q&A over wat er verandert',
    prompt:
      'Schrijf een publiekstekst over een maatregel die binnenkort ingaat, met daaronder een Q&A van vijf vragen die mensen echt gaan stellen. Maak duidelijk wat er verandert, vanaf wanneer, voor wie het geldt, wat iemand zelf moet doen en waar hij terechtkan met vragen. Informerend en neutraal van toon, niet wervend, en zonder beleidstaal.',
  },
  {
    category: 'overleg',
    title: 'Besluitenlijst van een interdepartementaal overleg',
    subtitle: 'Besluiten, acties met eigenaar en de openstaande punten',
    prompt:
      'Maak van mijn aantekeningen van een interdepartementaal overleg een besluitenlijst. Geef de genomen besluiten, de actiepunten met eigenaar en termijn, de standpunten waarop departementen van elkaar verschillen en de punten die doorschuiven naar het volgende overleg. Houd het feitelijk en zet onduidelijke punten apart onder "na te vragen".',
  },
  {
    category: 'privacy',
    title: 'DPIA voorbereiden bij gegevensuitwisseling',
    subtitle: 'Gegevensstromen, grondslag, risico’s en maatregelen',
    prompt:
      'Help me een DPIA voorbereiden voor een nieuwe gegevensuitwisseling met een uitvoeringsorganisatie. Breng de gegevensstromen, de doelen, de betrokkenen en de grondslagen in kaart, toets aan doelbinding en dataminimalisatie, benoem de risico’s voor betrokkenen met mogelijke maatregelen, en geef de vragen die ik aan de functionaris gegevensbescherming moet voorleggen. Dit vervangt geen juridisch advies.',
  },
  {
    category: 'inkoop',
    title: 'Programma van eisen voor een aanbesteding',
    subtitle: 'Functionele eisen, wensen en gunningscriteria',
    prompt:
      'Help me een programma van eisen opstellen voor de aanbesteding van een dienst. Splits harde eisen en wensen, formuleer ze functioneel en meetbaar in plaats van productgericht, en stel gunningscriteria voor met een weging en de manier waarop ik ze beoordeel. Neem eisen op voor digitale toegankelijkheid, informatiebeveiliging, gegevensbescherming en het voorkomen van leveranciersafhankelijkheid.',
  },
  {
    category: 'data',
    title: 'Demo-dashboard bouwen',
    subtitle: 'Vaste basis voor een datagericht dashboard, met invulregels voor je eigen wensen',
    // Bewust in twee delen: eerst de basis die voor elk demo-dashboard geldt,
    // daaronder invulregels tussen rechte haken. De gebruiker vervangt alleen
    // die haken; de basis blijft staan en geeft de voor-invulling houvast.
    prompt:
      'Bouw een demo-dashboard als werkende React-webapplicatie op localhost, met dummy data in het geheugen en zonder backend, database of login. Het scherm is datagericht: cijfers en visualisaties dragen de boodschap, tekst niet. Rijkshuisstijl, rustig en neutraal; rood en groen alleen voor status of afwijking van een norm. Elke weergave heeft drie niveaus: bovenaan de belangrijkste cijfers groot, elk met een vergelijking of doelwaarde; daaronder de hoofdvisualisatie; onderaan een detailtabel met filters. Alles staat altijd zichtbaar in een vast raster dat op mobiel in dezelfde volgorde stackt.\n\n' +
      'Wat er in dit dashboard moet:\n' +
      '- Onderwerp en voor wie: [bijvoorbeeld de werkvoorraad van team Vergunningen, voor het MT]\n' +
      '- Weergaven (tabs): [bijvoorbeeld Overzicht, Behandelaars en Trends; welke is de ster van de show]\n' +
      '- Cijfers bovenaan per weergave: [bijvoorbeeld openstaande aanvragen, gemiddelde doorlooptijd, percentage binnen de termijn]\n' +
      '- Hoofdvisualisatie: [bijvoorbeeld een heatmap, een lijngrafiek over 26 weken of een staafdiagram per team]\n' +
      '- Filters en interacties: [bijvoorbeeld filter op type en team, klik op een kolomkop om te sorteren]\n' +
      '- Dummy data: [bijvoorbeeld 400 aanvragen over 26 weken, 12 behandelaars in 3 teams, realistische Nederlandse namen]\n' +
      '- Wanneer is de demo geslaagd: [bijvoorbeeld toonbaar aan het MT als voorbeeld van wat we in een halve dag met AI bouwen]',
  },
  {
    category: 'data',
    title: 'De AI-kansenmeter',
    subtitle: 'Interactief dashboard dat per taak de tijdwinst met AI schat',
    prompt:
      'Bouw een interactief dashboard ‘De AI-kansenmeter’. Laat gebruikers taken toevoegen met frequentie per week, tijdsduur en verwachte AI-besparing via een schuifregelaar. Toon direct de geschatte tijdwinst per week en per jaar, een vergelijkende grafiek en de taak met de grootste besparing. Start met drie fictieve voorbeelden: notulen, teksten schrijven en documenten samenvatten. Gebruik donkerblauw, zachte pastelkleuren en duidelijke knoppen. Vermeld dat de uitkomsten schattingen zijn en controle nodig blijft.',
  },
  // Digitaal & ICT: voor informatieadviseurs en ontwikkelaars. Deze voorbeelden
  // noemen bewust de standaard waar het om gaat (API Design Rules, publiccode.yml,
  // WCAG, NeRDS): daaraan herkent de bouwer een digitale opdracht en haalt hij
  // de passende pagina's uit de kennisbank van developer.overheid.nl erbij.
  {
    category: 'digitaal',
    title: 'API ontwerpen volgens de API Design Rules',
    subtitle: 'Resources, versienummering, foutmeldingen en de OpenAPI-specificatie',
    prompt:
      'Help me een REST API te ontwerpen die voldoet aan de API Design Rules van de overheid. Geef de resources en endpoints, de versienummering in de URI en in de API-Version-header, hoe foutmeldingen eruitzien, en een opzet van de OpenAPI-specificatie. Zet erbij hoe ik de specificatie controleer met de ADR-checker voordat ik code laat genereren.',
  },
  {
    category: 'digitaal',
    title: 'Repository klaarmaken voor open source',
    subtitle: 'README, licentie, publiccode.yml en een controle vooraf',
    prompt:
      'Help me de repository van ons project klaar te maken om als open source software te publiceren, zoals de overheid dat met open tenzij vraagt. Geef de bestanden die erin horen (README, LICENSE, CONTRIBUTING, SECURITY en publiccode.yml) met wat er in elk bestand moet staan, leg uit waarom de EUPL-licentie voor de hand ligt, en geef een checklist van wat ik vooraf controleer, zoals wachtwoorden, sleutels of persoonsgegevens in de geschiedenis van de code.',
  },
  {
    category: 'digitaal',
    title: 'Webpagina toetsen op digitale toegankelijkheid',
    subtitle: 'Bevindingen per WCAG-criterium, met de oplossing in de code',
    prompt:
      'Toets de HTML van een webpagina van onze organisatie op digitale toegankelijkheid volgens WCAG 2.1 niveau AA, zoals DigiToegankelijk dat voor overheidswebsites vraagt. Geef per bevinding het succescriterium, waar het in de code zit, wat iemand met een schermlezer of alleen een toetsenbord ervan merkt, en de oplossing. Sluit af met wat een automatische check zoals axe niet vindt en wat ik dus met de hand moet nalopen.',
  },
  {
    category: 'digitaal',
    title: 'Projectplan toetsen aan NeRDS',
    subtitle: 'De richtlijnen voor digitale systemen langs een plan voor nieuwe software',
    prompt:
      'Beoordeel een projectplan voor nieuwe software aan de hand van de Nederlandse Richtlijn Digitale Systemen (NeRDS). Loop de richtlijnen langs, zoals werken vanuit de behoefte van de gebruiker, toegankelijkheid, open source, open standaarden, beveiliging, privacy en het voorkomen van leveranciersafhankelijkheid. Geef per richtlijn wat het plan al regelt, wat ontbreekt en welke vraag ik aan het projectteam stel. Sluit af met de drie punten die het eerst aandacht nodig hebben.',
  },
];
