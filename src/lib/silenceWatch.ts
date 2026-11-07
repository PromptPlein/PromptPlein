/** Zo lang stil na het praten en de opname is klaar. */
const SILENCE_MS = 1600;

/** Zo lang wachten we op een eerste woord voordat het gesprek stopt. */
const NO_SPEECH_MS = 30_000;

/** Hiermee meten we het achtergrondgeluid, voordat iemand begint te praten. */
const CALIBRATE_MS = 400;

/** Volume dat zeker als stem telt, ook in een rumoerige ruimte. */
const LOUDEST_THRESHOLD = 0.06;

/** Volume dat zeker geen stem is, ook in een stille ruimte. */
const QUIETEST_THRESHOLD = 0.015;

/**
 * Luistert mee met een open microfoon en meldt wanneer iemand is uitgepraat, of
 * helemaal niet begint. Alles gebeurt in de browser: dit meet alleen het volume en
 * stuurt niets weg. Geeft een functie terug die het luisteren stopt.
 */
export function watchForSilence(
  stream: MediaStream,
  handlers: { onSilence: () => void; onNoSpeech: () => void },
): () => void {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const startedAt = Date.now();
  let noise = 0;
  let spoke = false;
  let lastVoice = startedAt;

  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const volume = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
    const now = Date.now();

    if (now - startedAt < CALIBRATE_MS) {
      noise = Math.max(noise, volume);
      return;
    }
    const threshold = Math.min(LOUDEST_THRESHOLD, Math.max(QUIETEST_THRESHOLD, noise * 2.5));
    if (volume > threshold) {
      spoke = true;
      lastVoice = now;
    }
    if (spoke && now - lastVoice > SILENCE_MS) handlers.onSilence();
    if (!spoke && now - startedAt > NO_SPEECH_MS) handlers.onNoSpeech();
  }, 100);

  return () => {
    window.clearInterval(timer);
    void context.close();
  };
}
