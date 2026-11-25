import type { SharingLevel, VisibilityLevel } from '@/types';

/**
 * Twee standen voor de gebruiker: Privé of Publiek. De database kent nog de oude
 * niveaus (afdeling, directie, ministerie) van de stand op branch stand-25-11-2026;
 * die blijven daar bestaan, maar deze app maakt ze niet meer aan en toont ze als
 * Publiek. Publiek is het niveau 'public' en gaat langs een beheerder.
 */
export const SHARING_LEVELS: { value: SharingLevel; label: string; description: string }[] = [
  { value: 'private', label: 'Privé', description: 'Alleen voor jezelf zichtbaar.' },
  { value: 'public', label: 'Publiek', description: 'Voor iedereen die PromptPlein gebruikt.' },
];

/**
 * Het enige aanvinkbare deelniveau, met uitleg over wie het ziet en wat er na
 * opslaan gebeurt. Privé is geen niveau: dat is een prompt zonder deelniveau.
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
    value: 'public',
    label: 'Publiek',
    description: 'Zichtbaar voor iedereen die PromptPlein gebruikt.',
    approval: 'Een beheerder beoordeelt het voordat het zichtbaar wordt.',
    approvalShort: 'Wacht op beheerder',
    autoApproved: false,
  },
];

export function visibilityMeta(level: VisibilityLevel) {
  return VISIBILITY_LEVELS.find((v) => v.value === level);
}

/**
 * Leid het representatieve sharing_level van een prompt-rij af uit de gekozen
 * deelniveaus. Geen niveau gekozen = privé. Eén bron, gebruikt bij aanmaken én
 * bij het later aanpassen van de zichtbaarheid.
 */
export function representativeSharingLevel(levels: VisibilityLevel[]): SharingLevel {
  return levels.length > 0 ? 'public' : 'private';
}

/** Elk oud deelniveau (afdeling, directie, ministerie) telt hier als Publiek. */
export function sharingLabel(level: SharingLevel): string {
  return level === 'private' ? 'Privé' : 'Publiek';
}

export function sharingBadgeClasses(level: SharingLevel): string {
  return level === 'private' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800';
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

/** Haal een waarde uit de lijst of zet hem erin. */
export function toggled<T>(list: T[] | undefined, value: T): T[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
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
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Safari op de iPhone weigert dit zodra er na de tik eerst iets anders is
      // gebeurd, zoals een deellink aanmaken. De omweg hieronder lukt dan vaak nog.
    }
  }
  const previous = document.activeElement as HTMLElement | null;
  const el = document.createElement('textarea');
  el.value = text;
  el.readOnly = true;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  // Onder 16 pixels zoomt iOS in op het veld, ook als je het niet ziet.
  el.style.fontSize = '16px';
  document.body.appendChild(el);
  el.select();
  el.setSelectionRange(0, text.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(el);
  previous?.focus({ preventScroll: true });
  if (!copied) throw new Error('Kopiëren is niet gelukt.');
}
