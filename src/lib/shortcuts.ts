/**
 * Alle sneltoetsen van PromptPlein op één plek. De hulppagina leest deze lijst, dus
 * wat daar staat is wat er werkt.
 *
 * Altijd Alt + Shift plus een letter. Eén losse letter mag niet: die gaat af tijdens
 * typen en bij spraakbediening (WCAG 2.1.4). Ctrl met een letter zit bijna altijd
 * al bezet door de browser. We kijken naar `e.code`, de fysieke toets, want op een
 * Mac maakt Option + Shift + D een ander teken.
 */
export interface Shortcut {
  /** De fysieke toets, zoals `KeyboardEvent.code` hem noemt. */
  code: string;
  /** De letter op de toets. */
  key: string;
  /** Wat de toets doet, in de vorm van een opdracht. */
  label: string;
  /** Waar de toets werkt. */
  where: string;
}

export const SHORTCUTS = {
  dicteren: {
    code: 'KeyD',
    key: 'D',
    label: 'Inspreken starten of stoppen',
    where: 'In de chat en in elk tekstvak',
  },
  voorlezen: {
    code: 'KeyV',
    key: 'V',
    label: 'Het laatste antwoord voorlezen of stoppen',
    where: 'In de chat, als voorlezen aan staat',
  },
  gesprek: {
    code: 'KeyG',
    key: 'G',
    label: 'Gesprek starten of stoppen',
    where: 'In de chat, als Gesprek zonder handen aan staat',
  },
  hulp: {
    code: 'KeyH',
    key: 'H',
    label: 'Deze hulppagina openen',
    where: 'Overal',
  },
} satisfies Record<string, Shortcut>;

export function matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean {
  return e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.repeat && e.code === shortcut.code;
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** De namen van de toetsen zoals ze op dit toetsenbord staan. */
export function shortcutKeys(shortcut: Shortcut): string[] {
  return [isMac() ? 'Option' : 'Alt', 'Shift', shortcut.key];
}

/** Waarde voor `aria-keyshortcuts`; die kent alleen Alt, ook op een Mac. */
export function ariaShortcut(shortcut: Shortcut): string {
  return `Alt+Shift+${shortcut.key}`;
}
