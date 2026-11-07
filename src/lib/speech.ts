import { useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { NATURAL_VOICE } from '@/context/AccessibilityContext';
import { splitAnswer } from '@/lib/chatFiles';
import { SpeechLoginRequiredError, synthesizeSpeech } from '@/services/speechService';

/**
 * Voorlezen. Standaard met de natuurlijke stem van Mistral voor wie ingelogd is;
 * zie useSpeechVoice. De tekst komt al van Mistral, dus er komt geen nieuwe partij
 * bij, en de audio wordt nergens bewaard. Zonder account, of als de gebruiker dat
 * kiest, leest de spraakstem van de browser voor (Web Speech API): die blijft op
 * het apparaat.
 *
 * Browsers bieden ook online stemmen aan die de tekst naar hun eigen leverancier
 * sturen (`localService === false`). Die kiezen we nooit vanzelf; alleen wie er
 * in de instellingen zelf een uitkiest, gebruikt er een.
 */

export interface SpeechVoiceOption {
  uri: string;
  name: string;
  lang: string;
  /** false = de tekst gaat naar de leverancier van de stem. */
  local: boolean;
}

export type SpeakResult = 'gestart' | 'geen-stem' | 'niet-ondersteund';

/** Chrome breekt lange uitingen af, dus lezen we in stukken van hooguit dit formaat. */
const MAX_CHUNK = 220;

/**
 * Stukken voor de natuurlijke stem. De audio komt pas als het hele stuk is
 * ingesproken, dus een kleiner stuk betekent minder wachten op de eerste zin.
 * Moet onder MAX_SPEECH_CHARS van de edge function blijven.
 */
const NATURAL_CHUNK = 400;

/**
 * Een fractie stilte. Safari staat geluid alleen toe vanuit een klik, en de echte
 * audio is er pas later. Dit ontgrendelt het element tijdens de klik.
 */
const SILENCE =
  'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Alle Nederlandse stemmen, die op het apparaat zelf vooraan. */
export function listDutchVoices(): SpeechVoiceOption[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('nl'))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }))
    .sort((a, b) => Number(b.local) - Number(a.local) || a.name.localeCompare(b.name));
}

/** Browsers laden stemmen na het starten; roep `onChange` aan zodra ze er zijn. */
export function subscribeVoices(onChange: () => void): () => void {
  if (!speechSupported()) return () => undefined;
  const synth = window.speechSynthesis;
  synth.addEventListener('voiceschanged', onChange);
  return () => synth.removeEventListener('voiceschanged', onChange);
}

function pickVoice(preferred: string | null): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (preferred) {
    const chosen = voices.find((v) => v.voiceURI === preferred);
    if (chosen) return chosen;
  }
  // nl-NL vóór nl-BE: Vlaams klinkt voor deze gebruikers als de verkeerde stem.
  const local = voices.filter((v) => v.lang.toLowerCase().startsWith('nl') && v.localService);
  return local.find((v) => v.lang.toLowerCase() === 'nl-nl') ?? local[0] ?? null;
}

/** Eén regel markdown zonder de tekens die een stem letterlijk zou uitspreken. */
function plainLine(raw: string): string {
  const line = raw.trim();
  if (!line || /^([-*_])\1{2,}$/.test(line)) return '';
  // Scheidingsregel van een tabel.
  if (/^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')) return '';

  const heading = /^#{1,6}\s+/.test(line);
  const bold = /^\*\*[^*]+\*\*$/.test(line);
  const text = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*`]/g, '')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim();

  // Een kop zonder leesteken loopt anders in één adem door in de zin erna.
  return (heading || bold) && !/[.!?:]$/.test(text) ? `${text}.` : text;
}

/** Maakt van een antwoord tekst die prettig klinkt: zonder opmaak en zonder code. */
export function toSpeakableText(answer: string): string {
  const parts = splitAnswer(answer).map((segment) => {
    if (segment.kind === 'text') {
      return segment.text.split('\n').map(plainLine).filter(Boolean).join('\n');
    }
    return segment.isHtmlFile
      ? 'Hier staat een bestand, dat lees ik niet voor.'
      : 'Hier staat code, die lees ik niet voor.';
  });
  return parts.filter(Boolean).join('\n');
}

/** Knipt tekst op zinnen, en een te lange zin op woorden. */
export function splitForSpeech(text: string, maxChunk = MAX_CHUNK): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|[.!?\n]+/g) ?? [];
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChunk) push();
    if (sentence.length <= maxChunk) {
      current += sentence;
      continue;
    }
    for (const word of sentence.split(/\s+/)) {
      if (current.length + word.length + 1 > maxChunk) push();
      current += `${word} `;
    }
  }
  push();
  return chunks;
}

// --- Wat er nu wordt voorgelezen ---
// Eén stem tegelijk over de hele app, dus één plek die het bijhoudt.
let speakingId: string | null = null;
let run = 0;
// Chrome ruimt een uiting anders soms op voordat `onend` afgaat.
const held: {
  utterance: SpeechSynthesisUtterance | null;
  /** Stopt de lopende natuurlijke stem: het afspelen en de aanvragen. */
  stopNatural: (() => void) | null;
} = { utterance: null, stopNatural: null };
const listeners = new Set<() => void>();

function setSpeakingId(id: string | null) {
  speakingId = id;
  listeners.forEach((listener) => listener());
}

export function stopSpeaking(): void {
  run += 1;
  held.utterance = null;
  held.stopNatural?.();
  held.stopNatural = null;
  if (speechSupported()) window.speechSynthesis.cancel();
  if (speakingId !== null) setSpeakingId(null);
}

/** Speelt één stuk af op het gedeelde element en wacht tot het klaar of gestopt is. */
function playChunk(audio: HTMLAudioElement, blob: Blob, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const release = () => {
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
      URL.revokeObjectURL(url);
    };
    audio.onended = () => {
      release();
      resolve();
    };
    audio.onerror = () => {
      release();
      reject(new Error('Audio niet af te spelen'));
    };
    audio.src = url;
    // Na `src` opnieuw zetten: laden zet de snelheid terug op de standaard.
    audio.playbackRate = rate;
    audio.play().then(
      () => {
        // Stoppen pauzeert het element; pas nu kan dat niet meer door `src` komen.
        audio.onpause = () => {
          if (audio.ended) return;
          release();
          resolve();
        };
      },
      (err) => {
        release();
        reject(err);
      },
    );
  });
}

/** Leest stukken voor met de natuurlijke stem; bij een fout neemt de browserstem over. */
async function speakNatural(id: string, chunks: string[], audio: HTMLAudioElement, rate: number) {
  const thisRun = run;
  const controller = new AbortController();
  held.stopNatural = () => {
    controller.abort();
    audio.pause();
  };
  const load = (index: number) => {
    const pending = synthesizeSpeech(chunks[index], controller.signal);
    // Het volgende stuk wordt alvast opgehaald en pas later afgewacht.
    pending.catch(() => undefined);
    return pending;
  };

  let index = 0;
  try {
    let pending = load(0);
    while (index < chunks.length) {
      const blob = await pending;
      if (thisRun !== run) return;
      if (index + 1 < chunks.length) pending = load(index + 1);
      await playChunk(audio, blob, rate);
      if (thisRun !== run) return;
      index += 1;
    }
    held.stopNatural = null;
    setSpeakingId(null);
  } catch (err) {
    if (thisRun !== run) return;
    const result = speakWithBrowser(id, chunks.slice(index).join(' '), { voice: null, rate });
    if (result !== 'gestart') {
      toast.error('Voorlezen lukte niet.');
    } else if (!(err instanceof SpeechLoginRequiredError)) {
      toast.error('De stem Lotte werkt nu niet. De stem van je apparaat leest verder.');
    }
  }
}

/** Leest `text` voor; een lopende voorlezing stopt eerst. */
export function speak(
  id: string,
  text: string,
  options: { voice: string | null; rate: number },
): SpeakResult {
  if (options.voice !== NATURAL_VOICE) return speakWithBrowser(id, text, options);

  stopSpeaking();
  const chunks = splitForSpeech(text, NATURAL_CHUNK);
  if (chunks.length === 0) return 'gestart';
  const audio = new Audio(SILENCE);
  audio.play().catch(() => undefined);
  setSpeakingId(id);
  void speakNatural(id, chunks, audio, options.rate);
  return 'gestart';
}

function speakWithBrowser(
  id: string,
  text: string,
  options: { voice: string | null; rate: number },
): SpeakResult {
  if (!speechSupported()) return 'niet-ondersteund';
  stopSpeaking();

  const voice = pickVoice(options.voice);
  if (!voice) return 'geen-stem';

  const chunks = splitForSpeech(text);
  if (chunks.length === 0) return 'gestart';

  const thisRun = run;
  let index = 0;

  const next = () => {
    if (thisRun !== run) return;
    if (index >= chunks.length) {
      held.utterance = null;
      setSpeakingId(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    index += 1;
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = options.rate;
    utterance.onend = next;
    utterance.onerror = () => {
      if (thisRun === run) stopSpeaking();
    };
    held.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  };

  setSpeakingId(id);
  next();
  return 'gestart';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Het id van wat er nu wordt voorgelezen, of null. */
export function useSpeakingId(): string | null {
  return useSyncExternalStore(subscribe, () => speakingId);
}
