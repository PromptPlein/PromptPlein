import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from '@/components/common/icons';

/**
 * Vierkante logo-crop/zoom-editor.
 *
 * De gebruiker sleept en zoomt de afbeelding binnen een vast vierkant kader.
 * Wat in het kader zichtbaar is, is exact wat wordt opgeslagen ("what you see
 * is what you get"): bij bevestigen wordt dat deel naar een vierkant
 * uitvoer-canvas (OUTPUT×OUTPUT) gerenderd en als geoptimaliseerde blob
 * teruggegeven.
 */

const FRAME = 256; // weergavegrootte van het kader (px)
const OUTPUT = 256; // uitvoerresolutie (px, vierkant)
const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

interface LogoCropperProps {
  /** Bronafbeelding (object-URL of data-URL). */
  src: string;
  /** Geroepen met het geoptimaliseerde vierkante beeld bij bevestigen. */
  onConfirm: (blob: Blob, previewUrl: string) => void;
  onCancel: () => void;
  /** Achtergrond achter transparante delen van het logo. */
  background?: 'transparent' | 'white';
}

interface Transform {
  scale: number;
  /** Positie van het midden van de afbeelding t.o.v. het midden van het kader. */
  x: number;
  y: number;
}

export default function LogoCropper({ src, onConfirm, onCancel, background = 'transparent' }: LogoCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [bg, setBg] = useState<'transparent' | 'white'>(background);
  const [tf, setTf] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [baseScale, setBaseScale] = useState(1);
  const drag = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>({
    active: false,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
  });

  // Laad de afbeelding en bepaal de "cover"-startschaal (kader netjes gevuld).
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const cover = Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight);
      setBaseScale(cover);
      setTf({ scale: cover, x: 0, y: 0 });
      setReady(true);
    };
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);

  // Teken het preview-canvas op basis van de huidige transform.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, FRAME, FRAME);
    if (bg === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, FRAME, FRAME);
    }
    const w = img.naturalWidth * tf.scale;
    const h = img.naturalHeight * tf.scale;
    const dx = FRAME / 2 + tf.x - w / 2;
    const dy = FRAME / 2 + tf.y - h / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, w, h);
  }, [tf, bg]);

  useEffect(() => {
    if (ready) draw();
  }, [ready, draw]);

  // --- Slepen ---
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: tf.x, oy: tf.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    setTf((t) => ({
      ...t,
      x: drag.current.ox + (e.clientX - drag.current.sx),
      y: drag.current.oy + (e.clientY - drag.current.sy),
    }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* al vrijgegeven */
    }
  };

  // --- Zoomen (scroll rond het kadermidden) ---
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setTf((t) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(MAX_SCALE * baseScale, Math.max(MIN_SCALE * baseScale, t.scale * factor));
      const k = scale / t.scale;
      // Zoom rond het kadermidden → schaal de offset mee.
      return { scale, x: t.x * k, y: t.y * k };
    });
  };

  const setScaleFromSlider = (pct: number) => {
    // pct 0..100 → schaal tussen baseScale en MAX_SCALE*baseScale (log-achtig lineair).
    const scale = baseScale * (1 + (pct / 100) * (MAX_SCALE - 1));
    setTf((t) => {
      const k = scale / t.scale;
      return { scale, x: t.x * k, y: t.y * k };
    });
  };

  // Stapsgewijs in-/uitzoomen via de knoppen, rond het kadermidden.
  const zoomStep = (factor: number) => {
    setTf((t) => {
      const scale = Math.min(MAX_SCALE * baseScale, Math.max(MIN_SCALE * baseScale, t.scale * factor));
      const k = scale / t.scale;
      return { scale, x: t.x * k, y: t.y * k };
    });
  };

  const reset = () => setTf({ scale: baseScale, x: 0, y: 0 });

  // Render het zichtbare deel naar een vierkant uitvoer-canvas → blob.
  const confirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    if (bg === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    }
    // Schaalfactor van kader-px → uitvoer-px.
    const ratio = OUTPUT / FRAME;
    const w = img.naturalWidth * tf.scale * ratio;
    const h = img.naturalHeight * tf.scale * ratio;
    const dx = OUTPUT / 2 + tf.x * ratio - w / 2;
    const dy = OUTPUT / 2 + tf.y * ratio - h / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, w, h);

    const type = bg === 'transparent' ? 'image/png' : 'image/webp';
    out.toBlob(
      (blob) => {
        if (!blob) return;
        onConfirm(blob, out.toDataURL(type, 0.92));
      },
      type,
      0.92,
    );
  };

  const sliderPct = Math.round(((tf.scale / baseScale - 1) / (MAX_SCALE - 1)) * 100);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Sleep om te verschuiven, scroll of gebruik de schuif om te zoomen. Wat binnen het kader staat,
        wordt opgeslagen.
      </p>

      <div className="flex flex-col items-center gap-4">
        {/* Kader met checkerboard-achtergrond voor transparantie. */}
        <div
          className="relative overflow-hidden rounded-xl border border-slate-300 dark:border-slate-600"
          style={{
            width: FRAME,
            height: FRAME,
            backgroundColor: bg === 'white' ? '#ffffff' : undefined,
            backgroundImage:
              bg === 'transparent'
                ? 'linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)'
                : undefined,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
            cursor: drag.current.active ? 'grabbing' : 'grab',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          <canvas
            ref={canvasRef}
            width={FRAME}
            height={FRAME}
            className="touch-none select-none"
            style={{ width: FRAME, height: FRAME }}
          />
          {/* Subtiel cirkelmasker als hint voor een typisch logo-badge. */}
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-rijksblauw-500/40" />
        </div>

        {/* Zoomregeling */}
        <div className="flex w-full max-w-xs items-center gap-3">
          <button
            type="button"
            onClick={() => zoomStep(0.8)}
            className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Uitzoomen"
            title="Uitzoomen"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.max(0, Math.min(100, sliderPct))}
            onChange={(e) => setScaleFromSlider(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-rijksblauw-500 dark:bg-slate-700"
            aria-label="Zoomen"
          />
          <button
            type="button"
            onClick={() => zoomStep(1.25)}
            className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Inzoomen"
            title="Inzoomen"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Herstellen"
            title="Herstellen"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Achtergrondkeuze (handig voor logo's met transparantie). */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Achtergrond:</span>
          {(['transparent', 'white'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setBg(opt)}
              className={
                'rounded-full border px-3 py-1 font-medium transition-colors ' +
                (bg === opt
                  ? 'border-rijksblauw-500 bg-rijksblauw-500 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300')
              }
            >
              {opt === 'transparent' ? 'Transparant' : 'Wit'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" className="opl-btn-secondary" onClick={onCancel}>
          Annuleren
        </button>
        <button type="button" className="opl-btn-primary" onClick={confirm} disabled={!ready}>
          Logo gebruiken
        </button>
      </div>
    </div>
  );
}
