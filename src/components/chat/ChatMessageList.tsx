import {
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import {
  prefersReducedMotion,
  useAccessibility,
  useSpeechVoice,
} from '@/context/AccessibilityContext';
import { isConversationActive } from '@/lib/conversationMode';
import { matchesShortcut, SHORTCUTS } from '@/lib/shortcuts';
import { isSpeaking, speak, stopSpeaking, toSpeakableText, useSpeakingId } from '@/lib/speech';
import { visibleHeight } from '@/lib/viewportWatch';
import ChatAnswer from './ChatAnswer';
import CopyMessageButton from './CopyMessageButton';
import type { ChatMessage } from '@/types';
import '@nldd/design-system/banner';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/link';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/page';
import '@nldd/design-system/text';
import '@nldd/design-system/title';
import '@nldd/design-system/tooltip';
import '@nldd/design-system/visually-hidden';

/** Ruimte boven de vraag zodra die bovenaan staat. */
const TOP_GAP = 16;
/** Zo veel tekst onder beeld hoort er te zijn voordat de knop "Naar beneden" komt. */
const JUMP_THRESHOLD = 48;
/** Eigen berichten boven deze omvang klappen in: het zijn vaak hele prompts. */
const LONG_MESSAGE_CHARS = 800;
const LONG_MESSAGE_LINES = 12;
/** Zo veel van een ingeklapt bericht blijft staan. */
const COLLAPSED_CHARS = 400;
const COLLAPSED_LINES = 6;

/** Wat ChatPage van de lijst kan vragen: de knop "Naar beneden" staat bij het tekstvak. */
export interface ChatMessageListHandle {
  jumpToEnd: () => void;
}

/**
 * The bars of the nldd-page this list sits in: the sticky title bar above, and
 * the composer below the conversation. The last turn leaves room for both.
 */
function stickyBars(el: HTMLElement) {
  const page = el.closest('nldd-page');
  const header = page?.querySelector<HTMLElement>(':scope > [slot="header"]');
  const footer = page?.querySelector<HTMLElement>(':scope > [slot="footer"], :scope > [data-chat-composer]');
  return {
    top: header?.getBoundingClientRect().height ?? 0,
    bottom: footer?.getBoundingClientRect().height ?? 0,
    footerEl: footer ?? null,
  };
}

function scrollRoot() {
  return document.scrollingElement ?? document.documentElement;
}

/** De tekst met regeleinden, als regels met een <br> ertussen. */
function withBreaks(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <Fragment key={i}>
      {line}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ));
}

/**
 * De berichtenlijst van de chat. Elke rij is gememoïseerd: tijdens het streamen
 * verandert alleen het laatste bericht, dus alleen die rij rendert opnieuw.
 *
 * Het document scrollt, niet de lijst: de titelbalk en het tekstvak staan vast
 * in de pagina eromheen (nldd-page met sticky-header en sticky-footer).
 */
const ChatMessageList = forwardRef<ChatMessageListHandle, {
  messages: ChatMessage[];
  streaming: boolean;
  /**
   * Waar de lopende beurt is ('searching', 'thinking', …). Verklaart de stilte
   * vóór de eerste regel: zoeken op internet duurt een paar seconden en zonder
   * uitleg lijkt het scherm stil te staan.
   */
  phase?: string | null;
  onRetry: () => void;
  /** "Ga verder": schrijf het laatste, afgebroken antwoord verder. */
  onContinue?: () => void;
  /** Stuur de fouten uit de controle van een bestand als nieuw bericht. */
  onRepair?: (text: string) => void;
  /** Vervang je laatste bericht en laat het antwoord opnieuw schrijven. */
  onEdit?: (messageId: string, text: string) => void;
  /** "Verbeter in generator" op eigen berichten (omgekeerde handoff). */
  onImprove?: (text: string) => void;
  /** "Bewaar als prompt": sla een eigen bericht op in de bibliotheek. */
  onSaveAsPrompt?: (text: string) => void;
  /** Onder dit eigen bericht staat de bouw-een-prompt-tip (zie ChatPage). */
  nudgeMessageId?: string | null;
  onNudgeDismiss?: () => void;
  /** Of er genoeg tekst onder beeld staat voor de knop "Naar beneden". */
  onShowJumpChange?: (show: boolean) => void;
}>(function ChatMessageList(
  {
    messages,
    streaming,
    phase,
    onRetry,
    onContinue,
    onRepair,
    onEdit,
    onImprove,
    onSaveAsPrompt,
    nudgeMessageId,
    onNudgeDismiss,
    onShowJumpChange,
  },
  ref,
) {
  const contentRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState('');
  const { settings, speechOn } = useAccessibility();
  const speechVoice = useSpeechVoice();

  // De knop "Naar beneden" zet volgen aan; omhoog scrollen zet het weer uit.
  const followRef = useRef(false);
  const lastTopRef = useRef(0);
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const showJumpRef = useRef(false);
  const onShowJumpRef = useRef(onShowJumpChange);
  onShowJumpRef.current = onShowJumpChange;

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const lastUserId = lastUserIndex >= 0 ? messages[lastUserIndex].id : null;
  const lastIsAnswerToQuestion =
    lastUserIndex >= 0 && lastUserIndex === messages.length - 2;

  /**
   * De laatste beurt vult minstens het zichtbare deel van het venster. Alleen dan
   * is er genoeg ruimte om de vraag bovenaan te zetten terwijl het antwoord nog
   * kort is. De maat gaat als `min-height` rechtstreeks op de rij van het antwoord,
   * zodat de rijen niet opnieuw hoeven te renderen.
   */
  const fitLastTurn = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const fill = content.querySelector<HTMLElement>('[data-turn-fill]');
    content.querySelectorAll<HTMLElement>('[data-turn-row][min-height]').forEach((row) => {
      if (row !== fill) row.removeAttribute('min-height');
    });
    if (!fill || !lastUserId) return;
    const question = content.querySelector<HTMLElement>(`[data-message-id="${lastUserId}"]`);
    if (!question) return;
    // The question belongs right under the title bar and the composer at the
    // bottom of the window, so the answer row makes up the difference.
    const bars = stickyBars(content);
    const composer = bars.footerEl?.getBoundingClientRect().bottom;
    if (composer === undefined) return;
    const span = composer - question.getBoundingClientRect().top;
    const wanted = visibleHeight() - bars.top - TOP_GAP;
    const room = fill.getBoundingClientRect().height + wanted - span;
    fill.setAttribute('min-height', `${Math.max(0, Math.round(room))}px`);
  }, [lastUserId]);

  const syncJump = useCallback(() => {
    // What is still below the window: up to the end of the composer under the
    // conversation, or the end of the document when there is none.
    const content = contentRef.current;
    const composer = content ? stickyBars(content).footerEl : null;
    const end = composer
      ? composer.getBoundingClientRect().bottom
      : scrollRoot().scrollHeight - window.scrollY;
    const show = end - visibleHeight() > JUMP_THRESHOLD;
    if (show === showJumpRef.current) return;
    showJumpRef.current = show;
    onShowJumpRef.current?.(show);
  }, []);

  // Een nieuwe vraag gaat bovenaan staan en daarna blijft het scherm stil: het
  // antwoord groeit eronder en je leest in je eigen tempo vanaf het begin. Ook
  // een geopend gesprek begint bij de laatste vraag.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !lastUserId) return;
    followRef.current = false;
    stopSpeaking();
    fitLastTurn();
    const row = content.querySelector<HTMLElement>(`[data-message-id="${lastUserId}"]`);
    if (!row) return;
    const { top } = stickyBars(content);
    window.scrollTo({
      top: window.scrollY + row.getBoundingClientRect().top - top - TOP_GAP,
      behavior: streamingRef.current && !prefersReducedMotion() ? 'smooth' : 'auto',
    });
  }, [lastUserId, fitLastTurn]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const onResize = () => {
      fitLastTurn();
      if (followRef.current) window.scrollTo({ top: scrollRoot().scrollHeight });
      syncJump();
    };

    const onScroll = () => {
      if (window.scrollY < lastTopRef.current - 2) followRef.current = false;
      lastTopRef.current = window.scrollY;
      syncJump();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(content);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    syncJump();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      if (showJumpRef.current) {
        showJumpRef.current = false;
        onShowJumpRef.current?.(false);
      }
    };
  }, [fitLastTurn, syncJump]);

  useImperativeHandle(
    ref,
    () => ({
      jumpToEnd() {
        followRef.current = streamingRef.current;
        window.scrollTo({
          top: scrollRoot().scrollHeight,
          behavior: streamingRef.current || prefersReducedMotion() ? 'auto' : 'smooth',
        });
        // De knop verdwijnt zo meteen; de focus mag niet met hem mee verdwijnen.
        contentRef.current?.focus({ preventScroll: true });
      },
    }),
    [],
  );

  // Wat een schermlezer hoort. Niet de hele lijst als live-regio: dan zou hij
  // elk woord van een lopend antwoord oppikken. Alleen begin en einde, en de
  // volledige tekst als de gebruiker dat in de instellingen heeft gekozen.
  // Begint op false: bij het eerste bericht van een gesprek verschijnt deze lijst
  // pas als het schrijven al loopt, en ook dat moet gemeld worden.
  const wasStreaming = useRef(false);
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (streaming === wasStreaming.current) return;
    wasStreaming.current = streaming;
    if (streaming) {
      setStatus('De AI schrijft een antwoord.');
      return;
    }
    if (!lastMessage || lastMessage.role !== 'assistant') return;
    if (lastMessage.error) {
      setStatus(`Het antwoord is mislukt. ${lastMessage.error}`);
      return;
    }
    if (lastMessage.stopped) {
      setStatus('Het antwoord is gestopt.');
      return;
    }
    const spoken = toSpeakableText(lastMessage.content);
    // In een gesprek leest de chat altijd voor: daarvoor heb je hem aangezet. De
    // meldingen blijven dan weg, anders neemt de microfoon de schermlezer op.
    const conversation = isConversationActive();
    if (settings.answerDone === 'schermlezer' && !conversation) {
      setStatus(`Antwoord: ${spoken}`);
      return;
    }
    if (!conversation) setStatus('Het antwoord is klaar.');
    if (settings.answerDone === 'voorlezen' || conversation) {
      const result = speak(lastMessage.id, spoken, {
        voice: speechVoice,
        rate: settings.speechRate,
      });
      if (result === 'geen-stem') notify.error(NO_VOICE_MESSAGE);
    }
    // Alleen de overgang van streaming telt, niet elke wijziging in de instellingen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // Voor de sneltoets: die luistert één keer en moet de actuele stand kennen.
  const readLatest = useRef({ messages, speechOn, speechVoice, rate: settings.speechRate });
  readLatest.current = { messages, speechOn, speechVoice, rate: settings.speechRate };

  // Voorlezen stopt met Escape en stopt ook als je deze pagina verlaat.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopSpeaking();
      if (!matchesShortcut(e, SHORTCUTS.voorlezen)) return;
      e.preventDefault();
      if (isSpeaking()) {
        stopSpeaking();
        return;
      }
      const { messages: all, speechOn: allowed, speechVoice: voice, rate } = readLatest.current;
      if (!allowed) {
        notify('Zet voorlezen eerst aan bij Toegankelijkheid.');
        return;
      }
      const answer = [...all].reverse().find((m) => m.role === 'assistant' && m.content.trim());
      if (!answer) {
        setStatus('Er is nog geen antwoord om voor te lezen.');
        return;
      }
      const result = speak(answer.id, toSpeakableText(answer.content), { voice, rate });
      if (result === 'geen-stem') notify.error(NO_VOICE_MESSAGE);
      if (result === 'niet-ondersteund') notify.error('Deze browser kan niet voorlezen.');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      stopSpeaking();
    };
  }, []);

  return (
    <>
      {/* Focusable without a tab stop, so "Naar beneden" can hand its focus here. */}
      <nldd-container ref={contentRef} tabIndex={-1} gap="24">
        {messages.map((message, i) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            isStreaming={streaming && i === messages.length - 1 && message.role === 'assistant'}
            // Alleen de rij die nu schrijft heeft de fase nodig; de rest krijgt
            // null, zodat een fasewissel niet elke rij opnieuw laat renderen.
            phase={streaming && i === messages.length - 1 ? (phase ?? null) : null}
            onRetry={onRetry}
            onContinue={onContinue}
            onRepair={streaming ? undefined : onRepair}
            canRetry={!streaming && i === messages.length - 1}
            fillsTurn={lastIsAnswerToQuestion && i === messages.length - 1}
            onEdit={!streaming && i === lastUserIndex ? onEdit : undefined}
            onImprove={onImprove}
            onSaveAsPrompt={onSaveAsPrompt}
            showNudge={message.id === nudgeMessageId}
            onNudgeDismiss={onNudgeDismiss}
          />
        ))}
      </nldd-container>

      {/* The status line a screen reader hears. nldd 0.18.0 has no visible status
          component that stays silent on screen, and the begin and end of an answer
          are already visible, so this one is hidden. */}
      <nldd-visually-hidden role="status" aria-atomic="true">
        {status}
      </nldd-visually-hidden>
    </>
  );
});

export default ChatMessageList;

const NO_VOICE_MESSAGE =
  'Er staat geen Nederlandse stem op dit apparaat. Kies er een bij Toegankelijkheid.';

/** Knop onder een antwoord; alleen zichtbaar als voorlezen in de instellingen aanstaat. */
function SpeakButton({ messageId, text }: { messageId: string; text: string }) {
  const { settings } = useAccessibility();
  const speechVoice = useSpeechVoice();
  const speakingId = useSpeakingId();
  const active = speakingId === messageId;

  function toggle() {
    if (active) {
      stopSpeaking();
      return;
    }
    const result = speak(messageId, toSpeakableText(text), {
      voice: speechVoice,
      rate: settings.speechRate,
    });
    if (result === 'geen-stem') notify.error(NO_VOICE_MESSAGE);
    if (result === 'niet-ondersteund') notify.error('Deze browser kan niet voorlezen.');
  }

  return (
    <nldd-button
      size="xs"
      appearance="neutral-transparent"
      start-icon={active ? 'speaker-slash' : 'speaker-volume-high'}
      text={active ? 'Stop voorlezen' : 'Voorlezen'}
      aria-pressed={active}
      onClick={toggle}
    ></nldd-button>
  );
}

/** Het bewerkveld van je laatste bericht. Enter verstuurt, Escape annuleert. */
function MessageEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const fieldRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(fieldRef, draft, setDraft);

  useNlddEvent<KeyboardEvent>(fieldRef, 'keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (draft.trim()) onSave(draft.trim());
    }
  });

  // The field has no autofocus of its own: focus the textarea in its shadow root
  // and put the caret after the last letter.
  useEffect(() => {
    const textarea = fieldRef.current?.shadowRoot?.querySelector('textarea');
    if (!textarea) {
      fieldRef.current?.focus();
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  return (
    <nldd-container gap="8">
      <nldd-multi-line-text-field
        ref={fieldRef}
        accessible-label="Bewerk je bericht"
        rows={Math.min(14, initial.split('\n').length + 1)}
      ></nldd-multi-line-text-field>
      <nldd-container layout="row" gap="8" horizontal-alignment="right">
        <nldd-button appearance="secondary" size="sm" text="Annuleren" onClick={onCancel}></nldd-button>
        <nldd-button
          appearance="primary"
          size="sm"
          start-icon="send"
          text="Versturen"
          onClick={() => {
            if (draft.trim()) onSave(draft.trim());
          }}
        ></nldd-button>
      </nldd-container>
    </nldd-container>
  );
}

/** Een eigen bericht: inklappen als het lang is, en bewerken als het het laatste is. */
function UserMessage({
  message,
  onEdit,
  onImprove,
  onSaveAsPrompt,
  showNudge,
  onNudgeDismiss,
}: {
  message: ChatMessage;
  onEdit?: (messageId: string, text: string) => void;
  onImprove?: (text: string) => void;
  onSaveAsPrompt?: (text: string) => void;
  showNudge?: boolean;
  onNudgeDismiss?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const editButtonRef = useRef<HTMLElement>(null);
  const nudgeRef = useRef<HTMLElement>(null);
  useNlddEvent(nudgeRef, 'dismiss', () => onNudgeDismiss?.());

  const lines = message.content.split('\n');
  const long = message.content.length > LONG_MESSAGE_CHARS || lines.length > LONG_MESSAGE_LINES;
  const collapsed = long && !expanded;
  const shown = collapsed
    ? `${lines.slice(0, COLLAPSED_LINES).join('\n').slice(0, COLLAPSED_CHARS).trimEnd()}…`
    : message.content;

  function cancelEdit() {
    setEditing(false);
    // De knop bestaat weer zodra React heeft gerenderd.
    setTimeout(() => editButtonRef.current?.focus(), 0);
  }

  function saveEdit(value: string) {
    if (!value || !onEdit) return;
    setEditing(false);
    onEdit(message.id, value);
  }

  return (
    <nldd-container data-message-id={message.id} gap="4" horizontal-alignment="right">
      <nldd-visually-hidden>
        <nldd-title heading-level={2} text="Jouw bericht"></nldd-title>
      </nldd-visually-hidden>

      {editing ? (
        <MessageEditor initial={message.content} onCancel={cancelEdit} onSave={saveEdit} />
      ) : (
        <nldd-container width="fit-content" max-width="85%">
          <nldd-box background="accent-tinted">
            {/* fit-content here too: a container is an inline-size query container,
                and inside a fit-content parent it would size itself to zero. */}
            <nldd-container width="fit-content" padding-inline="16" padding-block="10" gap="4">
              <nldd-text size="lg" line-height="loose">
                {withBreaks(shown)}
              </nldd-text>
              {long && (
                <nldd-button
                  size="xs"
                  appearance="accent-transparent"
                  text={expanded ? 'Toon minder' : 'Toon alles'}
                  expanded={expanded || undefined}
                  onClick={() => setExpanded((v) => !v)}
                ></nldd-button>
              )}
            </nldd-container>
          </nldd-box>
        </nldd-container>
      )}

      {message.content.trim() && !editing && (
        <nldd-container layout="wrap" gap="4" horizontal-alignment="right">
          <CopyMessageButton text={message.content} label="" />
          {onEdit && (
            <nldd-button
              ref={editButtonRef}
              size="xs"
              appearance="neutral-transparent"
              start-icon="pencil"
              text="Bewerk"
              onClick={() => setEditing(true)}
            ></nldd-button>
          )}
          {onImprove && (
            <nldd-tooltip text="Maak hier in de generator een sterkere, herbruikbare prompt van">
              <nldd-button
                size="xs"
                appearance="neutral-transparent"
                start-icon="magic"
                text="Verbeter in generator"
                onClick={() => onImprove(message.content)}
              ></nldd-button>
            </nldd-tooltip>
          )}
          {onSaveAsPrompt && (
            <nldd-tooltip text="Sla dit bericht op als prompt in de bibliotheek">
              <nldd-button
                size="xs"
                appearance="neutral-transparent"
                start-icon="save"
                text="Bewaar als prompt"
                onClick={() => onSaveAsPrompt(message.content)}
              ></nldd-button>
            </nldd-tooltip>
          )}
        </nldd-container>
      )}

      {/* De bouw-een-prompt-tip: dit bericht leek een opdracht zonder
          structuur (zie looksLikeMessyPrompt). Subtiel, en definitief weg te
          klikken. */}
      {showNudge && onImprove && (
        <nldd-banner
          ref={nudgeRef}
          size="sm"
          variant="accent"
          icon="lightbulb"
          text="Tip: dit lijkt op een opdracht."
          supporting-text="In de generator bouw je er een sterkere, herbruikbare prompt van."
          dismissible={onNudgeDismiss ? true : undefined}
        >
          <nldd-button
            slot="actions"
            appearance="secondary"
            end-icon="arrow-right"
            text="Bouw in generator"
            onClick={() => onImprove(message.content)}
          ></nldd-button>
        </nldd-banner>
      )}
    </nldd-container>
  );
}

const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isStreaming,
  phase,
  onRetry,
  onContinue,
  onRepair,
  canRetry,
  fillsTurn,
  onEdit,
  onImprove,
  onSaveAsPrompt,
  showNudge,
  onNudgeDismiss,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  phase?: string | null;
  onRetry: () => void;
  onContinue?: () => void;
  onRepair?: (text: string) => void;
  canRetry: boolean;
  /** Dit antwoord hoort bij de laatste vraag en vult de rest van het venster. */
  fillsTurn: boolean;
  onEdit?: (messageId: string, text: string) => void;
  onImprove?: (text: string) => void;
  onSaveAsPrompt?: (text: string) => void;
  showNudge?: boolean;
  onNudgeDismiss?: () => void;
}) {
  const { speechOn } = useAccessibility();

  if (message.role === 'user') {
    return (
      <UserMessage
        message={message}
        onEdit={onEdit}
        onImprove={onImprove}
        onSaveAsPrompt={onSaveAsPrompt}
        showNudge={showNudge}
        onNudgeDismiss={onNudgeDismiss}
      />
    );
  }

  return (
    <nldd-container data-turn-row data-turn-fill={fillsTurn || undefined} gap="8">
      <nldd-visually-hidden>
        <nldd-title heading-level={2} text="Antwoord"></nldd-title>
      </nldd-visually-hidden>

      {message.content ? (
        <ChatAnswer text={message.content} isStreaming={isStreaming} onRepair={onRepair} />
      ) : isStreaming ? (
        <nldd-text size="lg" color="secondary">
          {phase === 'searching'
            ? 'Aan het zoeken op internet…'
            : phase === 'sources'
              ? 'Bronnen doorzoeken…'
              : 'Aan het nadenken…'}
        </nldd-text>
      ) : null}

      {/* De bronnen waarmee dit antwoord is geschreven. Staan er los onder, ook
          al noemt het model ze meestal zelf in de tekst: hier zijn het echte
          links die je kunt aanklikken om na te lezen of het klopt. De nummering
          loopt gelijk met de [1]-verwijzingen in het antwoord. */}
      {!isStreaming && message.sources && message.sources.length > 0 && (
        <nldd-container gap="4">
          <nldd-container layout="row" gap="4" vertical-alignment="center">
            <nldd-icon icon="globe" size="16" color="secondary-content"></nldd-icon>
            <nldd-text size="xs" weight="bold" color="secondary">
              Bronnen van internet
            </nldd-text>
          </nldd-container>
          {message.sources.map((source, i) => (
            <nldd-text key={source.url} size="xs" color="secondary">
              [{i + 1}]{' '}
              <nldd-tooltip text={source.url}>
                <nldd-link href={source.url} target="_blank" text={source.title}></nldd-link>
              </nldd-tooltip>
            </nldd-text>
          ))}
        </nldd-container>
      )}

      {!isStreaming && message.projectSources && message.projectSources.length > 0 && (
        <nldd-container gap="4">
          <nldd-container layout="row" gap="4" vertical-alignment="center">
            <nldd-icon icon="file-text" size="16" color="secondary-content"></nldd-icon>
            <nldd-text size="xs" weight="bold" color="secondary">
              Stukken uit je bestanden
            </nldd-text>
          </nldd-container>
          {message.projectSources.map((name) => (
            <nldd-text key={name} size="xs" color="secondary">
              {name}
            </nldd-text>
          ))}
        </nldd-container>
      )}

      {!isStreaming && message.content.trim() && (
        <nldd-container layout="wrap" gap="4">
          <CopyMessageButton text={message.content} label="Kopieer antwoord" />
          {canRetry && !message.error && !message.madeBy && (
            <nldd-tooltip text="Laat de AI dit antwoord opnieuw schrijven">
              <nldd-button
                size="xs"
                appearance="neutral-transparent"
                start-icon="arrow-2-counter-clockwise"
                text="Schrijf opnieuw"
                onClick={onRetry}
              ></nldd-button>
            </nldd-tooltip>
          )}
          {speechOn && <SpeakButton messageId={message.id} text={message.content} />}
        </nldd-container>
      )}

      {/* Een lang antwoord gaat in meerdere rondes; tussen twee rondes is het
          even stil en zonder uitleg lijkt het dan of de chat is gestopt. */}
      {isStreaming && phase === 'continuing' && message.content && (
        <nldd-text size="xs" color="secondary">
          Lang antwoord, de AI schrijft verder…
        </nldd-text>
      )}

      {message.stopped && (
        <nldd-text size="xs" color="secondary">
          Gestopt door jou.
        </nldd-text>
      )}

      {/* Niet af: gestopt, of ook na het automatisch verderschrijven nog niet
          klaar. "Ga verder" pakt het op vanaf de laatste letter, zonder dat je
          het zelf hoeft te vragen. */}
      {canRetry && onContinue && (message.incomplete || message.stopped) && message.content.trim() && (
        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          {message.incomplete && !message.error && (
            <nldd-text size="xs" color="secondary">
              Het antwoord is nog niet af.
            </nldd-text>
          )}
          <nldd-button
            size="xs"
            appearance="accent-transparent"
            start-icon="arrow-right"
            text="Ga verder"
            onClick={onContinue}
          ></nldd-button>
        </nldd-container>
      )}

      {message.error && (
        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          <nldd-icon icon="exclamation-triangle" size="16" color="critical"></nldd-icon>
          <nldd-text size="sm" color="critical">
            {message.error}
          </nldd-text>
          {canRetry && !message.incomplete && (
            <nldd-button
              size="xs"
              appearance="accent-transparent"
              start-icon="arrow-2-counter-clockwise"
              text="Opnieuw proberen"
              onClick={onRetry}
            ></nldd-button>
          )}
        </nldd-container>
      )}
    </nldd-container>
  );
});
