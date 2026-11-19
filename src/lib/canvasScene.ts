// Gedeelde stukken voor de achtergronden in Canvas 2D (CanvasBackground).

/** Een tekening die zich bij elke maat opnieuw opbouwt en per frame tekent. */
export interface CanvasScene<S> {
  /** Bouwt de toestand op voor deze maat, in apparaatpixels. */
  init(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number): S;
  /** Tekent één frame; `seconds` staat stil als beweging uit staat. */
  draw(ctx: CanvasRenderingContext2D, state: S, seconds: number, width: number, height: number, dpr: number): void;
}

/** Voorspelbare toevalsgenerator (mulberry32): elke keer dezelfde tekening. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbCss([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/** Donker midden, zodat de kop en het paneel goed leesbaar blijven. */
export function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number) {
  const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.55);
  g.addColorStop(0, `rgba(1, 29, 46, ${strength})`);
  g.addColorStop(0.55, `rgba(1, 29, 46, ${strength * 0.62})`);
  g.addColorStop(1, 'rgba(1, 29, 46, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}
