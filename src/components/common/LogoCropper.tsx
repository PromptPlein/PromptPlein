import { useCallback, useEffect, useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';

/** A design-system color token, read at runtime for drawing on the canvas. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
  const sliderRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value?: number }>>(sliderRef, 'input', (e) => {
    const v = Number(e.detail?.value);
    if (Number.isFinite(v)) setScaleFromSlider(v);
  });
  useNlddEvent<CustomEvent<{ value?: string }>>(bgRef, 'change', (e) => {
    if (e.detail?.value === 'transparent' || e.detail?.value === 'white') setBg(e.detail.value);
  });
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
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, FRAME, FRAME);
    } else {
      // A checkerboard behind the transparent parts, on the preview only.
      const light = token('--primitives-color-neutral-0') || 'white';
      const dark = token('--primitives-color-neutral-150') || 'silver';
      for (let y = 0; y < FRAME; y += 8) {
        for (let x = 0; x < FRAME; x += 8) {
          ctx.fillStyle = (x + y) % 16 === 0 ? light : dark;
          ctx.fillRect(x, y, 8, 8);
        }
      }
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
  // A native listener, because React's wheel listener is passive and cannot
  // stop the page from scrolling along.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Dragging on a touch screen must move the logo, not the page. The design
    // system (0.18.0) has no attribute for this on a canvas.
    canvas.style.touchAction = 'none';
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTf((t) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const scale = Math.min(MAX_SCALE * baseScale, Math.max(MIN_SCALE * baseScale, t.scale * factor));
        const k = scale / t.scale;
        // Zoom rond het kadermidden → schaal de offset mee.
        return { scale, x: t.x * k, y: t.y * k };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [baseScale]);

  const setScaleFromSlider = (pct: number) => {
    // pct 0..100 → schaal tussen baseScale en MAX_SCALE*baseScale (log-achtig lineair).
    const scale = baseScale * (1 + (pct / 100) * (MAX_SCALE - 1));
    setTf((t) => {
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
      ctx.fillStyle = 'white';
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
    <nldd-container gap="16">
      <nldd-text size="sm" color="secondary">
        Sleep om te verschuiven, scroll of gebruik de schuif om te zoomen. Wat binnen het kader staat,
        wordt opgeslagen.
      </nldd-text>

      <nldd-container gap="16" horizontal-alignment="center">
        <canvas
          ref={canvasRef}
          width={FRAME}
          height={FRAME}
          aria-label="Uitsnede van het logo"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        <nldd-container layout="row" gap="8" vertical-alignment="center" max-width="20rem">
          <nldd-slider
            ref={sliderRef}
            min={0}
            max={100}
            value={String(Math.max(0, Math.min(100, sliderPct)))}
            start-icon="minus"
            end-icon="plus"
            tooltip-timing="never"
            accessible-label="Zoomen"
          ></nldd-slider>
          <nldd-icon-button
            icon="undo"
            appearance="neutral-transparent"
            size="sm"
            accessible-label="Herstellen"
            onClick={reset}
          ></nldd-icon-button>
        </nldd-container>

        <nldd-segmented-control ref={bgRef} size="sm" value={bg} accessible-label="Achtergrond">
          <nldd-segmented-control-item value="transparent" text="Transparant"></nldd-segmented-control-item>
          <nldd-segmented-control-item value="white" text="Wit"></nldd-segmented-control-item>
        </nldd-segmented-control>
      </nldd-container>

      <nldd-button-group>
        <nldd-button appearance="secondary" text="Annuleren" onClick={onCancel}></nldd-button>
        <nldd-button
          appearance="primary"
          text="Gebruik dit logo"
          disabled={!ready || undefined}
          onClick={confirm}
        ></nldd-button>
      </nldd-button-group>
    </nldd-container>
  );
}
