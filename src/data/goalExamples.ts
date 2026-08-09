// Voorbeelddoelen voor de brainstormsessie: "Wat wil je graag bereiken?"
//
// Dit zijn PROBLEMEN, geen technieken. Wie een brainstorm start heeft geen
// methodevoorkeur maar een vraagstuk waar hij niet uitkomt; het gesprek pluist
// dat stap voor stap uit en bepaalt pas aan het eind welke prompttechniek erbij
// past. Een voorbeeld als "ik wil uitzoomen naar het vraagstuk erachter" is dus
// geen doel maar een techniek in vermomming — precies wat deze lijst niet moet
// zijn.
//
// De categorie (en daarmee het icoon) komt uit dezelfde lijst als de
// startsjablonen in de chat en de voorbeeldprompts in de optimizer: hetzelfde
// soort werk ziet er in de hele app hetzelfde uit.

import { PROMPT_CATEGORIES, type PromptCategoryId } from './promptCategories';

export interface GoalExample {
  category: PromptCategoryId;
  /** Korte titel: het soort vraagstuk, in de woorden van de gebruiker. */
  title: string;
  /** Eén regel eronder: waar dit vraagstuk over gaat. */
  subtitle: string;
  /** De tekst die in het doelveld wordt gezet. */
  goal: string;
}

export const GOAL_EXAMPLES: GoalExample[] = [
  {
    category: 'beleid',
    title: 'Ik weet niet waar ik moet beginnen',
    subtitle: 'Een opdracht die nog alle kanten op kan',
    goal: 'Ik moet een nieuwe subsidieregeling uitvoerbaar krijgen, maar de opdracht is nog breed en ik weet niet waar ik moet beginnen of wat ik als eerste moet uitzoeken.',
  },
  {
    category: 'begrijpelijk',
    title: 'Onze brief roept vragen op',
    subtitle: 'Veel telefoontjes na een standaardbrief',
    goal: 'Onze standaardbrief levert elke maand veel telefoontjes op. Ik wil weten wat er precies aan schort en hoe de brief eruit moet zien zodat mensen hem wel begrijpen.',
  },
  {
    category: 'bestuurlijk',
    title: 'Er ligt al een oplossing op tafel',
    subtitle: 'Maar raakt die maatregel het echte probleem?',
    goal: 'Er is al besloten dat er een meldplicht komt, maar ik twijfel of dat het probleem oplost dat we eigenlijk hebben. Ik wil dat scherp krijgen voordat ik het uitwerk.',
  },
  {
    category: 'onderzoek',
    title: 'Ik moet aanvragen beoordelen',
    subtitle: 'De uitkomst moet navolgbaar en vergelijkbaar zijn',
    goal: 'Ik moet vier aanvragen beoordelen en collega’s beoordelen dezelfde stukken. De uitkomst moet navolgbaar zijn en bij iedereen op dezelfde manier tot stand komen.',
  },
  {
    category: 'samenvatten',
    title: 'Ik verzuip in de stukken',
    subtitle: 'Veel documenten, weinig tijd, geen fouten toegestaan',
    goal: 'Ik moet vragen beantwoorden op basis van een dossier van honderden pagina’s, en wat ik opschrijf moet terug te vinden zijn in die stukken.',
  },
  {
    category: 'overleg',
    title: 'Elke maand hetzelfde werk',
    subtitle: 'Een terugkerend stuk dat steeds anders uitvalt',
    goal: 'Ik maak elke maand dezelfde rapportage, maar hij valt steeds anders uit — zeker als een collega hem maakt. Ik wil dat dit consistent en sneller gaat.',
  },
  {
    category: 'communicatie',
    title: 'Meerdere partijen moeten meekunnen',
    subtitle: 'Eén stuk, botsende belangen',
    goal: 'Mijn voorstel moet standhouden bij de jurist, de uitvoeringsorganisatie én communicatie, en die drie willen niet hetzelfde. Ik wil weten hoe ik dat in één stuk krijg.',
  },
  {
    category: 'bestuurlijk',
    title: 'Een fout hierin is duur',
    subtitle: 'Een stuk dat extern gaat en feitelijk moet kloppen',
    goal: 'Mijn stuk gaat naar de bewindspersoon en daarna mogelijk naar de Kamer. Ik wil zeker weten dat de cijfers en verwijzingen kloppen voordat het de deur uitgaat.',
  },
];

/** De categorie (naam + icoon) die bij een voorbeeld hoort. */
export function categoryOf(example: GoalExample) {
  return PROMPT_CATEGORIES[example.category];
}
