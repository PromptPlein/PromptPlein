import { prefersReducedMotion } from '@/context/AccessibilityContext';
import { useEffect, useRef } from 'react';
import type { CanvasScene } from '@/lib/canvasScene';

// Achtergrond in Canvas 2D, dus zonder three.js. De tekening zelf komt als
// `scene` binnen (KavelsBackground, NetwerkBackground). Decoratief:
// pointer-events staat uit en de canvas is verborgen voor schermlezers.

export default function CanvasBackground<S>({
  scene,
  className = '',
}: {
  scene: CanvasScene<S>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const now = () => (reduceMotion ? 12 : performance.now() / 1000);
    let state: S | null = null;
    let visible = true;
    let frame = 0;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      state = scene.init(ctx, canvas.width, canvas.height, dpr);
      scene.draw(ctx, state, now(), canvas.width, canvas.height, dpr);
    };
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersectionObserver.observe(canvas);

    if (!reduceMotion) {
      const loop = () => {
        if (visible && state) scene.draw(ctx, state, now(), canvas.width, canvas.height, dpr);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [scene]);

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
