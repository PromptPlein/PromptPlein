/**
 * Types for src/config/brandColors.js, which reads every color from the
 * design system tokens at runtime.
 */

export type Scheme = 'light' | 'dark';

export type RijksblauwTint =
  | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type RijkskleurName =
  | 'oranje' | 'oranjeDonker' | 'rood' | 'groen' | 'hemelblauw' | 'lichtblauw'
  | 'donkergeel' | 'mintgroen' | 'mosgroen' | 'donkergroen' | 'violet' | 'paars' | 'bruin';

type OrgType =
  | 'government' | 'ministry' | 'directorate_general' | 'directorate' | 'agency' | 'department';

export function currentScheme(): Scheme;
export function readToken(name: string, scheme?: Scheme): string;
export function readRawToken(name: string): string;

export const rijksblauwTokens: Record<RijksblauwTint, string>;
export const rijkskleurTokens: Record<RijkskleurName, string>;
export const rijksblauw: Record<RijksblauwTint, string>;
export const rijkskleur: Record<RijkskleurName, string>;

export const brand: {
  readonly primary: string;
  readonly primaryDark: string;
  readonly primaryDarker: string;
  readonly primaryLight: string;
  readonly primaryLighter: string;
  readonly secondary: string;
};

export const categoryPalette: readonly string[];

export const backgroundGradient: { readonly deep: string; readonly mid: string; readonly light: string };

export const orgTypeTokens: Record<OrgType, string>;
export const orgTypeColor: Record<OrgType, string>;

export const ecosystemPalette: readonly string[];

export function documentStyle(): {
  content: string;
  secondary: string;
  muted: string;
  surface: string;
  border: string;
  faint: string;
  primary: string;
  heading: string;
  fontFamily: string;
  monoFamily: string;
};

export function hexToRgbNorm(hex: string): [number, number, number];
export function hexToVec3(hex: string): string;
