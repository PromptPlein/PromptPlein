/**
 * De titel per pagina. Een schermlezer leest hem voor, en met meerdere tabbladen
 * of apps open is het de enige naam die je ziet (WCAG 2.4.2).
 */
const TITLES: [prefix: string, title: string][] = [
  ['/instellingen/toegankelijkheid/hulp', 'Hulp bij toegankelijkheid'],
  ['/instellingen/toegankelijkheid', 'Toegankelijkheid instellen'],
  ['/instellingen', 'Instellingen'],
  ['/genereren', 'Prompt maken'],
  ['/technieken', 'Technieken'],
  ['/zoeken', 'Ontdekken'],
  ['/chat', 'Chat'],
  ['/bibliotheek', 'Mijn prompts'],
  ['/prompt/', 'Prompt'],
  ['/share/', 'Gedeelde prompt'],
  ['/community', 'Community'],
  ['/trending', 'Trending'],
  ['/activiteit', 'Activiteit'],
  ['/contact', 'Contact'],
  ['/profiel', 'Mijn profiel'],
  ['/netwerk', 'Netwerk'],
  ['/goedkeuringen', 'Goedkeuringen'],
  ['/auth/login', 'Inloggen'],
  ['/auth/registreren', 'Registreren'],
  ['/auth/wachtwoord-vergeten', 'Wachtwoord vergeten'],
  ['/auth/nieuw-wachtwoord', 'Nieuw wachtwoord'],
  ['/admin/goedkeuringen', 'Beheer: goedkeuringen'],
  ['/admin/gebruikers', 'Beheer: gebruikers'],
  ['/admin/moderatoren', 'Beheer: moderatoren'],
  ['/admin/organisaties', 'Beheer: organisaties'],
  ['/admin/technieken', 'Beheer: technieken'],
  ['/admin/rollen', 'Beheer: functies'],
  ['/admin/functie-aanvragen', 'Beheer: functie-aanvragen'],
  ['/admin/categorieen', 'Beheer: categorieën'],
  ['/admin/categorie-aanvragen', 'Beheer: categorie-aanvragen'],
  ['/admin/analytics', 'Beheer: analytics'],
  ['/admin/rapportage', 'Beheer: rapportage'],
  ['/admin/audit', 'Beheer: audit log'],
  ['/admin/instellingen', 'Beheer: AI-instellingen'],
  ['/admin/prompts', 'Beheer: prompts'],
  ['/admin', 'Beheer'],
];

export function pageTitle(pathname: string): string {
  const match = TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return match ? `${match[1]} | PromptPlein` : 'PromptPlein';
}
