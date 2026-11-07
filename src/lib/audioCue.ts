/**
 * Korte tonen voor wie het scherm niet ziet: een stijgende toon betekent dat je kunt
 * praten, een dalende dat de microfoon uit is. Bewust maar twee: meer geluiden
 * onthoudt niemand. De tonen worden hier gemaakt, er is geen geluidsbestand.
 */
let context: AudioContext | null = null;

/** Hoe lang een toon duurt, in milliseconden. Wacht zo lang met de microfoon. */
export const CUE_MS = 180;

export function playCue(kind: 'start' | 'stop'): void {
  try {
    context ??= new AudioContext();
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const [from, to] = kind === 'start' ? [660, 880] : [660, 440];
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.linearRampToValueAtTime(to, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  } catch {
    /* Geen geluid mogelijk: de tekst op het scherm zegt hetzelfde. */
  }
}
