import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

/**
 * Het infobolletje: een kleine ronde knop met een "i" die één korte uitleg
 * toont. Hiermee blijft een scherm rustig: de uitleg staat er niet als lopende
 * tekst, maar is er wel voor wie hem zoekt.
 *
 * De uitleg verschijnt bij aanwijzen en bij toetsenbordfocus. Een klik zet hem
 * vast, zodat hij ook op een aanraakscherm werkt; nog een klik, Escape of een
 * klik ernaast sluit hem weer.
 *
 * Het paneel hangt via een portal aan `document.body` en staat `fixed`, net als
 * HoverPreview: zo knipt een kaart met `overflow-hidden` hem niet af.
 */
export default function InfoDot({
  label,
  text,
  className,
}: {
  /** Wat de knop uitlegt, voor schermlezers. Bijv. "Uitleg over categorieën". */
  label: string;
  /** De uitleg zelf: kort, hooguit twee zinnen. Regeleindes blijven staan. */
  text: string;
  className?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Eerst onzichtbaar renderen om de maat te kennen, dan plaatsen: onder het
  // bolletje als daar ruimte is, anders erboven, en altijd binnen het venster.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !tipRef.current) {
      setPos(null);
      return;
    }
    const anchor = buttonRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const margin = 8;
    const below = anchor.bottom + 4;
    const top =
      below + tip.height + margin <= window.innerHeight
        ? below
        : Math.max(margin, anchor.top - tip.height - 4);
    const centered = anchor.left + anchor.width / 2 - tip.width / 2;
    const left = Math.max(margin, Math.min(centered, window.innerWidth - tip.width - margin));
    setPos({ top, left });
  }, [open, text]);

  // Een vastgezette uitleg sluit bij Escape, een klik ernaast of schuiven: de
  // plek is berekend voor dit moment en klopt na schuiven niet meer.
  useEffect(() => {
    if (!open) return;
    function close() {
      setPinned(false);
      setHover(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onPointer(e: PointerEvent) {
      if (buttonRef.current?.contains(e.target as Node)) return;
      setPinned(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          // Het bolletje staat ook op klikbare kaarten: de klik is voor de
          // uitleg en mag de kaart eronder niet openen.
          e.preventDefault();
          e.stopPropagation();
          setPinned((v) => !v);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={clsx(
          'group/info inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus:outline-none',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[13px] font-bold leading-none transition-colors',
            'group-focus-visible/info:ring-2 group-focus-visible/info:ring-rijksblauw-500 group-focus-visible/info:ring-offset-2 dark:group-focus-visible/info:ring-offset-slate-900',
            open
              ? 'border-rijksblauw-700 bg-rijksblauw-700 text-white dark:border-rijksblauw-200 dark:bg-rijksblauw-200 dark:text-slate-900'
              : 'border-rijksblauw-500 text-rijksblauw-500 group-hover/info:border-rijksblauw-700 group-hover/info:text-rijksblauw-700 dark:border-rijksblauw-200 dark:text-rijksblauw-200',
          )}
        >
          i
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            // pointer-events-none: het paneel mag de muis nooit onderscheppen,
            // anders knippert het zodra je eroverheen beweegt.
            className="pointer-events-none fixed z-50 w-max max-w-[min(18rem,calc(100vw-1rem))] whitespace-pre-line rounded bg-rijksblauw-700 px-3 py-2 text-sm font-normal leading-snug text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? 1 : 0 }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
