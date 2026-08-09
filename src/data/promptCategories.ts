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
  BookOpen,
  Briefcase,
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
} from 'lucide-react';

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
  | 'inkoop';

export interface PromptCategory {
  label: string;
  icon: LucideIcon;
}

export const PROMPT_CATEGORIES: Record<PromptCategoryId, PromptCategory> = {
  samenvatten: { label: 'Samenvatten & analyseren', icon: FileText },
  begrijpelijk: { label: 'Begrijpelijke taal', icon: Languages },
  burgercontact: { label: 'Contact met burgers', icon: Mail },
  bestuurlijk: { label: 'Bestuurlijk & politiek', icon: Landmark },
  beleid: { label: 'Beleid & regelgeving', icon: Compass },
  europa: { label: 'Europa & internationaal', icon: Globe },
  openbaarheid: { label: 'Openbaarheid & Woo', icon: FileSearch },
  toezicht: { label: 'Toezicht & handhaving', icon: ShieldAlert },
  communicatie: { label: 'Communicatie & voorlichting', icon: Megaphone },
  onderzoek: { label: 'Kennis & onderzoek', icon: BookOpen },
  overleg: { label: 'Overleg & verslag', icon: ListChecks },
  privacy: { label: 'Privacy & AVG', icon: Lock },
  inkoop: { label: 'Bedrijfsvoering & inkoop', icon: Briefcase },
};
