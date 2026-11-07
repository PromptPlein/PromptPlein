import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import toast from 'react-hot-toast';
import { useAccessibility, useSpeechVoice } from '@/context/AccessibilityContext';
import { CUE_MS, playCue } from '@/lib/audioCue';
import { setConversationActive, useConversationActive } from '@/lib/conversationMode';
import { matchesShortcut, SHORTCUTS } from '@/lib/shortcuts';
import { isSpeaking, speak, stopSpeaking, useSpeakingId } from '@/lib/speech';
import { insertDictatedText, useDictation, type DictationEnd } from '@/lib/useDictation';

/** Zo eindig je een dictaat als het meteen weg moet. "Versturen" telt bewust niet. */
const SEND_WORD = /[\s,.;:!?]*\bverstuur(?:\s+maar)?[\s.!?]*$/i;

/** Alleen dit en verder niets beëindigt een gesprek met de stem. */
const STOP_PHRASE = /^\s*(?:stop|stop gesprek|stop het gesprek|einde gesprek)[\s.!?]*$/i;

/** Tijd na het versturen waarin de chat kan beginnen met antwoorden. */
const SEND_HOLD_MS = 1500;

/**
 * Wie het scherm niet ziet, moet weten waarom het gesprek stilvalt. Daarom leest de
 * stem de melding voor, met de knoppen erbij. De tekst komt uit de melding zelf, dus
 * hij klopt ook als een beheerder de waarschuwing aanpast.
 */
function describeDialog(dialog: Element): string {
  const sentence = (text: string) => (/[.!?:]$/.test(text) ? text : `${text}.`);
  const lines = [...dialog.querySelectorAll('h2, p')]
    .map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(sentence);
  const choices = [...dialog.querySelectorAll('button')]
    .map((button) => button.innerText.trim())
    .filter(Boolean);
  const pick = choices.length ? `Je kunt kiezen uit: ${choices.join(', of ')}.` : '';
  return ['Er staat een melding op het scherm.', ...lines, pick].filter(Boolean).join(' ');
}

export type ConversationPhase = 'luistert' | 'uitschrijven' | 'denkt' | 'leest' | 'wacht';

interface ChatVoiceArgs {
  textareaRef: RefObject<HTMLTextAreaElement>;
  disabled: boolean;
  streaming: boolean;
  /** Verstuurt de tekst en maakt het tekstvak leeg. */
  onSubmit: (text: string) => void;
}

/**
 * De stem in de chat: inspreken met een sneltoets, versturen door "verstuur" te
 * zeggen, en de gespreksmodus. Die laatste is een lus: luisteren, bij stilte
 * versturen, het antwoord voorlezen en weer luisteren.
 *
 * De microfoon gaat alleen aan als de gebruiker dat zelf start, en het gesprek
 * stopt vanzelf als er niemand meer praat. De microfoon staat dus nooit open zonder
 * dat iemand dat weet. Na een antwoord kiest de lus zelf het moment om te luisteren
 * en controleert elke paar honderd milliseconden of dat kan: zo hoeft hij niet alle
 * overgangen te kennen, zoals de waarschuwing bij persoonsgegevens.
 */
export function useChatVoice({ textareaRef, disabled, streaming, onSubmit }: ChatVoiceArgs) {
  const { settings } = useAccessibility();
  const speechVoice = useSpeechVoice();
  const active = useConversationActive();
  const speakingId = useSpeakingId();
  const [announcement, setAnnouncement] = useState('');
  const holdUntil = useRef(0);
  const dialogNoticed = useRef(false);

  const current = {
    disabled,
    streaming,
    onSubmit,
    sendByVoice: settings.sendByVoice,
    voice: speechVoice,
    rate: settings.speechRate,
  };
  const latest = useRef(current);
  latest.current = current;

  const stopConversation = useCallback((message: string) => {
    setConversationActive(false);
    stopSpeaking();
    dictationRef.current?.cancel();
    playCue('stop');
    setAnnouncement(message);
  }, []);

  const handleSpoken = useCallback(
    (spoken: string) => {
      const field = textareaRef.current;
      if (!field) return;
      const { disabled: blocked, streaming: busy, onSubmit: submit, sendByVoice } = latest.current;

      if (conversationRef.current) {
        if (STOP_PHRASE.test(spoken)) {
          stopConversation('Het gesprek is gestopt.');
          return;
        }
        const text = [field.value.trim(), spoken.replace(SEND_WORD, '').trim()]
          .filter(Boolean)
          .join(' ');
        if (!text) return;
        holdUntil.current = Date.now() + SEND_HOLD_MS;
        submit(text);
        return;
      }

      if (!sendByVoice || !SEND_WORD.test(spoken)) {
        insertDictatedText(field, spoken);
        return;
      }
      const rest = spoken.replace(SEND_WORD, '').trim();
      if (rest) insertDictatedText(field, rest);
      const text = field.value.trim();
      if (text && !blocked && !busy) submit(text);
      else setAnnouncement('Versturen lukt nu niet. Je tekst staat in het tekstvak.');
    },
    [stopConversation, textareaRef],
  );

  const handleEnd = useCallback(
    (reason: DictationEnd) => {
      if (!conversationRef.current) return;
      if (reason === 'geen-spraak') {
        stopConversation('Het gesprek is gestopt, omdat ik niets meer hoorde.');
      } else if (reason === 'fout') {
        stopConversation('Het gesprek is gestopt door een fout.');
      }
    },
    [stopConversation],
  );

  const dictation = useDictation(handleSpoken, { onEnd: handleEnd });
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  const conversationRef = useRef(active);
  conversationRef.current = active;

  const toggleConversation = useCallback(() => {
    if (conversationRef.current) {
      stopConversation('Het gesprek is gestopt.');
      return;
    }
    if (!dictationRef.current.available) {
      toast.error('Log in om een gesprek te voeren.');
      return;
    }
    stopSpeaking();
    holdUntil.current = 0;
    setConversationActive(true);
    setAnnouncement('Gesprek gestart. Praat na de toon. Escape stopt het gesprek.');
  }, [stopConversation]);

  // De lus: is alles stil, dan gaat de microfoon aan.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const { state, start } = dictationRef.current;
      const { disabled: blocked, streaming: busy, voice, rate } = latest.current;
      if (state !== 'idle' || blocked || busy || isSpeaking()) return;
      if (Date.now() < holdUntil.current) return;
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        if (!dialogNoticed.current) speak('gesprek-melding', describeDialog(dialog), { voice, rate });
        dialogNoticed.current = true;
        return;
      }
      // "Terug, ik pas het bericht aan": de tekst staat weer in het vak en de
      // gebruiker wil hem wijzigen. Dan hoort de microfoon niet open te gaan.
      if (dialogNoticed.current && textareaRef.current?.value.trim()) {
        dialogNoticed.current = false;
        stopConversation('Het gesprek is gestopt, zodat je je bericht kunt aanpassen.');
        return;
      }
      dialogNoticed.current = false;

      holdUntil.current = Date.now() + 1000;
      playCue('start');
      window.setTimeout(() => {
        if (!conversationRef.current) return;
        void start({ autoStop: true }).then((started) => {
          if (!started) stopConversation('Het gesprek is gestopt, de microfoon ging niet aan.');
        });
      }, CUE_MS);
    }, 300);
    return () => window.clearInterval(timer);
  }, [active, stopConversation, textareaRef]);

  // Weg van de chat: het gesprek stopt, en daarmee de microfoon.
  useEffect(() => () => setConversationActive(false), []);

  // Sneltoetsen. Dicteren in een ander tekstvak regelt DictationLayer.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && conversationRef.current) {
        stopConversation('Het gesprek is gestopt.');
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.gesprek)) {
        e.preventDefault();
        toggleConversation();
        return;
      }
      if (!matchesShortcut(e, SHORTCUTS.dicteren)) return;

      const focused = document.activeElement;
      const field = textareaRef.current;
      const elsewhere =
        focused instanceof HTMLTextAreaElement &&
        focused !== field &&
        !focused.closest('[data-dictation="off"]');
      if (elsewhere || conversationRef.current) return;
      e.preventDefault();

      const { available, state, toggle } = dictationRef.current;
      if (!available) {
        toast.error('Log in om te kunnen dicteren.');
        return;
      }
      const { disabled: blocked, streaming: busy } = latest.current;
      if (state === 'idle' && (blocked || busy)) {
        setAnnouncement('Inspreken kan pas als het antwoord klaar is.');
        return;
      }
      // Nieuwe tekst hoort achteraan, ook als de cursor nog niet in het vak stond.
      if (field && document.activeElement !== field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
      playCue(state === 'idle' ? 'start' : 'stop');
      if (state === 'idle') window.setTimeout(toggle, CUE_MS);
      else toggle();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [stopConversation, textareaRef, toggleConversation]);

  let phase: ConversationPhase | null = null;
  if (active) {
    if (dictation.state === 'recording') phase = 'luistert';
    else if (dictation.state === 'transcribing') phase = 'uitschrijven';
    else if (streaming) phase = 'denkt';
    else if (speakingId) phase = 'leest';
    else phase = 'wacht';
  }

  return {
    ...dictation,
    conversation: { active, phase, announcement, toggle: toggleConversation },
  };
}
