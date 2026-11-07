import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** De open vensters, de bovenste laatst. Een bevestiging kan boven een venster staan. */
const stack: HTMLElement[] = [];

function shell(): HTMLElement | null {
  return document.getElementById('app-shell');
}

/**
 * Focus en schermlezer horen in een open venster te blijven.
 *
 * Bij openen gaat de focus naar binnen en bij sluiten terug naar de knop waar je
 * vandaan kwam. Tab loopt rond in het venster. De pagina eronder wordt `inert`:
 * `aria-modal` alleen is niet genoeg, met vegen op de telefoon komt VoiceOver
 * anders gewoon achter het venster terecht.
 *
 * `onEscape` is optioneel: `Modal` sluit bewust niet met Escape, omdat er anders
 * per ongeluk ingevulde tekst verloren gaat. Een venster dat dat wel kan (een
 * filterpaneel, een lijst) geeft hem mee.
 */
export default function useDialogFocus(
  open: boolean,
  ref: RefObject<HTMLElement>,
  onEscape?: () => void,
): void {
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;

    const previous = document.activeElement as HTMLElement | null;
    stack.push(dialog);
    const page = shell();
    page?.setAttribute('inert', '');

    // Een veld dat zelf de focus vraagt (autoFocus) krijgt voorrang.
    if (!dialog.contains(document.activeElement)) {
      dialog.focus({ preventScroll: true });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== dialog) return;
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      stack.splice(stack.indexOf(dialog), 1);
      if (stack.length === 0) page?.removeAttribute('inert');
      // De knop kan intussen weg zijn, bijvoorbeeld na verwijderen.
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
    // onEscape hoort niet in de lijst: een nieuwe functie mag de focus niet resetten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
