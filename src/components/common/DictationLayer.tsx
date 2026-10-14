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

/**
 * Eén microfoontje voor alle tekstvakken in de app, rechtsonder in het vak waar
 * je in staat of met de muis boven hangt. Zo krijgt elk invulveld dicteren
 * zonder dat elk formulier het zelf hoeft in te bouwen, ook velden die later
 * bijkomen.
 *
 * De knop ligt in een portal met vaste positie en loopt elk frame mee met het
 * vak (scrollen, meegroeien, een modal die verschuift). Tijdens het opnemen
 * blijft hij aan dát vak vast zitten, ook als de focus ergens anders heen gaat,
 * en licht het vak rood op. De uitgeschreven tekst komt op de plek van de
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
      // Een eigen schuifbalk in het vak niet afdekken.
      const scrollbar = Math.max(0, target.offsetWidth - target.clientWidth - 2);
      // Een laag vak met een knop rechtsboven (het sterretje): dan schuift de
      // microfoon ernaast in plaats van eronder.
      const dodge = target.dataset.dictationAvoid === 'top-right' && rect.height < 80 ? 36 : 0;
      const next: Placement = {
        field: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        right: window.innerWidth - rect.right + 12 + scrollbar + dodge,
        bottom: window.innerHeight - Math.min(rect.bottom, window.innerHeight) + 8,
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
          className="pointer-events-none fixed z-[60] rounded-lg ring-2 ring-red-500 motion-safe:animate-pulse"
          style={placement.field}
        />
      )}
      <DictationButton
        state={state}
        seconds={dictation.seconds}
        onToggle={onToggle}
        className="fixed z-[60]"
        style={{ right: placement.right, bottom: placement.bottom }}
      />
    </div>,
    document.body,
  );
}
