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

/**
 * Smaller dan dit, gemeten in rem, is het scherm te krap voor kolommen: heel grote
 * tekst op een telefoon. Een media query ziet dat niet, die rekent met de
 * standaardgrootte van de browser.
 */
const NARROW_REM = 15;

/** Boven deze hoogte is het geen adresbalk die inklapt, maar een toetsenbord. */
const KEYBOARD_MIN_HEIGHT = 120;

export const VIEWPORT_EVENT = 'opl-viewport';

export function visibleHeight(): number {
  // iOS geeft tijdens het draaien soms even een negatieve waarde door.
  const height = window.visualViewport?.height ?? window.innerHeight;
  return height > 0 ? height : window.innerHeight;
}

export function isKeyboardOpen(): boolean {
  return document.documentElement.dataset.toetsenbord === 'open';
}

/** Staat de focus in iets waarvoor het schermtoetsenbord opkomt? */
function isTyping(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'file'].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Een schatting van de hoogte zonder toetsenbord, voor een stand waarin we nog niet
 * hebben gemeten: iemand draait de telefoon met het toetsenbord open.
 */
function estimatedFullHeight(portrait: boolean): number {
  const long = Math.max(window.screen.width, window.screen.height);
  const short = Math.min(window.screen.width, window.screen.height);
  return portrait ? long - 150 : short - 60;
}

export function installViewportWatch(): void {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const portraitQuery = window.matchMedia('(orientation: portrait)');
  // De hoogte zonder toetsenbord, per stand. Niet elke keer innerHeight lezen: op
  // iOS krimpt die zelf even mee terwijl het toetsenbord opkomt, en dan lijkt er
  // niets aan de hand terwijl de pagina al is weggeschoven.
  const fullHeight = { portrait: 0, landscape: 0 };

  const update = () => {
    const height = visibleHeight();
    root.style.setProperty('--zichtbaar', `${Math.round(height)}px`);
    const rem = parseFloat(getComputedStyle(root).fontSize);
    if (root.clientWidth / rem < NARROW_REM) root.dataset.krap = 'ja';
    else delete root.dataset.krap;
    const portrait = portraitQuery.matches;
    const stand = portrait ? 'portrait' : 'landscape';
    // Valt het zichtbare deel samen met het venster, dan ligt er niets overheen.
    const covered = window.innerHeight - height > 1;
    if (!isTyping() || !covered) {
      fullHeight[stand] = Math.round(Math.max(window.innerHeight, height));
    }
    const full = fullHeight[stand] || estimatedFullHeight(portrait);
    // Inzoomen met twee vingers verkleint het zichtbare deel ook, zonder dat er
    // een toetsenbord is. Tel dat dus niet mee.
    const zoomed = (viewport?.scale ?? 1) > 1.01;
    const open = !zoomed && isTyping() && covered && full - height > KEYBOARD_MIN_HEIGHT;
    if (open) root.dataset.toetsenbord = 'open';
    else delete root.dataset.toetsenbord;
    window.dispatchEvent(new Event(VIEWPORT_EVENT));
  };

  update();
  window.addEventListener('resize', update);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  // Het toetsenbord gaat dicht zonder dat de hoogte al is veranderd.
  document.addEventListener('focusout', () => requestAnimationFrame(update));
  window.addEventListener('orientationchange', () => {
    // Draai je met het toetsenbord open, dan geeft iOS onzin door: een negatieve
    // hoogte, of een hoogte groter dan het venster. Dan is niet te weten waar het
    // toetsenbord staat en ligt het over het tekstvak. Een tik haalt het zo terug.
    if (isTyping()) (document.activeElement as HTMLElement).blur();
    requestAnimationFrame(update);
  });
}
