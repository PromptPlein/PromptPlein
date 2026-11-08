import { useEffect, useRef } from 'react';
import type { NLDDNotification, NotificationHandle } from '@nldd/design-system/notification';
import { notify } from '@/lib/notify';
import { CUE_MS, playCue } from '@/lib/audioCue';
import { matchesShortcut, SHORTCUTS } from '@/lib/shortcuts';
import { insertDictatedText, useDictation } from '@/lib/useDictation';

// The class comes from the registry, as in notify.ts: a second import of the
// subpath would define the elements twice.
const Notification = () => customElements.get('nldd-notification') as unknown as typeof NLDDNotification;

/** The focused element, also when it sits in the shadow root of an nldd field. */
function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** `closest` that also climbs out of shadow roots, to the host of each. */
function closestComposed(el: Element, selector: string): Element | null {
  let node: Element | null = el;
  while (node) {
    const hit = node.closest(selector);
    if (hit) return hit;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

/**
 * May this field be dictated into? A field with a button of its own (the chat)
 * sets `data-dictation="off"` on itself or a parent.
 */
function isDictationField(el: Element | null): el is HTMLTextAreaElement {
  return (
    el instanceof HTMLTextAreaElement &&
    !el.disabled &&
    !el.readOnly &&
    !closestComposed(el, '[data-dictation="off"]')
  );
}

const RECORDING_TEXT = 'Opname loopt';
const RECORDING_SUPPORT = `Stop met Alt + Shift + ${SHORTCUTS.dicteren.key}, of breek af met Escape.`;

/**
 * Dictation for every text field in the app, started with the shortcut while
 * the caret is in a field. The written text lands at the caret.
 *
 * While recording and transcribing an nldd-notification says so, with Stop and
 * Afbreken. A microphone button floating beside each field is not possible in
 * the design system (0.18.0): a control anchored to a field needs a popover,
 * which takes focus away from the field and closes on a click in it. The chat
 * has a microphone of its own (DictationButton).
 */
export default function DictationLayer() {
  const lockedRef = useRef<HTMLTextAreaElement | null>(null);
  const handleRef = useRef<NotificationHandle | null>(null);

  const dictation = useDictation((text) => {
    const field = lockedRef.current;
    lockedRef.current = null;
    if (field?.isConnected) {
      insertDictatedText(field, text);
    } else {
      // The field is gone in the meantime (dialog closed, other page): the text
      // is not lost but goes to the clipboard.
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      notify('Het veld is er niet meer. De tekst staat op je klembord.');
    }
  });
  const { available, state, cancel, start, toggle } = dictation;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  // The notification follows the state: raised while recording, updated while
  // transcribing, gone once idle.
  useEffect(() => {
    if (state === 'idle') {
      lockedRef.current = null;
      handleRef.current?.dismiss();
      handleRef.current = null;
      return;
    }
    if (state === 'recording') {
      const options = {
        text: RECORDING_TEXT,
        supportingText: RECORDING_SUPPORT,
        variant: 'accent' as const,
        icon: 'microphone',
        duration: 0,
        actions: [
          { text: 'Stop', onClick: () => toggleRef.current() },
          { text: 'Afbreken', onClick: () => cancelRef.current() },
        ],
      };
      if (handleRef.current) handleRef.current.update(options);
      else handleRef.current = Notification()?.show(options) ?? null;
      return;
    }
    const options = { text: 'Uitschrijven…', supportingText: undefined, icon: 'microphone', duration: 0, actions: [] };
    if (handleRef.current) handleRef.current.update(options);
    else handleRef.current = Notification()?.show(options) ?? null;
  }, [state]);

  useEffect(
    () => () => {
      handleRef.current?.dismiss();
    },
    [],
  );

  // Escape while recording: cancel without transcribing.
  useEffect(() => {
    if (state !== 'recording') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancel();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [state, cancel]);

  // The shortcut in every text field. With the caret in the chat, the chat
  // handles it itself (useChatVoice).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!matchesShortcut(e, SHORTCUTS.dicteren)) return;
      if (state !== 'idle') {
        e.preventDefault();
        playCue('stop');
        toggle();
        return;
      }
      const field = deepActiveElement();
      if (!isDictationField(field)) {
        if (document.querySelector('[data-dictation="off"]')) return;
        e.preventDefault();
        notify('Ga eerst met de cursor naar een tekstvak.');
        return;
      }
      e.preventDefault();
      if (!available) {
        notify.error('Log in om te kunnen dicteren.');
        return;
      }
      lockedRef.current = field;
      playCue('start');
      window.setTimeout(() => {
        void start().then((started) => {
          if (!started) lockedRef.current = null;
        });
      }, CUE_MS);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [available, start, state, toggle]);

  return null;
}
