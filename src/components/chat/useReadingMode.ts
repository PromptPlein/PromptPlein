import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isKeyboardOpen, VIEWPORT_EVENT } from '@/lib/viewportWatch';

/** Alleen op de telefoon, staand en liggend: daar telt elke regel leesruimte. */
const PHONE_QUERY = '(max-width: 39.99rem), (max-height: 31.25rem)';
/** Zo ver moet de vinger omhoog voor de bovenkant wegschuift, in pixels. */
const HIDE_AFTER = 48;
/** Zo ver omlaag brengt hem terug. Kleiner, want terugkrijgen moet makkelijk zijn. */
const SHOW_AFTER = 24;
/** Wat hier de focus krijgt, staat in de leesstand uit beeld en komt dus terug. */
const TOP = '.opl-chat-kop, .opl-chat-titel';

/**
 * Leesstand van de chat op de telefoon. Wie het gesprek naar beneden scrolt,
 * krijgt de kop van de app en de titelbalk uit beeld; omhoog scrollen haalt ze
 * terug. Het tekstvak blijft altijd staan: de chat zelf verdwijnt nooit. De
 * stand staat als `data-leesstand` op `<html>`, zodat ook de kop van de app
 * (buiten de chatpagina) meedoet. De animatie staat in `index.css`.
 *
 * Het gesprek schuift mee in de richting van de vinger: bij wegschuiven gaat de
 * tekst omhoog, bij terugkomen omlaag. Daarom hoeft de scrollpositie niet
 * gecorrigeerd te worden, en dat zou op iOS het uitrollen van een veeg stoppen.
 *
 * De richting komt uit de vinger en het muiswiel, niet uit de scrollpositie. Een
 * antwoord dat de lijst laat meescrollen, of een lijst die bij het inklappen
 * groter wordt, verandert de positie ook. Dan zou de stand heen en weer springen.
 *
 * Geeft iemand de focus aan de kop of de titelbalk, met tab of met VoiceOver,
 * dan komen ze terug.
 */
export default function useReadingMode(
  rootRef: RefObject<HTMLElement>,
  enabled: boolean,
  resetKey: unknown,
): void {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  const set = useCallback((value: boolean) => {
    hiddenRef.current = value;
    setHidden(value);
  }, []);

  // Een ander gesprek begint gewoon, met de bovenkant in beeld.
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
      if (hiddenRef.current && e.target instanceof Element && e.target.closest(TOP)) set(false);
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
}
