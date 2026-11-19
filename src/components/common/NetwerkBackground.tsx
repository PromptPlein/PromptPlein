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

// Punten voor afdelingen, met grotere voor ministeries, die traag drijven. Wie
// dicht bij elkaar ligt, krijgt een lijn. Over de lijnen reist af en toe een rood
// puntje, een prompt die gedeeld wordt; het punt waar hij aankomt licht kort rood op.

type Node = { x: number; y: number; vx: number; vy: number; big: boolean; flash: number };
type Pulse = { from: number; to: number; start: number };
type State = { nodes: Node[]; pulses: Pulse[]; nextPulse: number; lastT: number | null; random: () => number };

const NODE = hexToRgb(rijksblauw[100]);
const RED = hexToRgb(nadruk);
/** Lijnen tot deze afstand, in CSS-pixels. */
const LINK_PX = 120;
/** Seconden die een puls over een lijn doet. */
const PULSE_SECONDS = 1.6;

const netwerk: CanvasScene<State> = {
  init(_ctx, W, H, dpr) {
    const random = seededRandom(5);
    // Even dicht op elk scherm: één punt per 5200 vierkante pixels, tot 260.
    const count = Math.max(18, Math.min(260, Math.round((W * H) / (dpr * dpr) / 5200)));
    const nodes = Array.from({ length: count }, () => {
      const angle = random() * Math.PI * 2;
      const speed = (4 + random() * 7) * dpr;
      return {
        x: random() * W,
        y: random() * H,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        big: random() < 0.12,
        flash: -10,
      };
    });
    return { nodes, pulses: [], nextPulse: 0, lastT: null, random };
  },

  draw(ctx, state, t, W, H, dpr) {
    const dt = state.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - state.lastT));
    state.lastT = t;
    const linkDistance = LINK_PX * dpr;

    ctx.fillStyle = rijksblauw[900];
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, Math.max(W, H));
    glow.addColorStop(0, 'rgba(21, 66, 115, 0.9)');
    glow.addColorStop(1, 'rgba(21, 66, 115, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    for (const n of state.nodes) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
      if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
    }

    const edges: [number, number][] = [];
    ctx.lineWidth = dpr;
    for (let i = 0; i < state.nodes.length; i++) {
      for (let j = i + 1; j < state.nodes.length; j++) {
        const a = state.nodes[i];
        const b = state.nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d >= linkDistance) continue;
        edges.push([i, j]);
        ctx.strokeStyle = `rgba(140, 187, 210, ${(1 - d / linkDistance) * 0.32})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    if (t >= state.nextPulse && edges.length > 0) {
      const [i, j] = edges[Math.floor(state.random() * edges.length)];
      state.pulses.push(state.random() < 0.5 ? { from: i, to: j, start: t } : { from: j, to: i, start: t });
      state.nextPulse = t + 0.45 + state.random() * 0.6;
    }

    state.pulses = state.pulses.filter((pulse) => {
      const p = (t - pulse.start) / PULSE_SECONDS;
      const a = state.nodes[pulse.from];
      const b = state.nodes[pulse.to];
      if (p >= 1) {
        b.flash = t;
        return false;
      }
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const x = a.x + (b.x - a.x) * eased;
      const y = a.y + (b.y - a.y) * eased;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 9 * dpr);
      halo.addColorStop(0, 'rgba(213, 43, 30, 0.55)');
      halo.addColorStop(1, 'rgba(213, 43, 30, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - 9 * dpr, y - 9 * dpr, 18 * dpr, 18 * dpr);
      ctx.fillStyle = nadruk;
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    for (const n of state.nodes) {
      const flash = Math.max(0, 1 - (t - n.flash) / 0.9);
      const radius = (n.big ? 3.6 : 1.9) * dpr;
      ctx.fillStyle = rgbCss(mixRgb(NODE, RED, flash), flash > 0 || n.big ? 1 : 0.75);
      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (n.big) {
        ctx.strokeStyle = 'rgba(179, 210, 225, 0.35)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + 4 * dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    drawVignette(ctx, W, H, 0.72);
  },
};

export default function NetwerkBackground({ className = '' }: { className?: string }) {
  return <CanvasBackground scene={netwerk} className={className} />;
}
