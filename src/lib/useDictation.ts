import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { watchForSilence } from '@/lib/silenceWatch';
import { stopSpeaking } from '@/lib/speech';
import { isTranscribeAvailable, transcribeRecording } from '@/services/transcribeService';

/** Langer dan dit stopt de opname vanzelf en wordt hij uitgeschreven. */
export const MAX_DICTATION_SECONDS = 300;

/** Korter dan dit is een misklik, geen zin: dan sturen we niets op. */
const MIN_DICTATION_MS = 600;

/** Het eerste audioformaat dat deze browser kan opnemen (Safari kent geen webm). */
function pickMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export type DictationState = 'idle' | 'recording' | 'transcribing';

/** Waarom een opname zonder tekst eindigde. Alleen gemeld bij `autoStop`. */
export type DictationEnd = 'leeg' | 'geen-spraak' | 'fout';

/**
 * Opnemen met de microfoon en de opname laten uitschrijven. De audio leeft
 * alleen in het geheugen van deze hook: na het uitschrijven (of afbreken) gaan
 * de stukken weg en gaat de microfoon uit. Er komt geen bestand, geen
 * object-URL en geen kopie in de opslag van de browser.
 */
export function useDictation(
  onText: (text: string) => void,
  options?: { onEnd?: (reason: DictationEnd) => void },
) {
  const { user } = useAuth();
  const [state, setState] = useState<DictationState>('idle');
  const [seconds, setSeconds] = useState(0);
  // De open microfoon, voor de geluidsmeter. Alleen gezet tijdens het opnemen.
  const [stream, setStream] = useState<MediaStream | null>(null);

  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const onEndRef = useRef(options?.onEnd);
  onEndRef.current = options?.onEnd;
  // Stopt het meeluisteren; alleen gezet bij `autoStop`.
  const stopWatchRef = useRef<(() => void) | null>(null);
  const noSpeechRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const available = isTranscribeAvailable && supported && Boolean(user);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  /** Stopt zonder uit te schrijven; wat er was opgenomen gaat weg. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else {
      chunksRef.current = [];
      releaseMicrophone();
      setState('idle');
    }
  }, [releaseMicrophone]);

  /**
   * Zet de microfoon aan. Geeft false terug als dat niet lukte. Met `autoStop`
   * stopt de opname vanzelf bij stilte en meldt `onEnd` wat er misging, in plaats
   * van een melding op het scherm: dat past bij een gesprek zonder handen.
   */
  const start = useCallback(async ({ autoStop = false } = {}): Promise<boolean> => {
    if (!available || state !== 'idle') return false;
    // De stem mag niet in de opname terechtkomen.
    stopSpeaking();
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      notify.error(
        denied
          ? 'Geef de browser toestemming om je microfoon te gebruiken.'
          : 'Er is geen microfoon gevonden.',
      );
      return false;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(media, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 32_000,
    });
    streamRef.current = media;
    setStream(media);
    recorderRef.current = recorder;
    chunksRef.current = [];
    cancelledRef.current = false;
    noSpeechRef.current = false;
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      releaseMicrophone();
      recorderRef.current = null;
      const audio = new Blob(chunksRef.current, {
        type: recorder.mimeType || mimeType || 'audio/webm',
      });
      chunksRef.current = [];
      const tooShort = Date.now() - startedAtRef.current < MIN_DICTATION_MS;
      if (cancelledRef.current || tooShort || audio.size === 0) {
        setState('idle');
        if (noSpeechRef.current) onEndRef.current?.('geen-spraak');
        else if (autoStop && !cancelledRef.current) onEndRef.current?.('leeg');
        return;
      }

      setState('transcribing');
      const controller = new AbortController();
      abortRef.current = controller;
      const result = await transcribeRecording(audio, controller.signal);
      abortRef.current = null;
      setState('idle');
      if (cancelledRef.current) return;
      if (result.error) {
        notify.error(result.error);
        if (autoStop) onEndRef.current?.('fout');
      } else if (result.text) {
        onTextRef.current(result.text);
      } else if (autoStop) {
        onEndRef.current?.('leeg');
      } else {
        notify('Er was niets te verstaan. Probeer het nog eens.');
      }
    };

    recorder.start(1000);
    if (autoStop) {
      stopWatchRef.current = watchForSilence(media, {
        onSilence: () => {
          if (recorder.state === 'recording') recorder.stop();
        },
        onNoSpeech: () => {
          noSpeechRef.current = true;
          cancelledRef.current = true;
          if (recorder.state === 'recording') recorder.stop();
        },
      });
    }
    setSeconds(0);
    setState('recording');
    return true;
  }, [available, state, releaseMicrophone]);

  // Teller tijdens het opnemen, met een harde grens.
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_DICTATION_SECONDS) stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [state, stop]);

  // Weg van de pagina terwijl de microfoon nog aan staat: alles opruimen.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const toggle = useCallback(() => {
    if (state === 'recording') stop();
    else if (state === 'idle') void start();
  }, [state, start, stop]);

  return { available, state, seconds, stream, start, stop, cancel, toggle };
}

/** "0:07", "1:42". */
export function formatDictationTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Zet gedicteerde tekst op de plek van de cursor in een tekstvak, met een spatie
 * ertussen waar nodig. Gaat via de native setter plus een input-event, zodat de
 * onChange van een gecontroleerd React-veld afgaat alsof er getypt is.
 */
export function insertDictatedText(el: HTMLTextAreaElement | HTMLInputElement, text: string) {
  const value = el.value;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^\s/.test(after) ? ' ' : '';
  const insert = `${lead}${text}${trail}`;

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, before + insert + after);
  el.dispatchEvent(new Event('input', { bubbles: true }));

  const caret = before.length + insert.length;
  el.focus();
  el.setSelectionRange(caret, caret);
}
