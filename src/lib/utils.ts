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

/**
 * Bepaalt de identiteit die bij een activiteit/analytics-event hoort, zodat een
 * beheerder in "Recente activiteit" ziet WIE iets deed i.p.v. "Anoniem". Neemt bij
 * voorkeur de naam van de ingelogde gebruiker, dan het e-mailadres, en valt pas
 * daarna terug op de (oude) lokale naam. Leeg alleen als er echt niets bekend is.
 */
export function activityIdentifier(
  profile?: { full_name?: string | null; email?: string | null } | null,
  userEmail?: string | null,
): string {
  return (
    profile?.full_name?.trim() ||
    profile?.email?.trim() ||
    userEmail?.trim() ||
    getCurrentUser() ||
    ''
  );
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

/**
 * Verwijdert inline-Markdown uit AI-tekst en houdt de leesbare inhoud over.
 * Sommige providers (m.n. Mistral) leveren `**vet**`, `*cursief*`, koppen en
 * lijst-markeringen terug; in de uitleg-tekstjes willen we die opmaak niet —
 * gewoon platte tekst. We strippen de markeringen maar laten de woorden staan.
 */
export function stripMarkdown(input: string): string {
  if (!input) return '';
  return (
    input
      // **vet** / __vet__  → vet   (en *cursief* / _cursief_ → cursief)
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // `code` → code
      .replace(/`([^`]+)`/g, '$1')
      // [tekst](url) → tekst
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Kop-hekjes en blockquote-tekens aan het begin van een regel weghalen.
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^[ \t]*>[ \t]?/gm, '')
      // Lijst-bullets (*, -, +) aan het begin van een regel → een nette •.
      .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')
      // Overgebleven losse sterretjes (bijv. een onafgesloten **) opruimen.
      .replace(/\*/g, '')
      .trim()
  );
}

/**
 * Ruimt Markdown-vetmarkeringen op in een gegenereerde prompt. Modellen leveren
 * koppen aan als `**1. Aanleiding en doel**`, maar de prompt wordt als platte
 * tekst getoond en gekopieerd — dan lees je de sterretjes letterlijk terug. We
 * halen ze weg en zetten achter een kop een dubbele punt.
 *
 * Bewust veel terughoudender dan {@link stripMarkdown}: `#`-koppen (de vaste
 * structuur van de CARE-raamwerken) en lijst-streepjes blijven staan, want die
 * horen bij de prompt zelf.
 */
export function tidyPromptMarkup(input: string): string {
  if (!input) return '';
  return input
    .split('\n')
    .map((line) => {
      // Een regel die volledig vet is, is een kop: sterretjes eraf, dubbele punt erachter.
      const heading = line.match(/^(\s*)\*\*(.+?)\*\*[ \t]*$/);
      if (heading) {
        const [, indent, raw] = heading;
        const title = raw.trim();
        // Al leesteken aan het eind, of al een dubbele punt in de kop
        // ("Projectplan: …")? Dan niets toevoegen.
        const needsColon = !/[:?!.]$/.test(title) && !title.includes(':');
        return `${indent}${title}${needsColon ? ':' : ''}`;
      }
      // Vet middenin een regel: alleen de markeringen weghalen.
      return line.replace(/\*\*(.+?)\*\*/g, '$1');
    })
    .join('\n');
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
