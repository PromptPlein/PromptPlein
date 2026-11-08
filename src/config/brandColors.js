/**
 * Centrale merkkleuren (single source of truth).
 *
 * Pas hier de huisstijl aan en het werkt overal door:
 *  - Tailwind-thema (tailwind.config.js importeert dit bestand)
 *  - Three.js / WebGL-componenten (via de `rgb`/`vec3`-helpers)
 *  - PDF-/HTML-exports (geïnjecteerde stijl-strings)
 *  - Recharts-paletten, QR-codes, CSS-variabelen
 *
 * Dit is bewust een .js-bestand (met JSDoc-typing) zodat zowel de Tailwind-
 * config (`tailwind.config.js`) als de TypeScript-broncode het kunnen importeren.
 *
 * Alle waarden komen uit het Rijkshuisstijl-palet: de designtokens van de
 * NL Design System-community, gelijk aan die van RijksICTGilde/hugo-theme-rijksoverheid.
 * De grijzen van de huisstijl (cool-grey) zijn exact Tailwind `slate`.
 *
 * Lintblauw  #154273 = hoofdkleur: koppen, kop- en voetbalk, primaire knop
 * Donkerblauw #01689B = interactief: links, focus, accenten
 * Pleingroen #7CADAF = accent, het groen uit het logo; tekst erop is donker.
 *   Op wit haalt het maar 2,5:1, dus tekst en iconen krijgen de donkere tint
 *   pleingroenTekst (6:1). Vlakken, strepen en randen houden de logokleur.
 */

/**
 * Eén schaal voor beide blauwen, zodat bestaande klassen blijven kloppen:
 * 50 t/m 600 is donkerblauw, 700 t/m 900 is lintblauw.
 * @type {Record<50|100|200|300|400|500|600|700|800|900, string>}
 */
export const rijksblauw = {
  50: '#d9e8f0',
  100: '#b3d2e1',
  200: '#8cbbd2',
  300: '#66a4c3',
  400: '#408eb4',
  500: '#01689b', // Donkerblauw
  600: '#01496c',
  700: '#154273', // Lintblauw
  800: '#162f50',
  900: '#162945',
};

/** Accentkleur: het groen uit het beeldmerk van PromptPlein. @type {string} */
export const pleingroen = '#7cadaf';

/** Hover van een vlak in de accentkleur; donkere tekst erop haalt 6,7:1. @type {string} */
export const pleingroenHover = '#5da0a2';

/**
 * Tekst en iconen in de accentkleur op een lichte ondergrond. De logokleur haalt
 * daar 2,5:1; deze tint 6:1 op wit en 5:1 op een licht groen vlak. In de donkere
 * modus is dat omgekeerd en staat de logokleur zelf er (5,9:1 op slate-800).
 * @type {string}
 */
export const pleingroenTekst = '#356c6e';

/** Overige rijkshuisstijl-accenten. */
export const rijksrood = '#d52b1e';
export const rijksgroen = '#39870c';
export const hemelblauw = '#007bc7';
export const lichtblauw = '#8fcae7';
export const donkergeel = '#ffb612';
export const mintgroen = '#76d2b6';
export const mosgroen = '#777b00';
export const donkergroen = '#275937';
export const violet = '#a90061';
export const paars = '#42145f';
export const bruin = '#94710a';

/**
 * Semantische aliassen — gebruik deze in plaats van losse hex-strings.
 */
export const brand = {
  primary: rijksblauw[500],
  primaryDark: rijksblauw[700],
  primaryDarker: rijksblauw[800],
  primaryLight: rijksblauw[400],
  primaryLighter: rijksblauw[200],
  secondary: pleingroen,
};

/**
 * Categorie-/clusterpalet voor datavisualisaties (grafieken).
 * Start met de merkkleuren en vult aan met onderscheidende tinten.
 * @type {string[]}
 */
export const categoryPalette = [
  rijksblauw[500],
  pleingroen,
  rijksgroen,
  rijksrood,
  hemelblauw,
  lichtblauw,
  rijksblauw[700],
  donkergeel,
];

/**
 * Verloopkleuren voor de decoratieve 3D-achtergrond (diep → hoofdkleur → licht).
 * @type {{ deep: string, mid: string, light: string }}
 */
export const backgroundGradient = {
  deep: rijksblauw[900],
  mid: rijksblauw[700],
  light: rijksblauw[500],
};

/**
 * Kleur per organisatietype, gedeeld door OrgChart en het 3D-netwerk.
 * @type {Record<'government'|'ministry'|'directorate_general'|'directorate'|'agency'|'department', string>}
 */
export const orgTypeColor = {
  government: rijksblauw[700],
  ministry: rijksblauw[500],
  directorate_general: hemelblauw,
  directorate: paars,
  agency: rijksgroen,
  department: bruin,
};

/**
 * Bredere clusterkleuren voor het prompt-ecosysteem (3D).
 * @type {string[]}
 */
export const ecosystemPalette = [
  rijksblauw[500],
  hemelblauw,
  rijksgroen,
  pleingroen,
  paars,
  mintgroen,
  violet,
  mosgroen,
];

/**
 * Zet een hex-string (#rrggbb) om naar genormaliseerde rgb-componenten [0..1].
 * @param {string} hex
 * @returns {[number, number, number]}
 */
export function hexToRgbNorm(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/**
 * Formatteer een hex als GLSL `vec3(r, g, b)` met genormaliseerde componenten.
 * @param {string} hex
 * @returns {string}
 */
export function hexToVec3(hex) {
  const [r, g, b] = hexToRgbNorm(hex);
  return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}
