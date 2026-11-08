import { useSyncExternalStore } from 'react';
import { hasMemoryTrigger } from '@/lib/memoryTriggers';

/**
 * Doorvragen in de chat: bij het eerste bericht van een nieuwe chat kijkt de AI
 * of hij het meteen goed kan uitvoeren. Zo niet, dan maakt de chat er eerst samen
 * met de medewerker een prompt van. Dit bestand houdt de instelling en de lokale
 * voorselectie; het verloop staat in `useChatIntake`.
 */

/** Per browser, net als de keuzes bij Toegankelijkheid: de chat werkt ook zonder account. */
const STORAGE_KEY = 'opl.chat.doorvragen';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'uit';
  } catch {
    return true;
  }
}

let enabled = typeof window === 'undefined' ? true : read();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Een ander tabblad zet hem uit: dan geldt dat hier ook.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    enabled = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function isChatIntakeEnabled(): boolean {
  return enabled;
}

/** Staat standaard aan; wie het uitzet, krijgt het niet meer tot hij het zelf weer aanzet. */
export function setChatIntakeEnabled(value: boolean): void {
  enabled = value;
  try {
    if (value) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, 'uit');
  } catch {
    /* opslag niet beschikbaar: de keuze geldt dan alleen deze sessie */
  }
  listeners.forEach((listener) => listener());
}

export function useChatIntakeEnabled(): boolean {
  return useSyncExternalStore(subscribe, isChatIntakeEnabled, () => true);
}

/** Hoogstens zoveel vragen voordat er een voorstel komt. */
export const MAX_INTAKE_QUESTIONS = 3;

/** Langer dan dit is geen summier bericht meer; dan kost de stap alleen tijd. */
const MAX_INTAKE_CHARS = 2000;

/** Een korte vraag naar informatie: die beantwoordt de chat meteen. */
const SHORT_QUESTION_MAX_WORDS = 15;
const TASK_VERB =
  /\b(schrijf|maak|stel\s+\S+\s+op|herschrijf|vat\s+samen|vertaal|formuleer|bedenk|genereer|ontwerp|verbeter|controleer|beoordeel)\b/i;

/** Wie al met kopjes als "Rol:" werkt, heeft zelf een prompt geschreven. */
const OWN_PROMPT = /^\s*(rol|context|taak|doel|doelgroep|opdracht|format|vorm)\s*:/im;

/**
 * Loont het om het eerste bericht te laten beoordelen? Een korte vraag, een eigen
 * prompt of een wens voor het geheugen gaat zonder AI-aanroep meteen door: daar
 * zou de stap alleen een wachttijd voor het antwoord zijn.
 */
export function shouldJudgeFirstMessage(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > MAX_INTAKE_CHARS) return false;
  if (hasMemoryTrigger(clean)) return false;
  if (OWN_PROMPT.test(clean) || /\bje bent\b/i.test(clean)) return false;
  const words = clean.split(/\s+/).length;
  if (clean.endsWith('?') && words < SHORT_QUESTION_MAX_WORDS && !TASK_VERB.test(clean)) {
    return false;
  }
  return true;
}

export interface PromptSection {
  kopje: string;
  tekst: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Knipt een prompt op zijn kopjes ("Rol:", "Context:" op een eigen regel, of met
 * de tekst er direct achter). Alleen de kopjes die de server opgaf tellen: een
 * regel als "Let op:" in de tekst is geen nieuw onderdeel.
 */
export function splitPromptSections(prompt: string, kopjes: string[]): PromptSection[] {
  if (kopjes.length === 0) return [];
  const heading = new RegExp(
    `^\\s*(${kopjes.map(escapeRegExp).join('|')})\\s*:\\s*(.*)$`,
    'i',
  );
  const sections: PromptSection[] = [];
  for (const line of prompt.split('\n')) {
    const match = heading.exec(line);
    if (match) {
      const kopje = kopjes.find((k) => k.toLowerCase() === match[1].toLowerCase()) ?? match[1];
      sections.push({ kopje, tekst: match[2] });
    } else if (sections.length > 0) {
      const last = sections[sections.length - 1];
      last.tekst = last.tekst ? `${last.tekst}\n${line}` : line;
    }
  }
  return sections.map((s) => ({ ...s, tekst: s.tekst.trim() }));
}
