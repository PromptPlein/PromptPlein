// Eén categorie-indeling voor alle voorbeelden in de app: de startsjablonen in
// de chat én de voorbeeldprompts in de optimizer. Zelfde categorie = zelfde
// icoon en zelfde naam, waar je ook in de app bent.
//
// De indeling volgt het werk van een rijksambtenaar, niet de techniek van een
// prompt. Als kapstok dienen de acht functiefamilies van het Functiegebouw Rijk
// (beleid, uitvoering, toezicht, advisering, kennis en onderzoek,
// bedrijfsvoering, project-/programmamanagement, lijnmanagement), vertaald naar
// de producten waar mensen echt aan werken: Kamerbrieven en beslisnota's,
// BNC-fiches, Woo-besluiten, publieksteksten, inspectierapporten.

import {
  BarChart3,
  BookOpen,
  Briefcase,
  CodeXml,
  Compass,
  FileSearch,
  FileText,
  Globe,
  Landmark,
  Languages,
  ListChecks,
  Lock,
  Mail,
  Megaphone,
  ShieldAlert,
  type LucideIcon,
} from '@/components/common/icons';

export type PromptCategoryId =
  | 'samenvatten'
  | 'begrijpelijk'
  | 'burgercontact'
  | 'bestuurlijk'
  | 'beleid'
  | 'europa'
  | 'openbaarheid'
  | 'toezicht'
  | 'communicatie'
  | 'onderzoek'
  | 'overleg'
  | 'privacy'
  | 'inkoop'
  | 'data'
  | 'digitaal';

export interface PromptCategory {
  label: string;
  /** Lucide component, still used by callers that are not on nldd yet. */
  icon: LucideIcon;
  /** Name of the nldd icon (`<nldd-icon icon=...>`). */
  iconName: string;
}

export const PROMPT_CATEGORIES: Record<PromptCategoryId, PromptCategory> = {
  samenvatten: { label: 'Samenvatten & analyseren', icon: FileText, iconName: 'file-text' },
  begrijpelijk: { label: 'Begrijpelijke taal', icon: Languages, iconName: 'languages' },
  burgercontact: { label: 'Contact met burgers', icon: Mail, iconName: 'envelope' },
  bestuurlijk: { label: 'Bestuurlijk & politiek', icon: Landmark, iconName: 'building' },
  beleid: { label: 'Beleid & regelgeving', icon: Compass, iconName: 'signpost' },
  europa: { label: 'Europa & internationaal', icon: Globe, iconName: 'globe' },
  openbaarheid: { label: 'Openbaarheid & Woo', icon: FileSearch, iconName: 'search' },
  toezicht: { label: 'Toezicht & handhaving', icon: ShieldAlert, iconName: 'shield' },
  communicatie: { label: 'Communicatie & voorlichting', icon: Megaphone, iconName: 'megaphone' },
  onderzoek: { label: 'Kennis & onderzoek', icon: BookOpen, iconName: 'book' },
  overleg: { label: 'Overleg & verslag', icon: ListChecks, iconName: 'check-list' },
  privacy: { label: 'Privacy & AVG', icon: Lock, iconName: 'lock' },
  inkoop: { label: 'Bedrijfsvoering & inkoop', icon: Briefcase, iconName: 'business-suitcase' },
  data: { label: 'Data & dashboards', icon: BarChart3, iconName: 'bar-chart' },
  digitaal: { label: 'Digitaal & ICT', icon: CodeXml, iconName: 'code' },
};
