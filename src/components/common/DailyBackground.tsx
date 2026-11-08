/**
 * Formerly the moving background of the day behind the page (three.js tiles and
 * polder, prompt lines on a canvas, a light band). The design system (0.18.0)
 * has no decorative background, and a fixed layer behind the shell needs CSS of
 * its own, so this renders nothing. The page keeps the background of
 * nldd-shell; nothing functional depends on it.
 */
export default function DailyBackground() {
  return null;
}
