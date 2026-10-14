import { useEffect, useRef } from 'react';

/** Aantal staafjes: een korte geschiedenis van ruim een seconde. */
const BARS = 18;

/** Elke zoveel milliseconden schuift er een nieuw staafje in. */
const STEP_MS = 70;

/** Onder dit niveau is het stil (ruis van de kamer), daarboven praat er iemand. */
const VOICE_GATE = 0.15;

/**
 * Een kleine, meeschuivende geluidsgrafiek: elk staafje is het volume van een
 * kort moment, de nieuwste rechts. Praat je, dan worden de staafjes hoger en
 * kleuren ze rijksblauw; is het stil, dan zakken ze terug tot lage grijze
 * streepjes. Zo zie je meteen dat de microfoon je stem oppikt.
 *
 * Luistert via de Web Audio-API alleen naar het volume van de open stream; er
 * wordt hier niets opgenomen of bewaard. De hoogtes gaan rechtstreeks naar de
 * DOM in plaats van via React-state, anders zou de hele knop zestig keer per
 * seconde opnieuw renderen.
 */
export default function VoiceLevelMeter({ stream }: { stream: MediaStream | null }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

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

    const history = new Array<number>(BARS).fill(0);
    let peak = 0;
    let lastStep = 0;
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      // Gewone spraak zit rond 0,02 tot 0,1 RMS; schaal dat op naar 0..1 en
      // onthoud de hoogste waarde tot het volgende staafje erin schuift.
      peak = Math.max(peak, Math.min(1, Math.sqrt(rms) * 2.4 - 0.08));

      if (now - lastStep < STEP_MS) return;
      lastStep = now;
      history.shift();
      history.push(Math.max(0, peak));
      peak = 0;

      history.forEach((level, i) => {
        const bar = barsRef.current[i];
        if (!bar) return;
        bar.style.height = `${3 + Math.round(level * 15)}px`;
        bar.dataset.voice = level > VOICE_GATE ? 'true' : 'false';
      });
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close().catch(() => undefined);
    };
  }, [stream]);

  return (
    <span className="flex h-[18px] items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          data-voice="false"
          className="h-[3px] w-[3px] rounded-full bg-slate-300 transition-[height,background-color] duration-100 ease-out data-[voice=true]:bg-rijksblauw-500 dark:bg-slate-500 dark:data-[voice=true]:bg-rijksblauw-300"
        />
      ))}
    </span>
  );
}
