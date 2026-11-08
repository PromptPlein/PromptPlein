/**
 * Formerly a decorative canvas of prompt lines drifting by behind the page. The
 * design system (0.18.0) has no decorative background, and a canvas filling the
 * window behind the shell needs CSS of its own, so this renders nothing.
 * Nothing functional depends on it.
 */
export default function PromptLinesBackground() {
  return null;
}
