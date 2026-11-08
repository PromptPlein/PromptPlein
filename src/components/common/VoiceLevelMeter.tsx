import { useEffect, useRef } from 'react';

/** Every this many milliseconds the meter takes a new reading. */
const STEP_MS = 70;

/** Below this level it is quiet (room noise), above it someone is talking. */
const VOICE_GATE = 0.15;

/**
 * A small level meter: an nldd-progress-bar that follows the volume of the
 * open microphone, in the accent color while someone talks and neutral when it
 * is quiet. So you see at once that the microphone picks up your voice.
 *
 * Listens through the Web Audio API to the volume of the open stream only;
 * nothing is recorded or kept here. The value goes straight to the element
 * instead of through React state, or the whole button would render sixty
 * times a second.
 */
export default function VoiceLevelMeter({ stream }: { stream: MediaStream | null }) {
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!stream) return;
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const context = new AudioCtx();
    void context.resume().catch(() => undefined);
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    let peak = 0;
    let lastStep = 0;
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      // Normal speech sits around 0.02 to 0.1 RMS; scale that to 0..1 and keep
      // the highest value until the next reading.
      peak = Math.max(peak, Math.min(1, Math.sqrt(rms) * 2.4 - 0.08));

      if (now - lastStep < STEP_MS) return;
      lastStep = now;
      const level = Math.max(0, peak);
      peak = 0;
      const bar = barRef.current;
      if (!bar) return;
      bar.setAttribute('value', String(Math.round(level * 100)));
      bar.setAttribute('color', level > VOICE_GATE ? 'accent' : 'neutral');
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close().catch(() => undefined);
    };
  }, [stream]);

  return (
    <nldd-container width="4rem" aria-hidden="true">
      <nldd-progress-bar ref={barRef} size="sm" value="0" color="neutral" value-display="none"></nldd-progress-bar>
    </nldd-container>
  );
}
