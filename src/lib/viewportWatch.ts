/**
 * Houdt bij hoeveel van het venster echt zichtbaar is.
 *
 * Op een telefoon legt het schermtoetsenbord zich over de pagina heen: de
 * paginahoogte blijft gelijk, alleen het zichtbare deel krimpt. `100dvh` en
 * `innerHeight` zien dat niet, `visualViewport` wel. Zonder deze meting staat het
 * tekstvak van de chat onder het toetsenbord.
 *
 * `--zichtbaar` is de zichtbare hoogte in pixels. `data-toetsenbord` op `<html>`
 * staat op `open` zolang er een toetsenbord in beeld is.
 */

/** Boven deze hoogte is het geen adresbalk die inklapt, maar een toetsenbord. */
const KEYBOARD_MIN_HEIGHT = 120;

export const VIEWPORT_EVENT = 'opl-viewport';

export function visibleHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

export function isKeyboardOpen(): boolean {
  return document.documentElement.dataset.toetsenbord === 'open';
}

export function installViewportWatch(): void {
  const root = document.documentElement;
  const viewport = window.visualViewport;

  const update = () => {
    const height = visibleHeight();
    root.style.setProperty('--zichtbaar', `${Math.round(height)}px`);
    const covered = window.innerHeight - height - (viewport?.offsetTop ?? 0);
    // Inzoomen met twee vingers verkleint het zichtbare deel ook, zonder dat er
    // een toetsenbord is. Tel dat dus niet mee.
    const zoomed = (viewport?.scale ?? 1) > 1.01;
    const open = !zoomed && covered > KEYBOARD_MIN_HEIGHT;
    if (open) root.dataset.toetsenbord = 'open';
    else delete root.dataset.toetsenbord;
    window.dispatchEvent(new Event(VIEWPORT_EVENT));
  };

  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
}
