/**
 * Elk tekstvak in de app groeit mee met zijn inhoud, tot ongeveer drie keer de
 * hoogte waarmee het begon. Daarboven neemt de eigen schuifbalk het over, zodat
 * een lange tekst het scherm niet opslokt. Leeg je het vak, dan krimpt het weer
 * terug naar de oorspronkelijke hoogte.
 *
 * Eén globale regeling in plaats van een hook per formulier, zodat ook velden
 * die later bijkomen het vanzelf doen. Een vak met een eigen regeling (de chat)
 * zet `data-autogrow="off"` op zichzelf of een ouder.
 *
 * Tekst die niet getypt wordt maar door de app wordt neergezet (de AI vult een
 * veld in, een concept komt terug na een refresh) geeft geen input-event. Daarom
 * luisteren we ook mee op de value-setter van het tekstvak; React gebruikt die
 * bij elke wijziging van buitenaf.
 *
 * Trekt de gebruiker het vak zelf groter of kleiner aan het handvat, dan blijft
 * die hoogte staan en groeit dat vak niet meer automatisch.
 */

/** Hoeveel keer de beginhoogte het vak hooguit wordt. */
const GROW_FACTOR = 3;
/** En nooit hoger dan dit deel van het venster. */
const MAX_VIEWPORT_SHARE = 0.6;

interface FieldState {
  /** De hoogte zoals de opmaak hem gaf, vóór wij eraan kwamen. */
  base: number;
  /** De hoogte die wij het laatst hebben gezet, om handwerk te herkennen. */
  lastSet: string | null;
  /** De gebruiker heeft zelf aan het handvat getrokken. */
  manual: boolean;
}

const fields = new WeakMap<HTMLTextAreaElement, FieldState>();
const pending = new Set<HTMLTextAreaElement>();
let frame = 0;

function isAutoGrowField(el: EventTarget | null): el is HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement && !el.closest('[data-autogrow="off"]');
}

function resize(el: HTMLTextAreaElement) {
  if (!el.isConnected || !isAutoGrowField(el)) return;
  // Verborgen (dichtgeklapt paneel, andere tab): nu niets te meten. Bij de
  // eerste focus of toetsaanslag komt hij alsnog aan de beurt.
  if (el.offsetHeight === 0) return;

  let state = fields.get(el);
  if (!state) {
    state = { base: el.offsetHeight, lastSet: null, manual: false };
    fields.set(el, state);
  }
  if (state.manual) return;
  if (state.lastSet !== null && el.style.height !== state.lastSet) {
    state.manual = true;
    return;
  }

  const max = Math.max(state.base, Math.min(state.base * GROW_FACTOR, window.innerHeight * MAX_VIEWPORT_SHARE));
  const borders = el.offsetHeight - el.clientHeight;

  // Groeien kan direct: past de tekst niet, dan zegt scrollHeight hoeveel
  // ruimte hij nodig heeft. Krimpen vraagt eerst terug naar de beginhoogte,
  // anders meet scrollHeight de oude, grotere stand. De pagina houdt daarbij
  // zijn scrollpositie, ook als het vak even korter is geweest.
  if (el.scrollHeight <= el.clientHeight && el.offsetHeight > state.base) {
    const scrollY = window.scrollY;
    el.style.height = `${state.base}px`;
    window.scrollTo({ top: scrollY });
  }
  const next = Math.min(max, Math.max(state.base, el.scrollHeight + borders));
  el.style.height = `${next}px`;
  state.lastSet = el.style.height;
}

function schedule(el: HTMLTextAreaElement) {
  pending.add(el);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const batch = [...pending];
    pending.clear();
    batch.forEach(resize);
  });
}

/**
 * Eenmalig aanzetten, vóór React de eerste tekstvakken neerzet: React leest de
 * value-setter op het moment dat het een veld voor het eerst ziet.
 */
export function installAutoGrowTextareas() {
  if (typeof window === 'undefined') return;
  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (!desc?.set || !desc.get) return;
  const nativeSet = desc.set;
  Object.defineProperty(proto, 'value', {
    ...desc,
    set(this: HTMLTextAreaElement, v: string) {
      nativeSet.call(this, v);
      schedule(this);
    },
  });

  document.addEventListener(
    'input',
    (e) => {
      if (isAutoGrowField(e.target)) schedule(e.target);
    },
    true,
  );
  // Een vak dat verborgen stond toen zijn tekst werd ingevuld, krijgt bij de
  // eerste focus alsnog de juiste hoogte.
  document.addEventListener(
    'focusin',
    (e) => {
      if (isAutoGrowField(e.target)) schedule(e.target);
    },
    true,
  );
  // Een vak dat al met tekst verschijnt (concept na een refresh, een dialoog
  // die opengaat) meteen op maat, zonder te wachten op focus.
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLTextAreaElement) schedule(node);
        else if (node instanceof Element) node.querySelectorAll('textarea').forEach(schedule);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
