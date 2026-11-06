import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import DictationButton from './DictationButton';
import { insertDictatedText, useDictation } from '@/lib/useDictation';

/**
 * Mag dit tekstvak een microfoontje krijgen? Een veld met een eigen knop (de
 * chat) zet `data-dictation="off"` op zichzelf of een ouder.
 */
function isDictationField(el: EventTarget | null): el is HTMLTextAreaElement {
  return (
    el instanceof HTMLTextAreaElement &&
    !el.disabled &&
    !el.readOnly &&
    !el.closest('[data-dictation="off"]')
  );
}

interface Placement {
  /** Het tekstvak zelf, voor de rode rand tijdens het opnemen. */
  field: { top: number; left: number; width: number; height: number };
  /** Rechteronderhoek van de knop. */
  right: number;
  bottom: number;
}

/** De knop in rust is 28 pixels hoog; vanaf deze hoogte gaat hij onderaan staan. */
const TALL_FIELD = 72;
/** Ruimte voor de greep waarmee je het vak groter trekt, rechtsonder in de hoek. */
const RESIZE_GRIP = 20;

/**
 * Eén microfoontje voor alle tekstvakken in de app, rechts in het vak waar je in
 * staat of met de muis boven hangt. Zo krijgt elk invulveld dicteren zonder dat
 * elk formulier het zelf hoeft in te bouwen, ook velden die later bijkomen.
 *
 * De knop staat in een eigen kolom rechts (zie de regel voor
 * `html[data-dictation='on']` in index.css). Ruimte aan de zijkant scrolt niet
 * mee, ruimte onderaan wel: daar schoof de tekst tijdens het scrollen alsnog
 * onder de knop door. De brede opnamebalk past niet in die kolom en staat daarom
 * boven het vak.
 *
 * De knop ligt in een portal met vaste positie en loopt elk frame mee met het
 * vak (scrollen, meegroeien, een modal die verschuift). Tijdens het opnemen
 * blijft hij aan dát vak vast zitten, ook als de focus ergens anders heen gaat,
 * en krijgt het vak een blauwe rand. De uitgeschreven tekst komt op de plek van de
 * cursor.
 */
export default function DictationLayer() {
  const [focused, setFocused] = useState<HTMLTextAreaElement | null>(null);
  const [hovered, setHovered] = useState<HTMLTextAreaElement | null>(null);
  const [locked, setLocked] = useState<HTMLTextAreaElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const lockedRef = useRef<HTMLTextAreaElement | null>(null);
  lockedRef.current = locked;

  const dictation = useDictation((text) => {
    const field = lockedRef.current;
    setLocked(null);
    if (field?.isConnected) {
      insertDictatedText(field, text);
    } else {
      // Het veld is intussen verdwenen (dialoog dicht, andere pagina): de tekst
      // gaat niet verloren maar naar het klembord.
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      toast('Het veld is er niet meer. De tekst staat op je klembord.');
    }
  });
  const { available, state, cancel } = dictation;
  const stateRef = useRef(state);
  stateRef.current = state;

  // Klaar of afgebroken: het vak loslaten.
  useEffect(() => {
    if (state === 'idle') setLocked(null);
  }, [state]);

  // Welk vak heeft focus, en boven welk vak hangt de muis?
  useEffect(() => {
    if (!available) return;
    function onFocusIn(e: FocusEvent) {
      setFocused(isDictationField(e.target) ? e.target : null);
    }
    function onFocusOut(e: FocusEvent) {
      if (!isDictationField(e.relatedTarget)) setFocused(null);
    }
    function onPointerOver(e: PointerEvent) {
      if (layerRef.current?.contains(e.target as Node)) return;
      setHovered(isDictationField(e.target) ? e.target : null);
    }
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerover', onPointerOver);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerover', onPointerOver);
    };
  }, [available]);

  // Zet de kolom voor de knop aan in alle tekstvakken, ook als ze nog niet
  // aangeraakt zijn: anders loopt de tekst opnieuw af zodra de muis erboven komt.
  useEffect(() => {
    if (!available) return;
    document.documentElement.dataset.dictation = 'on';
    return () => {
      delete document.documentElement.dataset.dictation;
    };
  }, [available]);

  const target = locked ?? focused ?? hovered;

  // Elk frame meelopen met het vak. Goedkoop (één getBoundingClientRect) en het
  // vangt alles: scrollen in een container, meegroeiende vakken, animaties.
  useEffect(() => {
    if (!target) {
      setPlacement(null);
      return;
    }
    let frame = 0;
    let last = '';
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!target.isConnected) {
        setPlacement(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const visible =
        rect.width > 0 && rect.bottom > 24 && rect.top < window.innerHeight && rect.height >= 32;
      if (!visible) {
        if (last !== 'hidden') setPlacement(null);
        last = 'hidden';
        return;
      }
      const fieldBottom = window.innerHeight - Math.min(rect.bottom, window.innerHeight);
      const inset =
        rect.height >= TALL_FIELD ? RESIZE_GRIP : Math.max(2, (rect.height - 28) / 2);
      const panelFits = rect.top >= 44;
      const next: Placement = {
        field: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        // offsetWidth min clientWidth is de rand plus een eventuele schuifbalk.
        right:
          document.documentElement.clientWidth -
          rect.right +
          (target.offsetWidth - target.clientWidth) +
          6,
        bottom:
          stateRef.current !== 'idle' && panelFits
            ? window.innerHeight - rect.top + 4
            : fieldBottom + inset,
      };
      const key = `${next.field.top}|${next.field.left}|${next.field.width}|${next.field.height}|${next.right}|${next.bottom}`;
      if (key !== last) {
        last = key;
        setPlacement(next);
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // Esc tijdens het opnemen: afbreken zonder uitschrijven.
  useEffect(() => {
    if (state !== 'recording') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [state, cancel]);

  if (!available || !target || !placement) return null;

  function onToggle() {
    if (state !== 'idle' || !target) {
      dictation.toggle();
      return;
    }
    const field = target;
    setLocked(field);
    void dictation.start().then((started) => {
      if (!started) setLocked(null);
    });
  }

  return createPortal(
    <div ref={layerRef}>
      {state === 'recording' && (
        <div
          className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-rijksblauw-400/50 dark:ring-rijksblauw-300/50"
          style={placement.field}
        />
      )}
      <DictationButton
        state={state}
        seconds={dictation.seconds}
        stream={dictation.stream}
        onToggle={onToggle}
        className="fixed z-[60]"
        style={{ right: placement.right, bottom: placement.bottom }}
      />
    </div>,
    document.body,
  );
}
