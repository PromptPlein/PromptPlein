import { useCallback, useRef, useState } from 'react';

interface TiltState {
  transform: string;
  boxShadow: string;
}

const REST: TiltState = {
  transform: 'perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0)',
  boxShadow: '0 1px 2px rgba(15, 46, 81, 0.06)',
};

/**
 * Subtiel 3D-perspectief op hover (Three.js-stijl kaarteffect) zonder een
 * eigen WebGL-context per kaart. Rotatie volgt de muis; de schaduw past zich
 * aan op basis van de rotatie. Soepele easing (0.3s) via CSS-transition.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDeg = 7) {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<TiltState>(REST);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width; // 0..1
      const py = (e.clientY - rect.top) / rect.height; // 0..1
      const rotateY = (px - 0.5) * 2 * maxDeg;
      const rotateX = -(py - 0.5) * 2 * maxDeg;

      // Schaduw verschuift tegengesteld aan de kanteling.
      const shadowX = -(px - 0.5) * 24;
      const shadowY = (py - 0.5) * -24 + 14;

      setStyle({
        transform: `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(
          2,
        )}deg) translateZ(6px)`,
        boxShadow: `${shadowX.toFixed(0)}px ${shadowY.toFixed(0)}px 30px rgba(15, 46, 81, 0.16)`,
      });
    },
    [maxDeg],
  );

  const onMouseLeave = useCallback(() => setStyle(REST), []);

  return {
    ref,
    style: { ...style, transition: 'transform 0.3s ease, box-shadow 0.3s ease' },
    onMouseMove,
    onMouseLeave,
  };
}
