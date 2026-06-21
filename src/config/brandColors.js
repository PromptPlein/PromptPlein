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
 * Hoofdkleur  = rijksblauw (Rijkshuisstijl, #01689B)
 * Secundair   = rijksoranje (#E17000)
 */

/**
 * Volledige tintschaal van de primaire kleur (rijksblauw, 500 = hoofdkleur).
 * @type {Record<50|100|200|300|400|500|600|700|800|900, string>}
 */
export const rijksblauw = {
  50: '#e6f1f6',
  100: '#cce3ee',
  200: '#99c7dd',
  300: '#66abcc',
  400: '#338fbb',
  500: '#01689b', // Hoofd-rijksblauw (Rijkshuisstijl)
  600: '#015580',
  700: '#014265',
  800: '#01304a',
  900: '#011d2e',
};

/** Secundaire merkkleur. @type {string} */
export const rijksoranje = '#e17000';

/** Donkere variant van de secundaire kleur (hover/gradient-eind). @type {string} */
export const rijksoranjeDonker = '#c45f00';

/** Overige rijkshuisstijl-accenten. */
export const rijksrood = '#d52b1e';
export const rijksgroen = '#39870c';

/**
 * Semantische aliassen — gebruik deze in plaats van losse hex-strings.
 */
export const brand = {
  primary: rijksblauw[500],
  primaryDark: rijksblauw[700],
  primaryDarker: rijksblauw[800],
  primaryLight: rijksblauw[400],
  primaryLighter: rijksblauw[200],
  secondary: rijksoranje,
};

/**
 * Categorie-/clusterpalet voor datavisualisaties (grafieken).
 * Start met de merkkleuren en vult aan met onderscheidende tinten.
 * @type {string[]}
 */
export const categoryPalette = [
  rijksblauw[500],
  rijksoranje,
  rijksgroen,
  rijksrood,
  rijksblauw[400],
  rijksblauw[200],
  rijksblauw[700],
  '#e8a33d',
];

/**
 * Verloopkleuren voor de decoratieve 3D-achtergrond (diep → hoofdkleur → licht).
 * @type {{ deep: string, mid: string, light: string }}
 */
export const backgroundGradient = {
  deep: '#013350',
  mid: rijksblauw[500],
  light: '#4aa3cc',
};

/**
 * Kleur per organisatietype, gedeeld door OrgChart en het 3D-netwerk.
 * @type {Record<'government'|'ministry'|'directorate_general'|'directorate'|'agency'|'department', string>}
 */
export const orgTypeColor = {
  government: rijksblauw[700],
  ministry: rijksblauw[500],
  directorate_general: '#5566c4',
  directorate: '#2f6db3',
  agency: '#3f9d6b',
  department: '#7a8aa8',
};

/**
 * Bredere clusterkleuren voor het prompt-ecosysteem (3D).
 * @type {string[]}
 */
export const ecosystemPalette = [
  rijksblauw[500],
  '#2f6db3',
  '#3f9d6b',
  '#c0792b',
  '#8a4fbd',
  '#1f9aa6',
  '#b8456b',
  '#5a7d2a',
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
