import { useSyncExternalStore } from 'react';
import { splitAnswer } from '@/lib/chatFiles';

/**
 * Voorlezen met de spraakstem van de browser (Web Speech API). Bewust geen
 * spraakdienst aan de serverkant: de privacybelofte van de chat is dat gesprekken
 * op het apparaat blijven, en een stem op het apparaat houdt zich daaraan.
 *
 * Niet elke stem werkt zo. Browsers bieden ook online stemmen aan die de tekst
 * naar hun leverancier sturen (`localService === false`). Die kiezen we daarom
 * nooit vanzelf; alleen wie er in de instellingen zelf een uitkiest, gebruikt er
 * een.
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
export function splitForSpeech(text: string): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*|[.!?\n]+/g) ?? [];
  const chunks: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_CHUNK) push();
    if (sentence.length <= MAX_CHUNK) {
      current += sentence;
      continue;
    }
    for (const word of sentence.split(/\s+/)) {
      if (current.length + word.length + 1 > MAX_CHUNK) push();
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
const held: { utterance: SpeechSynthesisUtterance | null } = { utterance: null };
const listeners = new Set<() => void>();

function setSpeakingId(id: string | null) {
  speakingId = id;
  listeners.forEach((listener) => listener());
}

export function stopSpeaking(): void {
  run += 1;
  held.utterance = null;
  if (speechSupported()) window.speechSynthesis.cancel();
  if (speakingId !== null) setSpeakingId(null);
}

/** Leest `text` voor; een lopende voorlezing stopt eerst. */
export function speak(
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
