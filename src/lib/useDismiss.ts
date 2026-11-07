import { useEffect, type RefObject } from 'react';

/**
 * Sluit een uitklapmenu bij een aanraking ernaast en bij Escape. Pointerdown en
 * geen mousedown: op een aanraakscherm komt mousedown pas na het loslaten.
 * Escape zet de focus terug op de knop van het menu.
 */
export default function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      close();
      ref.current?.querySelector('button')?.focus();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}
