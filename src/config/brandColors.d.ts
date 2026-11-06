/**
 * Typedeclaraties voor de centrale merkkleuren (src/config/brandColors.js).
 * Het implementatiebestand is bewust .js zodat tailwind.config.js het kan
 * importeren; deze .d.ts geeft de TypeScript-broncode volledige typing.
 */

export type RijksblauwTint =
  | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export const rijksblauw: Record<RijksblauwTint, string>;
export const rijksoranje: string;
export const rijksoranjeDonker: string;
export const accentDonker: string;
export const accentDonkerHover: string;
export const rijksrood: string;
export const rijksgroen: string;
export const hemelblauw: string;
export const lichtblauw: string;
export const donkergeel: string;
export const mintgroen: string;
export const mosgroen: string;
export const donkergroen: string;
export const violet: string;
export const paars: string;
export const bruin: string;

export const brand: {
  primary: string;
  primaryDark: string;
  primaryDarker: string;
  primaryLight: string;
  primaryLighter: string;
  secondary: string;
};

export const categoryPalette: string[];

export const backgroundGradient: { deep: string; mid: string; light: string };

export const orgTypeColor: Record<
  'government' | 'ministry' | 'directorate_general' | 'directorate' | 'agency' | 'department',
  string
>;

export const ecosystemPalette: string[];

export function hexToRgbNorm(hex: string): [number, number, number];
export function hexToVec3(hex: string): string;
