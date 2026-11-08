import '@nldd/design-system/icon';
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
  /** Name of the nldd icon (`<nldd-icon icon=...>`). */
  iconName: string;
}

export const PROMPT_CATEGORIES: Record<PromptCategoryId, PromptCategory> = {
  samenvatten: { label: 'Samenvatten & analyseren', iconName: 'file-text' },
  begrijpelijk: { label: 'Begrijpelijke taal', iconName: 'languages' },
  burgercontact: { label: 'Contact met burgers', iconName: 'envelope' },
  bestuurlijk: { label: 'Bestuurlijk & politiek', iconName: 'building' },
  beleid: { label: 'Beleid & regelgeving', iconName: 'signpost' },
  europa: { label: 'Europa & internationaal', iconName: 'globe' },
  openbaarheid: { label: 'Openbaarheid & Woo', iconName: 'search' },
  toezicht: { label: 'Toezicht & handhaving', iconName: 'shield' },
  communicatie: { label: 'Communicatie & voorlichting', iconName: 'megaphone' },
  onderzoek: { label: 'Kennis & onderzoek', iconName: 'book' },
  overleg: { label: 'Overleg & verslag', iconName: 'check-list' },
  privacy: { label: 'Privacy & AVG', iconName: 'lock' },
  inkoop: { label: 'Bedrijfsvoering & inkoop', iconName: 'business-suitcase' },
  data: { label: 'Data & dashboards', iconName: 'bar-chart' },
  digitaal: { label: 'Digitaal & ICT', iconName: 'code' },
};
