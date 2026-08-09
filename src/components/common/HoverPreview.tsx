import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Toont bij hover (of toetsenbordfocus) de volledige tekst achter een compact
 * kaartje — de voorbeeldprompt of doelomschrijving die er zelf niet op past.
 *
 * Waarom niet gewoon `title="…"`: dat is de tooltip van het besturingssysteem.
 * Die verschijnt pas na een seconde, in een blokkerig grijs vlak met een eigen
 * lettertype, en trekt zich niets aan van de donkere modus. Dit paneeltje volgt
 * de vormgeving van de app en verschijnt meteen.
 *
 * Het paneel hangt via een portal aan `document.body` en positioneert zichzelf
 * met `fixed`: de lijsten waarin deze kaartjes staan schuiven (overflow-y-auto),
 * en binnen die lijst zou een absoluut geplaatst paneel worden afgeknipt.
 */
export default function HoverPreview({
  label,
  text,
  children,
  className,
}: {
  /** Kopje boven de tekst, bijv. "Voorbeeldprompt". */
  label: string;
  /** De volledige tekst; regeleindes blijven behouden. */
  text: string;
  children: ReactNode;
  className?: string;
}) {
  // De plek van het kaartje op het scherm; null = niets tonen.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Eerst renderen (onzichtbaar) om de hoogte te kunnen meten, dan pas plaatsen:
  // boven het kaartje als daar ruimte is, anders eronder, en altijd binnen het
  // venster. Zonder die meting weet je de hoogte niet — die hangt van de tekst af.
  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) {
      setPos(null);
      return;
    }
    const tip = tipRef.current.getBoundingClientRect();
    const margin = 8;
    const above = anchor.top - tip.height - margin;
    const top =
      above >= margin
        ? above
        : Math.max(margin, Math.min(anchor.bottom + margin, window.innerHeight - tip.height - margin));
    const left = Math.max(
      margin,
      Math.min(anchor.left, window.innerWidth - tip.width - margin),
    );
    setPos({ top, left });
  }, [anchor]);

  function show(el: HTMLElement) {
    setAnchor(el.getBoundingClientRect());
  }

  return (
    <div
      className={className}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
      // Ook voor wie met tab door de knoppen loopt: dezelfde uitleg, zonder muis.
      onFocusCapture={(e) => show(e.currentTarget)}
      onBlurCapture={() => setAnchor(null)}
    >
      {children}
      {anchor &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            // pointer-events-none: het paneel mag de muis nooit onderscheppen,
            // anders knippert het zodra je eroverheen beweegt.
            className="pointer-events-none fixed z-50 w-[min(26rem,calc(100vw-1rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-slate-900/5 transition-opacity duration-150 dark:border-slate-600 dark:bg-slate-800 dark:ring-black/30"
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              // Tot de meting klaar is nog onzichtbaar: anders zie je hem eerst
              // linksboven staan en dan wegspringen naar zijn plek.
              opacity: pos ? 1 : 0,
            }}
          >
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-rijksblauw-600 dark:text-rijksblauw-300">
              {label}
            </p>
            <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {text}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
