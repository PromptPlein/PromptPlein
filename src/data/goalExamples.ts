// Voorbeelddoelen voor "Wat wil je graag bereiken?" — de instap waarin de AI
// zelf bepaalt welke prompttechniek past.
//
// Anders dan de voorbeeldprompts in de optimizer zijn dit geen opdrachten maar
// DOELOMSCHRIJVINGEN: elk voorbeeld is zo geschreven dat het één bepaalde
// techniek uit de techniekenlijst oproept. Wie het voorbeeld leest, ziet meteen
// wat voor soort doel bij welke techniek hoort — dat is de les die de lijst
// moet overbrengen.
//
// De techniek-namen komen letterlijk uit de techniekenlijst van de app (zie
// data/seed.ts en de techniques-tabel): staat er straks iets anders in de
// database, dan blijft het voorbeeld kloppen zolang de naam meebeweegt.
//
// Elke techniek komt met minstens één voorbeeld terug; bij de technieken waar
// rijksambtenaren dagelijks mee te maken hebben, staan er twee — een tweede
// situatie laat beter zien wanneer je hem inzet dan een langere uitleg.

import {
  BookMarked,
  Files,
  HelpCircle,
  LayoutTemplate,
  ListOrdered,
  RefreshCw,
  ClipboardCheck,
  SearchCheck,
  ZoomOut,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface GoalExample {
  /** Naam van de techniek zoals die in de techniekenlijst staat. */
  technique: string;
  icon: LucideIcon;
  /** Korte titel: het soort doel, in de woorden van de gebruiker. */
  title: string;
  /** Eén regel eronder: waar dit doel over gaat. */
  subtitle: string;
  /** De tekst die in het doelveld wordt gezet. */
  goal: string;
}

export const GOAL_EXAMPLES: GoalExample[] = [
  {
    technique: 'Persona Prompting',
    icon: UserRound,
    title: 'Laten meelezen door één deskundige rol',
    subtitle: 'Eén rol met een eigen belang leest je stuk na',
    goal: 'Ik wil mijn conceptnota laten beoordelen vanuit de rol van een ervaren wetgevingsjurist die vooral op uitvoerbaarheid en handhaafbaarheid let, geen politiek oordeel geeft en zakelijk formuleert.',
  },
  {
    technique: 'Persona Prompting',
    icon: UserRound,
    title: 'Door de ogen van de ontvanger lezen',
    subtitle: 'Waar haakt iemand af die de regeling niet kent?',
    goal: 'Ik wil mijn brief laten lezen vanuit iemand die de regeling niet kent en moeite heeft met formele taal, zodat ik zie welke zinnen die persoon niet begrijpt en waar hij afhaakt.',
  },
  {
    technique: 'Multi-Persona Prompting',
    icon: Users,
    title: 'Voorstel dat meerdere belangen moet doorstaan',
    subtitle: 'Jurist, uitvoering en communicatie tegelijk bedienen',
    goal: 'Ik wil een voorstel dat tegelijk standhoudt bij de wetgevingsjurist, de uitvoeringsorganisatie en de communicatieadviseur, waarbij het belang van elke rol apart wordt geadresseerd.',
  },
  {
    technique: 'Multi-Persona Prompting',
    icon: Users,
    title: 'Het krachtenveld vooraf verkennen',
    subtitle: 'Bezwaren van departementen en koepels vóór zijn',
    goal: 'Ik wil vooraf weten hoe de andere departementen, de uitvoeringsorganisatie en de koepels naar deze maatregel gaan kijken, zodat ik hun bezwaren al in mijn stuk kan ondervangen.',
  },
  {
    technique: 'Few-Shot Voorbeelden',
    icon: Files,
    title: 'De stijl van eerdere stukken overnemen',
    subtitle: 'Een paar goede voorbeelden bepalen toon en opbouw',
    goal: 'Ik heb drie eerder verstuurde Kamerbrieven die precies de goede toon en opbouw hebben. Ik wil een nieuwe brief die dezelfde opbouw, toon en zinslengte aanhoudt als die voorbeelden.',
  },
  {
    technique: 'Few-Shot Voorbeelden',
    icon: Files,
    title: 'Terugkerende antwoorden uniform houden',
    subtitle: 'Elke collega levert dezelfde indeling en toon',
    goal: 'Ik heb een paar goedgekeurde antwoordbrieven op veelgestelde vragen van burgers. Ik wil dat nieuwe antwoorden qua indeling, aanhef en toon precies zo worden, ook als een collega ze schrijft.',
  },
  {
    technique: 'Gestructureerde Output',
    icon: LayoutTemplate,
    title: 'Een vast format met vaste kopjes',
    subtitle: 'Jij bepaalt de kopjes, de opmaak en de lengte',
    goal: 'Ik wil het resultaat in een vaste opmaak: de kopjes aanleiding, analyse, advies, risico’s en vervolgstappen, maximaal één A4, en zonder inleidende of afsluitende zinnen eromheen.',
  },
  {
    technique: 'Gestructureerde Output',
    icon: LayoutTemplate,
    title: 'Alles naast elkaar in één vergelijkingstabel',
    subtitle: 'Opties tegen criteria, in één overzicht',
    goal: 'Ik wil de beleidsopties naast elkaar in één tabel, met per optie een kolom voor kosten, uitvoerbaarheid, regeldruk, juridische houdbaarheid en risico, zodat ik ze direct kan vergelijken.',
  },
  {
    technique: 'Socratic Prompting',
    icon: HelpCircle,
    title: 'De aannames in een stuk blootleggen',
    subtitle: 'Vragen die je aannames omkeren, geen oordeel',
    goal: 'Ik wil mijn conceptbeleidsstuk laten onderzoeken op de aannames die erin zitten: stel me vragen die die aannames ter discussie stellen, in plaats van meteen een oordeel of een oplossing te geven.',
  },
  {
    technique: 'Socratic Prompting',
    icon: HelpCircle,
    title: 'Het probleem scherp krijgen voordat ik kies',
    subtitle: 'Doorvragen tot het echte probleem bovenligt',
    goal: 'Ik weet nog niet wat het echte probleem is achter de signalen die we binnenkrijgen. Ik wil dat verdiepende vragen me daar stap voor stap naartoe leiden voordat ik een richting kies.',
  },
  {
    technique: 'Chain-of-Thought',
    icon: ListOrdered,
    title: 'Opties stap voor stap afwegen',
    subtitle: 'Feiten, criteria, weging en pas dan een conclusie',
    goal: 'Ik wil drie beleidsopties tegen elkaar afwegen en de redenering kunnen volgen: eerst de feiten, dan de criteria, dan de weging per criterium, en pas daarna een conclusie.',
  },
  {
    technique: 'Chain-of-Verification',
    icon: SearchCheck,
    title: 'Een concept natrekken voordat het de deur uitgaat',
    subtitle: 'Wat is niet onderbouwd of nog niet geverifieerd?',
    goal: 'Ik wil mijn conceptstuk laten natrekken voordat het naar de bewindspersoon gaat: welke beweringen zijn niet onderbouwd, welke cijfers en wetsartikelen moet ik nog verifiëren, en wat blijft er staan als ik alleen aanhoud wat te controleren is.',
  },
  {
    technique: 'Step-Back Prompting',
    icon: ZoomOut,
    title: 'Uitzoomen naar het vraagstuk erachter',
    subtitle: 'Lost de voorgestelde maatregel het echte probleem op?',
    goal: 'Er ligt al een oplossingsrichting op tafel, maar ik wil eerst weten welk probleem we hier eigenlijk oplossen en voor wie, en pas daarna of de voorgestelde maatregel daar het juiste antwoord op is.',
  },
  {
    technique: 'Bronbinding',
    icon: BookMarked,
    title: 'Alleen antwoorden uit de aangeleverde stukken',
    subtitle: 'Elke bewering met vindplaats, geen kennis van buiten',
    goal: 'Ik wil vragen beantwoorden op basis van het dossier dat ik meestuur, met achter elke bewering een verwijzing naar het document en de pagina, en met "staat niet in de stukken" waar het antwoord er niet in staat.',
  },
  {
    technique: 'Rubric-toetsing',
    icon: ClipboardCheck,
    title: 'Beoordelen tegen een vast toetsingskader',
    subtitle: 'Score en onderbouwing per criterium, dan pas een oordeel',
    goal: 'Ik wil aanvragen beoordelen tegen een vast toetsingskader: per criterium een score met een onderbouwing uit het stuk zelf, de criteria onderling gewogen, en pas daarna een eindoordeel.',
  },
  {
    technique: 'Meta Prompting',
    icon: RefreshCw,
    title: 'Een nog vage opdracht scherper maken',
    subtitle: 'Eerst zien wat er ontbreekt, dan herformuleren',
    goal: 'Mijn opdracht is nog te breed geformuleerd. Ik wil eerst laten analyseren wat er aan mijn vraag ontbreekt en daarna een scherpere formulering krijgen die betere antwoorden oplevert.',
  },
];
