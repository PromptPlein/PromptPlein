import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';

export type TextScale = 'normaal' | 'groot' | 'extra-groot';

/** Wat er gebeurt zodra de AI klaar is met schrijven. */
export type AnswerDone = 'niets' | 'schermlezer' | 'voorlezen';

/** Waarde van `speechVoice` voor de natuurlijke stem (Lotte, via Mistral). */
export const NATURAL_VOICE = 'mistral-lotte';

/** Waarde van `speechVoice` voor wie bewust de eerste stem op het apparaat wil. */
export const DEVICE_VOICE = 'apparaat';

export interface AccessibilitySettings {
  textScale: TextScale;
  highContrast: boolean;
  reduceMotion: boolean;
  /** Knoppen bij berichten altijd tonen in plaats van pas bij de muis of focus. */
  alwaysShowActions: boolean;
  /** Knop "Voorlezen" onder elk antwoord. */
  speechButton: boolean;
  answerDone: AnswerDone;
  /**
   * De gekozen stem: {@link NATURAL_VOICE}, {@link DEVICE_VOICE} of een voiceURI.
   * null = geen keuze gemaakt, dus de standaard; zie {@link useSpeechVoice}.
   */
  speechVoice: string | null;
  speechRate: number;
  /** Eindigt een dictaat in de chat op "verstuur", dan gaat het bericht meteen weg. */
  sendByVoice: boolean;
  /** De knop Gesprek in de chat, en de sneltoets daarvoor. */
  conversationMode: boolean;
}

/**
 * Alles staat uit tot iemand het zelf aanzet. Een functie die mensen niet gevraagd
 * hebben, hoort niet in beeld te komen. Dat geldt ook voor de sneltoetsen ervan.
 */
export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  textScale: 'normaal',
  highContrast: false,
  reduceMotion: false,
  alwaysShowActions: false,
  speechButton: false,
  answerDone: 'niets',
  speechVoice: null,
  speechRate: 1,
  sendByVoice: false,
  conversationMode: false,
};

export const SPEECH_RATES = [0.75, 1, 1.25, 1.5];

/** De grootte van `-apple-system-body` bij de standaardinstelling van iOS. */
const IOS_BODY_SIZE = 17;
/** Daarboven is er op een telefoon geen zinnige opmaak meer te maken. */
const MAX_SYSTEM_FACTOR = 2;

/**
 * Safari op de iPhone negeert de tekstgrootte uit Instellingen voor websites, tenzij
 * je erom vraagt. Wie daar grotere tekst heeft gekozen, verwacht die ook hier.
 * Android regelt dit zelf: zie de meta text-scale in index.html.
 */
function systemTextFactor(): number {
  const touchApple =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!touchApple || !document.body || !CSS.supports('font', '-apple-system-body')) return 1;
  const probe = document.createElement('span');
  probe.style.font = '-apple-system-body';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (!size) return 1;
  return Math.min(MAX_SYSTEM_FACTOR, Math.max(1, size / IOS_BODY_SIZE));
}

const TEXT_SCALE_PERCENT: Record<TextScale, string> = {
  normaal: '100%',
  groot: '125%',
  'extra-groot': '150%',
};

const STORAGE_KEY = 'opl-toegankelijkheid';

interface AccessibilityContextValue {
  settings: AccessibilitySettings;
  update: (patch: Partial<AccessibilitySettings>) => void;
  reset: () => void;
  /** Staat voorlezen aan, via de knop of na elk antwoord? */
  speechOn: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

/** Oude of kapotte opslag mag de app nooit breken: per veld terug naar de standaard. */
function sanitize(raw: unknown): AccessibilitySettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<AccessibilitySettings>;
  const d = DEFAULT_ACCESSIBILITY;
  return {
    textScale:
      value.textScale && value.textScale in TEXT_SCALE_PERCENT ? value.textScale : d.textScale,
    highContrast: value.highContrast === true,
    reduceMotion: value.reduceMotion === true,
    alwaysShowActions: value.alwaysShowActions === true,
    speechButton: value.speechButton === true,
    answerDone:
      value.answerDone === 'schermlezer' || value.answerDone === 'voorlezen'
        ? value.answerDone
        : d.answerDone,
    speechVoice: typeof value.speechVoice === 'string' ? value.speechVoice : null,
    speechRate: SPEECH_RATES.includes(value.speechRate as number)
      ? (value.speechRate as number)
      : d.speechRate,
    sendByVoice: value.sendByVoice === true,
    conversationMode: value.conversationMode === true,
  };
}

function readStored(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_ACCESSIBILITY;
  }
}

/** Zet de keuzes op <html>; de regels zelf staan in index.css. */
function applyToDocument(settings: AccessibilitySettings) {
  const root = document.documentElement;
  // Tailwind rekent in rem, dus zo groeit de hele interface mee.
  // Bovenop de keuze hier telt de tekstgrootte van de iPhone zelf.
  root.style.fontSize = `calc(${TEXT_SCALE_PERCENT[settings.textScale]} * ${systemTextFactor()})`;
  const toggle = (name: string, on: boolean, value: string) => {
    if (on) root.dataset[name] = value;
    else delete root.dataset[name];
  };
  toggle('contrast', settings.highContrast, 'high');
  toggle('motion', settings.reduceMotion, 'reduce');
  toggle('actions', settings.alwaysShowActions, 'always');
}

/**
 * Minder beweging: de eigen keuze in de app, of de instelling van het systeem.
 * Voor code die zelf animeert; CSS-animaties regelt index.css.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readStored());

  // Layout-effect: de lettergrootte staat zo goed voordat er iets getekend is.
  useLayoutEffect(() => {
    applyToDocument(settings);
    // De tekstgrootte verander je in Instellingen, dus buiten de app om.
    const reapply = () => {
      if (document.visibilityState === 'visible') applyToDocument(settings);
    };
    document.addEventListener('visibilitychange', reapply);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* localStorage niet beschikbaar: de keuze geldt dan alleen deze sessie */
    }
    return () => document.removeEventListener('visibilitychange', reapply);
  }, [settings]);

  const update = useCallback((patch: Partial<AccessibilitySettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_ACCESSIBILITY), []);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      settings,
      update,
      reset,
      speechOn: settings.speechButton || settings.answerDone === 'voorlezen',
    }),
    [settings, update, reset],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility moet binnen <AccessibilityProvider> gebruikt worden.');
  return ctx;
}

/**
 * De stem die echt voorleest. Standaard is dat Lotte, maar die vraagt om een
 * account: zonder account leest de eerste Nederlandse stem op het apparaat voor
 * (`null`). Een eerder bewaarde keuze voor Lotte blijft dan staan voor de volgende
 * keer dat iemand inlogt.
 */
export function useSpeechVoice(): string | null {
  const { settings } = useAccessibility();
  const { isAuthenticated } = useAuth();
  const { speechVoice } = settings;
  if (speechVoice === DEVICE_VOICE) return null;
  if (speechVoice === null || speechVoice === NATURAL_VOICE) {
    return isAuthenticated ? NATURAL_VOICE : null;
  }
  return speechVoice;
}
