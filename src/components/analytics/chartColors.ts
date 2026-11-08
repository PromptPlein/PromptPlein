import { useEffect, useState } from 'react';

/** Rijkshuisstijl colors for the series of a chart, in this order. */
const SERIES_TOKENS = [
  'lintblauw',
  'hemelblauw',
  'groen',
  'oranje',
  'paars',
  'robijnrood',
  'donkergeel',
  'mosgroen',
  'donkerblauw',
  'roze',
].map((name) => `--primitives-color-${name}-500`);

const UI_TOKENS = {
  grid: '--semantics-dividers-color',
  tick: '--semantics-content-secondary-color',
  cursor: '--semantics-surfaces-tinted-background-color',
  line: '--primitives-color-lintblauw-500',
};

export interface ChartColors {
  series: string[];
  grid: string;
  tick: string;
  cursor: string;
  line: string;
}

/**
 * Resolves a design token to a concrete color. The tokens hold light-dark()
 * with nested var(), which an SVG presentation attribute cannot take, so the
 * value is painted on a probe element and read back as a computed color.
 */
function resolveTokens(tokens: string[]): string[] {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);
  const out = tokens.map((token) => {
    probe.style.color = '';
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return out;
}

function readColors(): ChartColors {
  const ui = Object.values(UI_TOKENS);
  const resolved = resolveTokens([...ui, ...SERIES_TOKENS]);
  const [grid, tick, cursor, line] = resolved;
  return { grid, tick, cursor, line, series: resolved.slice(ui.length) };
}

/**
 * Chart colors read from the design tokens at runtime. They are read again
 * when the theme on <html> changes (class, style or data attributes) and when
 * the system color scheme changes.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readColors);
  useEffect(() => {
    const update = () =>
      setColors((prev) => {
        const next = readColors();
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);
  return colors;
}

/** Tooltip box of recharts, in the surface of the system. Recharts renders it as HTML, so var() works. */
export const tooltipStyle = {
  backgroundColor: 'var(--semantics-surfaces-base-background-color)',
  border: 'var(--semantics-dividers-thickness, 1px) solid var(--semantics-dividers-color)',
  borderRadius: 'var(--semantics-surfaces-corner-radius)',
  color: 'var(--semantics-content-color)',
};
