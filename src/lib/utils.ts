import type { SharingLevel, VisibilityLevel } from '@/types';

export const SHARING_LEVELS: { value: SharingLevel; label: string; description: string }[] = [
  { value: 'private', label: 'Privé', description: 'Alleen voor jezelf zichtbaar.' },
  { value: 'department', label: 'Afdeling', description: 'Zichtbaar binnen je afdeling.' },
  { value: 'ministry', label: 'Ministerie', description: 'Zichtbaar binnen het ministerie.' },
  { value: 'public', label: 'Rijksoverheid', description: 'Voor alle overheidsmedewerkers.' },
];

/**
 * De drie aanvinkbare deelniveaus, mét uitleg over wie het ziet én wat er na
 * opslaan gebeurt (de goedkeuringsroute). Dit is de ENIGE bron voor deze teksten
 * — elke plek waar je een prompt deelt (dashboard, zoeken, generator) gebruikt
 * deze lijst, zodat de uitleg overal identiek is.
 *
 * Goedkeuringsroute:
 *   - Afdeling     → automatisch goedgekeurd, direct beschikbaar.
 *   - Ministerie   → een moderator van het ministerie beoordeelt het.
 *   - Rijksoverheid → een beheerder beoordeelt het.
 */
export const VISIBILITY_LEVELS: {
  value: VisibilityLevel;
  label: string;
  /** Wie de prompt op dit niveau mag zien. */
  description: string;
  /** Wat er na opslaan met dit niveau gebeurt (de goedkeuringsroute). */
  approval: string;
  /** Korte route-aanduiding voor compacte plekken (badges, samenvattingen). */
  approvalShort: string;
  autoApproved: boolean;
}[] = [
  {
    value: 'department',
    label: 'Afdeling',
    description: 'Zichtbaar voor collega’s binnen je eigen afdeling.',
    approval: 'Wordt direct gedeeld — afdelingsniveau is automatisch goedgekeurd.',
    approvalShort: 'Direct beschikbaar',
    autoApproved: true,
  },
  {
    value: 'ministry',
    label: 'Ministerie',
    description: 'Zichtbaar voor iedereen binnen je ministerie (inclusief de onderliggende diensten en afdelingen).',
    approval: 'Een moderator van het ministerie beoordeelt het voordat het zichtbaar wordt.',
    approvalShort: 'Wacht op moderator',
    autoApproved: false,
  },
  {
    value: 'public',
    label: 'Rijksoverheid',
    description: 'Openbaar voor alle overheidsmedewerkers binnen de hele Rijksoverheid.',
    approval: 'Een beheerder beoordeelt het voordat het Rijksbreed zichtbaar wordt.',
    approvalShort: 'Wacht op beheerder',
    autoApproved: false,
  },
];

export function visibilityMeta(level: VisibilityLevel) {
  return VISIBILITY_LEVELS.find((v) => v.value === level);
}

/**
 * Leid het representatieve sharing_level van een prompt-rij af uit de gekozen
 * deelniveaus (het hoogste niveau telt voor de badge/export/filters). Geen
 * niveau gekozen = privé. Eén bron, gebruikt bij aanmaken én bij het later
 * aanpassen van de zichtbaarheid.
 */
export function representativeSharingLevel(levels: VisibilityLevel[]): SharingLevel {
  if (levels.includes('public')) return 'public';
  if (levels.includes('ministry')) return 'ministry';
  if (levels.includes('department')) return 'department';
  return 'private';
}

export function sharingLabel(level: SharingLevel): string {
  return SHARING_LEVELS.find((s) => s.value === level)?.label ?? level;
}

export function sharingBadgeClasses(level: SharingLevel): string {
  switch (level) {
    case 'private':
      return 'bg-slate-100 text-slate-700';
    case 'department':
      return 'bg-sky-100 text-sky-800';
    case 'ministry':
      return 'bg-indigo-100 text-indigo-800';
    case 'public':
      return 'bg-emerald-100 text-emerald-800';
    default:
      // Vangt ook oudere prompts op met een inmiddels verwijderd deelniveau.
      return 'bg-slate-100 text-slate-700';
  }
}

const USER_KEY = 'opl.currentUser';

/** Eenvoudige "wie ben ik" zonder auth (Phase 1). */
export function getCurrentUser(): string {
  return localStorage.getItem(USER_KEY) ?? '';
}

export function setCurrentUser(name: string): void {
  localStorage.setItem(USER_KEY, name);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback voor oudere browsers.
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}
