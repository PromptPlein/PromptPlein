import type { SharingLevel } from '@/types';

export const SHARING_LEVELS: { value: SharingLevel; label: string; description: string }[] = [
  { value: 'private', label: 'Privé', description: 'Alleen voor jezelf zichtbaar.' },
  { value: 'department', label: 'Afdeling', description: 'Zichtbaar binnen je afdeling.' },
  { value: 'ministry', label: 'Ministerie', description: 'Zichtbaar binnen het ministerie.' },
  { value: 'public', label: 'Openbaar', description: 'Voor alle overheidsmedewerkers.' },
];

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
