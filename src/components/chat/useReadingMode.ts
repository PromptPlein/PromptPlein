import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isKeyboardOpen, VIEWPORT_EVENT } from '@/lib/viewportWatch';

/** Alleen op de telefoon, staand en liggend: daar telt elke regel leesruimte. */
const PHONE_QUERY = '(max-width: 39.99rem), (max-height: 31.25rem)';
/** Zo ver moet de vinger omhoog voor kop en tekstvak wegschuiven, in pixels. */
const HIDE_AFTER = 48;
/** Zo ver omlaag brengt ze terug. Kleiner, want terugkrijgen moet makkelijk zijn. */
const SHOW_AFTER = 24;
/** Wat hier de focus krijgt, staat in de leesstand uit beeld en komt dus terug. */
const BARS = '.opl-chat-kop, .opl-chat-titel, .opl-chat-invoer';
/** Zo lang duurt het terugkomen (0.25 s in index.css), met wat marge. */
const REVEAL_MS = 350;

/**
 * Houdt de onderste regel van het gesprek op zijn plek terwijl kop en tekstvak
 * terugkomen. Zonder dit krimpt de lijst aan de onderkant en verdwijnt precies
 * de tekst die iemand aan het lezen was achter het tekstvak. Elk beeld van de
 * animatie, want de lijst krimpt geleidelijk. Een nieuwe aanraking stopt het.
 */
function keepBottomInView(root: HTMLElement | null): void {
  const list = root?.querySelector<HTMLElement>('[data-chat-lijst]');
  if (!list) return;
  const bottom = list.scrollTop + list.clientHeight;
  const end = performance.now() + REVEAL_MS;
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  list.addEventListener('touchstart', stop, { once: true, passive: true });
  const step = () => {
    if (stopped) return;
    list.scrollTop = bottom - list.clientHeight;
    if (performance.now() < end) requestAnimationFrame(step);
    else list.removeEventListener('touchstart', stop);
  };
  requestAnimationFrame(step);
}

/**
 * Leesstand van de chat op de telefoon. Wie het gesprek naar beneden scrolt,
 * krijgt de kop en het tekstvak uit beeld; omhoog scrollen of "Open chat" haalt
 * ze terug, en de tekst die onderaan stond blijft dan in beeld. De stand staat
 * als `data-leesstand` op `<html>`, zodat ook de kop van de app (buiten de
 * chatpagina) meedoet. De animatie staat in `index.css`.
 *
 * De richting komt uit de vinger en het muiswiel, niet uit de scrollpositie. Een
 * antwoord dat de lijst laat meescrollen, of een lijst die bij het inklappen
 * groter wordt, verandert de positie ook. Dan zou de stand heen en weer springen.
 *
 * Er komt nooit vanzelf een toetsenbord bij: terugkomen zet geen focus in het
 * tekstvak. Geeft iemand de focus aan de kop of het tekstvak, met tab of met
 * VoiceOver, dan komen ze terug.
 */
export default function useReadingMode(
  rootRef: RefObject<HTMLElement>,
  enabled: boolean,
  resetKey: unknown,
): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  const set = useCallback(
    (value: boolean) => {
      if (!value && hiddenRef.current) keepBottomInView(rootRef.current);
      hiddenRef.current = value;
      setHidden(value);
    },
    [rootRef],
  );
  const show = useCallback(() => set(false), [set]);

  // Een ander gesprek begint gewoon, met kop en tekstvak in beeld.
  useEffect(() => {
    if (!enabled) set(false);
  }, [enabled, set]);
  useEffect(() => {
    set(false);
  }, [resetKey, set]);

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) root.dataset.leesstand = 'aan';
    else delete root.dataset.leesstand;
  }, [hidden]);
  useEffect(() => () => void delete document.documentElement.dataset.leesstand, []);

  useEffect(() => {
    const card = rootRef.current;
    if (!card || !enabled) return;
    const phone = window.matchMedia(PHONE_QUERY);

    let lastY: number | null = null;
    let travel = 0;

    /** Positief: de inhoud schuift omhoog, de lezer gaat naar beneden. */
    const move = (list: HTMLElement, delta: number) => {
      if (!phone.matches || isKeyboardOpen()) return;
      // Steeds opnieuw tellen als de richting omdraait.
      if (Math.sign(delta) !== Math.sign(travel)) travel = 0;
      travel += delta;
      if (travel > HIDE_AFTER && !hiddenRef.current) {
        const scrollable = list.scrollHeight - list.clientHeight > 1;
        if (scrollable && list.scrollTop > 0) set(true);
        travel = 0;
      } else if (travel < -SHOW_AFTER && hiddenRef.current) {
        set(false);
        travel = 0;
      }
    };

    const listOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('[data-chat-lijst]') : null;

    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches.length === 1 ? e.touches[0].clientY : null;
      travel = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const list = listOf(e.target);
      if (!list || lastY === null || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      move(list, lastY - y);
      lastY = y;
    };
    const onTouchEnd = () => {
      lastY = null;
    };
    const onWheel = (e: WheelEvent) => {
      const list = listOf(e.target);
      if (list) move(list, e.deltaY);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (hiddenRef.current && e.target instanceof Element && e.target.closest(BARS)) set(false);
    };
    // Toetsenbord open of geen telefoon meer: dan hoort alles gewoon in beeld.
    const onViewport = () => {
      if (hiddenRef.current && (isKeyboardOpen() || !phone.matches)) set(false);
    };

    card.addEventListener('touchstart', onTouchStart, { passive: true });
    card.addEventListener('touchmove', onTouchMove, { passive: true });
    card.addEventListener('touchend', onTouchEnd, { passive: true });
    card.addEventListener('touchcancel', onTouchEnd, { passive: true });
    card.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener(VIEWPORT_EVENT, onViewport);
    phone.addEventListener('change', onViewport);
    return () => {
      card.removeEventListener('touchstart', onTouchStart);
      card.removeEventListener('touchmove', onTouchMove);
      card.removeEventListener('touchend', onTouchEnd);
      card.removeEventListener('touchcancel', onTouchEnd);
      card.removeEventListener('wheel', onWheel);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener(VIEWPORT_EVENT, onViewport);
      phone.removeEventListener('change', onViewport);
    };
  }, [rootRef, enabled, set]);

  return [hidden, show];
}
