/**
 * Colors for everything the design system does not draw itself: three.js and
 * canvas scenes, recharts, QR codes and documents that leave the app.
 *
 * Every value comes from a token of @nldd/design-system, read at runtime. The
 * tokens are light-dark() pairs, and a custom property read from the root comes
 * back unresolved, so a probe element resolves the token in the scheme asked
 * for and a 1x1 canvas turns the resulting color (often oklch) into #rrggbb,
 * which three.js, recharts and GLSL all understand.
 *
 * The named brand colors (rijksblauw, brand, palettes) resolve in the light
 * scheme: those are the Rijkshuisstijl values, and the scenes that use them sit
 * on a dark blue ground in both modes. Code that follows the theme calls
 * readToken(name, scheme) with the scheme from ThemeContext.
 */

/** @typedef {'light' | 'dark'} Scheme */

const cache = new Map();
let probeCanvas = null;

function toHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The scheme the root currently renders in. */
export function currentScheme() {
  if (typeof document === 'undefined') return 'light';
  const value = getComputedStyle(document.documentElement).colorScheme;
  if (value === 'dark') return 'dark';
  if (value === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Turns any CSS color the browser understands into #rrggbb. */
function cssColorToHex(color) {
  if (!probeCanvas) {
    probeCanvas = document.createElement('canvas');
    probeCanvas.width = 1;
    probeCanvas.height = 1;
  }
  const ctx = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return toHex(0, 0, 0);
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return toHex(r, g, b);
}

/**
 * Resolves a design system color token, such as
 * '--primitives-color-lintblauw-750' or '--semantics-content-color', to #rrggbb.
 * @param {string} name
 * @param {Scheme} [scheme] the scheme to resolve in; defaults to the current one
 * @returns {string}
 */
export function readToken(name, scheme) {
  if (typeof document === 'undefined') return toHex(0, 0, 0);
  const used = scheme ?? currentScheme();
  const key = `${name}|${used}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const root = document.documentElement;
  if (!getComputedStyle(root).getPropertyValue(name).trim()) {
    // The stylesheet has not loaded yet, or the token does not exist.
    if (import.meta.env?.DEV) console.warn(`[brandColors] onbekend token ${name}`);
    return toHex(0, 0, 0);
  }
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.colorScheme = used;
  probe.style.color = `var(${name})`;
  root.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const hex = cssColorToHex(resolved);
  cache.set(key, hex);
  return hex;
}

/**
 * Reads a non-color token, such as a font family, as its raw value.
 * @param {string} name
 * @returns {string}
 */
export function readRawToken(name) {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const primitive = (name) => `--primitives-color-${name}`;

/** An object whose properties resolve their token on every read. */
function tokenObject(map, scheme) {
  const out = {};
  for (const [key, token] of Object.entries(map)) {
    Object.defineProperty(out, key, { enumerable: true, get: () => readToken(token, scheme) });
  }
  return out;
}

/** An array whose items resolve their token on every read. */
function tokenArray(tokens, scheme) {
  const out = [];
  tokens.forEach((token, i) => {
    Object.defineProperty(out, i, { enumerable: true, get: () => readToken(token, scheme) });
  });
  return out;
}

/**
 * One scale for both blues: 50 to 600 is donkerblauw, 700 to 900 is lintblauw.
 * Token names per step, nearest to the Rijkshuisstijl values.
 */
export const rijksblauwTokens = {
  50: primitive('donkerblauw-75'),
  100: primitive('donkerblauw-150'),
  200: primitive('donkerblauw-250'),
  300: primitive('donkerblauw-350'),
  400: primitive('donkerblauw-450'),
  500: primitive('donkerblauw-600'),
  600: primitive('donkerblauw-750'),
  700: primitive('lintblauw-750'),
  800: primitive('lintblauw-850'),
  900: primitive('lintblauw-900'),
};

/** Token names of the other Rijkshuisstijl colors. */
export const rijkskleurTokens = {
  oranje: primitive('oranje-400'),
  oranjeDonker: primitive('oranje-450'),
  rood: primitive('rood-550'),
  groen: primitive('groen-500'),
  hemelblauw: primitive('hemelblauw-500'),
  lichtblauw: primitive('lichtblauw-200'),
  donkergeel: primitive('donkergeel-200'),
  mintgroen: primitive('mintgroen-200'),
  mosgroen: primitive('mosgroen-500'),
  donkergroen: primitive('donkergroen-700'),
  violet: primitive('violet-650'),
  paars: primitive('paars-850'),
  bruin: primitive('bruin-500'),
};

/** @type {Record<50|100|200|300|400|500|600|700|800|900, string>} */
export const rijksblauw = tokenObject(rijksblauwTokens, 'light');

/** The other Rijkshuisstijl colors, light scheme. */
export const rijkskleur = tokenObject(rijkskleurTokens, 'light');

/** Semantic aliases. */
export const brand = tokenObject(
  {
    primary: rijksblauwTokens[500],
    primaryDark: rijksblauwTokens[700],
    primaryDarker: rijksblauwTokens[800],
    primaryLight: rijksblauwTokens[400],
    primaryLighter: rijksblauwTokens[200],
    secondary: rijkskleurTokens.oranje,
  },
  'light',
);

/** Category palette for charts. */
export const categoryPalette = tokenArray(
  [
    rijksblauwTokens[500],
    rijkskleurTokens.oranje,
    rijkskleurTokens.groen,
    rijkskleurTokens.rood,
    rijkskleurTokens.hemelblauw,
    rijkskleurTokens.lichtblauw,
    rijksblauwTokens[700],
    rijkskleurTokens.donkergeel,
  ],
  'light',
);

/** Gradient of the decorative background (deep, main, light). */
export const backgroundGradient = tokenObject(
  { deep: rijksblauwTokens[900], mid: rijksblauwTokens[700], light: rijksblauwTokens[500] },
  'light',
);

/** Token per organization type, shared by OrgChart and the 3D network. */
export const orgTypeTokens = {
  government: rijksblauwTokens[700],
  ministry: rijksblauwTokens[500],
  directorate_general: rijkskleurTokens.hemelblauw,
  directorate: rijkskleurTokens.paars,
  agency: rijkskleurTokens.groen,
  department: rijkskleurTokens.bruin,
};

/** Color per organization type, light scheme. */
export const orgTypeColor = tokenObject(orgTypeTokens, 'light');

/** Cluster colors of the prompt ecosystem (3D). */
export const ecosystemPalette = tokenArray(
  [
    rijksblauwTokens[500],
    rijkskleurTokens.hemelblauw,
    rijkskleurTokens.groen,
    rijkskleurTokens.oranje,
    rijkskleurTokens.paars,
    rijkskleurTokens.mintgroen,
    rijkskleurTokens.violet,
    rijkskleurTokens.mosgroen,
  ],
  'light',
);

/**
 * Colors and fonts for a document that leaves the app (HTML, Word, print). It
 * is printed on paper, so it always takes the light scheme.
 */
export function documentStyle() {
  const t = (name) => readToken(name, 'light');
  return {
    content: t('--semantics-content-color'),
    secondary: t('--semantics-content-secondary-color'),
    muted: t(primitive('neutral-400')),
    surface: t('--semantics-surfaces-tinted-background-color'),
    border: t(primitive('neutral-100')),
    faint: t('--semantics-dividers-color'),
    primary: brand.primary,
    heading: backgroundGradient.deep,
    fontFamily: readRawToken('--primitives-font-family-sans-serif') || 'sans-serif',
    monoFamily: readRawToken('--primitives-font-family-monospace') || 'monospace',
  };
}

/**
 * Splits a #rrggbb string into normalized rgb components [0..1].
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
 * Formats a #rrggbb string as a GLSL `vec3(r, g, b)`.
 * @param {string} hex
 * @returns {string}
 */
export function hexToVec3(hex) {
  const [r, g, b] = hexToRgbNorm(hex);
  return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
}
