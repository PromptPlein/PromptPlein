import { useEffect, useRef } from 'react';
import { rijksblauw } from '@/config/brandColors';

// Paginaachtergrond met regels uit promptsjablonen die traag voorbijschuiven. De
// invulvelden ({doelgroep}) staan in oranje. Canvas 2D, dus zonder three.js.
// Decoratief: pointer-events staat uit en de canvas is verborgen voor schermlezers.

const FRAGMENTS = [
  'Je bent een {rol} bij het ministerie van {ministerie}.',
  'Schrijf een beleidsnotitie van één pagina voor {doelgroep}.',
  'Vat de onderstaande Kamerbrief samen in vijf punten.',
  'Gebruik taalniveau B1 en vermijd ambtelijk jargon.',
  'Stel eerst drie verhelderende vragen voordat je antwoordt.',
  'Toets de tekst aan de Algemene wet bestuursrecht.',
  'Geef bij elk argument een bron uit {bronnen}.',
  'Denk stap voor stap na en controleer je eigen conclusie.',
  'Herschrijf dit persbericht voor {kanaal}.',
  'Maak een tabel met voor- en nadelen per {optie}.',
  'Antwoord in de toon van {afzender}.',
  "Formuleer drie scenario's voor {beleidsterrein}.",
];

// Vaste afstand tussen de regels: de achtergrond vult het hele venster, dus het
// aantal regels hangt af van de hoogte.
const ROW_PX = 40;
const FONT_PX = 13;
const FONT_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const TEXT_COLOR = 'rgba(153, 199, 221, 0.24)';
const VARIABLE_COLOR = 'rgba(225, 112, 0, 0.62)';
const VIGNETTE_RGB = '1, 29, 46';

type Segment = { text: string; isVariable: boolean; width: number };
type Row = { segments: Segment[]; width: number; speed: number };

function buildRows(ctx: CanvasRenderingContext2D, dpr: number, count: number): Row[] {
  ctx.font = `${FONT_PX * dpr}px ${FONT_FAMILY}`;
  const rows: Row[] = [];
  for (let r = 0; r < count; r++) {
    // Elke rij krijgt een andere volgorde, zodat de regels niet onder elkaar herhalen.
    const order = FRAGMENTS.map((_, i) => FRAGMENTS[(i * 5 + r * 3) % FRAGMENTS.length]);
    const segments: Segment[] = [];
    for (const fragment of order) {
      for (const part of fragment.split(/(\{[^}]+\})/)) {
        if (part) segments.push({ text: part, isVariable: part.startsWith('{'), width: 0 });
      }
      segments.push({ text: '     ', isVariable: false, width: 0 });
    }
    let width = 0;
    for (const s of segments) {
      s.width = ctx.measureText(s.text).width;
      width += s.width;
    }
    // Pixels per seconde; even rijen naar rechts, oneven naar links.
    const speed = (8 + ((r * 7) % 9)) * (r % 2 ? -1 : 1) * dpr;
    rows.push({ segments, width, speed });
  }
  return rows;
}

function draw(ctx: CanvasRenderingContext2D, rows: Row[], dpr: number, seconds: number) {
  const { width: W, height: H } = ctx.canvas;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, rijksblauw[900]);
  bg.addColorStop(1, rijksblauw[800]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = `${FONT_PX * dpr}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  const rowHeight = H / rows.length;
  rows.forEach((row, i) => {
    const y = rowHeight * (i + 0.5);
    let x = -((((seconds * row.speed) % row.width) + row.width) % row.width);
    while (x < W) {
      for (const s of row.segments) {
        if (x + s.width > 0 && x < W) {
          ctx.fillStyle = s.isVariable ? VARIABLE_COLOR : TEXT_COLOR;
          ctx.fillText(s.text, x, y);
        }
        x += s.width;
      }
    }
  });

  // Donker midden, zodat de kop en de knoppen goed leesbaar blijven.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
  vignette.addColorStop(0, `rgba(${VIGNETTE_RGB}, 0.88)`);
  vignette.addColorStop(0.55, `rgba(${VIGNETTE_RGB}, 0.55)`);
  vignette.addColorStop(1, `rgba(${VIGNETTE_RGB}, 0)`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

export default function PromptLinesBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let rows: Row[] = [];
    const now = () => (reduceMotion ? 12 : performance.now() / 1000);
    let visible = true;
    let frame = 0;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const count = Math.max(1, Math.ceil(rect.height / ROW_PX));
      if (count !== rows.length) rows = buildRows(ctx, dpr, count);
      draw(ctx, rows, dpr, now());
    };
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersectionObserver.observe(canvas);

    if (!reduceMotion) {
      const loop = () => {
        if (visible && rows.length > 0) draw(ctx, rows, dpr, now());
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
