import CanvasBackground from '@/components/common/CanvasBackground';
import { rijksblauw, nadruk } from '@/config/brandColors';
import {
  drawVignette,
  hexToRgb,
  mixRgb,
  rgbCss,
  seededRandom,
  type CanvasScene,
} from '@/lib/canvasScene';

// De verkaveling van een polder van bovenaf: blokken met smalle percelen, sloten
// ertussen en bredere wegen tussen de blokken. De percelen wisselen langzaam van
// tint, er trekt een wolkenschaduw overheen en af en toe kleurt één perceel rood.

type Strip = { x: number; y: number; w: number; h: number; base: number; phase: number; speed: number };

const LOW = hexToRgb(rijksblauw[700]);
const HIGH = hexToRgb(rijksblauw[400]);
const RED = hexToRgb(nadruk);
/** Seconden per beurt van het rode perceel. */
const RED_CYCLE = 9;

const kavels: CanvasScene<{ strips: Strip[] }> = {
  init(_ctx, W, H, dpr) {
    const random = seededRandom(11);
    const road = 7 * dpr;
    const ditch = 2 * dpr;
    const strips: Strip[] = [];

    for (let x = 0; x < W; ) {
      const colWidth = Math.min((90 + random() * 140) * dpr, W - x);
      for (let y = -road / 2; y < H; ) {
        const blockHeight = (70 + random() * 110) * dpr;
        const horizontal = random() < 0.5;
        const length = horizontal ? blockHeight : colWidth;
        for (let p = 0; p < length; ) {
          const size = Math.min((9 + random() * 16) * dpr, length - p) - ditch;
          const rect = horizontal
            ? { x, y: y + p, w: colWidth, h: size }
            : { x: x + p, y, w: size, h: blockHeight };
          if (rect.w > 1 && rect.h > 1) {
            strips.push({ ...rect, base: random(), phase: random() * Math.PI * 2, speed: 0.15 + random() * 0.35 });
          }
          p += size + ditch;
        }
        y += blockHeight + road;
      }
      x += colWidth + road;
    }
    return { strips };
  },

  draw(ctx, { strips }, t, W, H, dpr) {
    ctx.fillStyle = rijksblauw[900];
    ctx.fillRect(0, 0, W, H);

    const cycle = Math.floor(t / RED_CYCLE);
    const redIndex = Math.floor(seededRandom(cycle + 3)() * strips.length);
    const redAmount = Math.pow(Math.sin(Math.PI * ((t / RED_CYCLE) % 1)), 3) * 0.85;

    strips.forEach((s, i) => {
      const level = Math.min(1, Math.max(0, 0.2 + 0.35 * s.base + 0.18 * Math.sin(t * s.speed + s.phase)));
      let color = mixRgb(LOW, HIGH, level);
      if (i === redIndex) color = mixRgb(color, RED, redAmount);
      ctx.fillStyle = rgbCss(color);
      ctx.fillRect(s.x, s.y, s.w, s.h);
    });

    // Wolkenschaduw die van links naar rechts over het land trekt.
    const radius = Math.max(W, H) * 0.38;
    const cx = ((t * 16 * dpr) % (W + 2 * radius)) - radius;
    const cy = H * (0.4 + 0.15 * Math.sin(t * 0.07));
    const shadow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    shadow.addColorStop(0, 'rgba(1, 29, 46, 0.42)');
    shadow.addColorStop(1, 'rgba(1, 29, 46, 0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, W, H);

    drawVignette(ctx, W, H, 0.78);
  },
};

export default function KavelsBackground({ className = '' }: { className?: string }) {
  return <CanvasBackground scene={kavels} className={className} />;
}
