import {
  Blocks,
  BookOpen,
  Bot,
  Briefcase,
  CircleHelp,
  ClipboardCheck,
  CodeXml,
  Footprints,
  Gauge,
  Hammer,
  Images,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Palette,
  PenLine,
  Repeat,
  Route,
  ShieldCheck,
  Table,
  Telescope,
  Users,
  WandSparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from '@/components/common/icons';
import { isContextPrompt, isSjabloon } from '@/lib/techniques';
import type { Technique } from '@/types';

/**
 * Waarvoor iemand een framework of techniek pakt. /technieken begint hier en niet
 * bij de namen: "CO-STAR" zegt een medewerker niets, "Schrijven" wel.
 */
export type TechniekDoel = 'schrijven' | 'uitdenken' | 'controleren' | 'bouwen' | 'vast';

export interface DoelTegel {
  id: TechniekDoel;
  naam: string;
  zin: string;
  icon: LucideIcon;
}

/** De doelen, in de volgorde van de tegels. */
export const TECHNIEK_DOELEN: DoelTegel[] = [
  { id: 'schrijven', naam: 'Schrijven', zin: 'Een tekst of bericht maken', icon: PenLine },
  { id: 'uitdenken', naam: 'Uitdenken', zin: 'Een lastige vraag uitpluizen', icon: Lightbulb },
  { id: 'controleren', naam: 'Controleren', zin: 'Een antwoord of stuk toetsen', icon: ShieldCheck },
  { id: 'bouwen', naam: 'Bouwen', zin: 'Een dashboard, tool of agent', icon: Hammer },
  { id: 'vast', naam: 'Vaste vorm', zin: 'Elke keer hetzelfde resultaat', icon: Repeat },
];

export interface TechniekKaart {
  doel: TechniekDoel;
  /** Waar hij goed in is, in een paar woorden: dit staat op de tegel. */
  kort: string;
  /** Eén of twee korte zinnen voor het infobolletje. */
  info: string;
  icon: LucideIcon;
}

/**
 * De indeling per techniek, op naam (kleine letters), net als de naamlijsten in
 * techniques.ts. Een techniek die hier niet staat, bijvoorbeeld een nieuwe uit
 * Beheer, blijft zichtbaar: zie {@link techniekKaart}.
 */
const KAARTEN: Record<string, TechniekKaart> = {
  care: {
    doel: 'schrijven',
    kort: 'De basis voor elke prompt',
    info: 'Zet een simpele vraag om in een gestructureerde prompt met Context, Ask, Rules en Examples.',
    icon: Blocks,
  },
  'co-star': {
    doel: 'schrijven',
    kort: 'Communicatie en content',
    info: 'Legt context, doel, stijl, toon, doelgroep en gewenste vorm vast.',
    icon: Megaphone,
  },
  create: {
    doel: 'schrijven',
    kort: 'Creatieve opdrachten',
    info: 'Geeft richting met context, rol, voorbeelden, actie, toon en eindresultaat.',
    icon: Palette,
  },
  craft: {
    doel: 'schrijven',
    kort: 'Zakelijke stukken',
    info: 'Heldere zakelijke output op basis van context, rol, actie, format en doelgroep.',
    icon: Briefcase,
  },
  raise: {
    doel: 'schrijven',
    kort: 'Snelle, concrete taken',
    info: 'Zegt snel wie de AI moet zijn, welke actie nodig is en welke input telt.',
    icon: Zap,
  },
  'persona prompting': {
    doel: 'schrijven',
    kort: 'Schrijven voor je ontvanger',
    info: 'Bepaal de ontvanger. De AI past focus, toon en detailniveau daarop aan.',
    icon: Users,
  },
  'multi-persona prompting': {
    doel: 'schrijven',
    kort: 'Voor meerdere ontvangers',
    info: 'Stemt de prompt af op meerdere belanghebbenden tegelijk.',
    icon: Users,
  },
  crispe: {
    doel: 'uitdenken',
    kort: 'Complexe opdrachten',
    info: 'Maakt context, rol, instructies, stappen, randvoorwaarden en einddoel expliciet.',
    icon: Layers,
  },
  'chain-of-thought': {
    doel: 'uitdenken',
    kort: 'Stap voor stap werken',
    info: 'De AI stelt eerst stap voor stap vragen en maakt daarna het eindproduct.',
    icon: Footprints,
  },
  'socratic prompting': {
    doel: 'uitdenken',
    kort: 'Aannames blootleggen',
    info: 'De AI stelt één vraag tegelijk en legt zo verborgen aannames bloot.',
    icon: CircleHelp,
  },
  'step-back prompting': {
    doel: 'uitdenken',
    kort: 'Eerst uitzoomen',
    info: 'Eerst het onderliggende vraagstuk, dan pas de concrete vraag.',
    icon: Telescope,
  },
  'meta prompting': {
    doel: 'uitdenken',
    kort: 'AI scherpt je prompt aan',
    info: 'Keer de rollen om: de AI maakt eerst je prompt scherper en antwoordt dan.',
    icon: WandSparkles,
  },
  'chain-of-verification': {
    doel: 'controleren',
    kort: 'AI controleert zichzelf',
    info: 'De AI trekt zijn eigen concept na met controlevragen voordat het definitief is.',
    icon: ShieldCheck,
  },
  bronbinding: {
    doel: 'controleren',
    kort: 'Alleen uit jouw stukken',
    info: 'De AI antwoordt alleen uit jouw stukken, met een verwijzing per bewering.',
    icon: BookOpen,
  },
  'rubric-toetsing': {
    doel: 'controleren',
    kort: 'Toetsen aan een kader',
    info: 'Beoordeelt een stuk tegen een vast kader, met score en onderbouwing per criterium.',
    icon: ClipboardCheck,
  },
  'dashboard (prototype)': {
    doel: 'bouwen',
    kort: 'Klikbaar, met nepdata',
    info: 'Bouwt een /goal-opdracht voor een klikbaar prototype, zonder backend of login.',
    icon: LayoutDashboard,
  },
  'dashboard (volledig)': {
    doel: 'bouwen',
    kort: 'Met echte data',
    info: 'Bouwt een /goal-opdracht voor een dashboard met echte databronnen en rollen.',
    icon: Gauge,
  },
  'goal (agents)': {
    doel: 'bouwen',
    kort: 'Opdracht voor een AI-agent',
    info: 'Bouwt een /goal-opdracht voor een agent die doorwerkt tot het doel bereikt is.',
    icon: Bot,
  },
  'vibecode (nieuw project)': {
    doel: 'bouwen',
    kort: 'Iets nieuws laten bouwen',
    info: 'Laat AI een nieuwe webapplicatie, een hulpmiddel of een script bouwen.',
    icon: Hammer,
  },
  'vibecode (bestaande code)': {
    doel: 'bouwen',
    kort: 'Werken in bestaande code',
    info: 'Een fout oplossen, een functie toevoegen of gericht opruimen.',
    icon: CodeXml,
  },
  'routekaart (rijksstijl)': {
    doel: 'vast',
    kort: 'Een traject in stappen',
    info: 'Sjabloon: laat zien waar je vandaan komt, waar je staat en waar je heen wilt.',
    icon: Route,
  },
  'few-shot voorbeelden': {
    doel: 'vast',
    kort: 'Leren van jouw voorbeelden',
    info: 'Geef 2 à 3 voorbeelden. De AI leert het patroon en doet de nieuwe taak net zo.',
    icon: Images,
  },
  'template-based output': {
    doel: 'vast',
    kort: 'Vaste structuur invullen',
    info: 'De AI vult een vaste structuur in, zoals een nota of besluitvoorstel.',
    icon: Table,
  },
  'gestructureerde output': {
    doel: 'vast',
    kort: 'Een vast outputformaat',
    info: 'Dwingt een vast formaat af, zoals een tabel, lijst of vaste secties.',
    icon: Table,
  },
  'skill creator': {
    doel: 'vast',
    kort: 'Eén vaste instructie maken',
    info: 'Eén vaste instructie voor je eigen AI-omgeving, zodat elke invoer gelijk gaat.',
    icon: Wrench,
  },
};

/**
 * De tegel van een techniek. Staat hij niet in de lijst, dan valt hij terug op
 * zijn eigen omschrijving en een doel dat bij zijn soort past: liever op een
 * ruime plek dan onvindbaar. Een nieuw sjabloon hoort altijd bij Vaste vorm.
 */
export function techniekKaart(t: Technique): TechniekKaart {
  const kaart = KAARTEN[t.name.trim().toLowerCase()];
  if (kaart) return kaart;
  const framework = isContextPrompt(t);
  const omschrijving = t.description?.trim() ?? '';
  return {
    doel: isSjabloon(t) ? 'vast' : framework ? 'schrijven' : 'uitdenken',
    kort: omschrijving,
    info: omschrijving,
    icon: framework ? Layers : Wrench,
  };
}
