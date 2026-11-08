import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  FileText,
  Globe,
  Lightbulb,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  prefersReducedMotion,
  useAccessibility,
  useSpeechVoice,
} from '@/context/AccessibilityContext';
import { isConversationActive } from '@/lib/conversationMode';
import { matchesShortcut, SHORTCUTS } from '@/lib/shortcuts';
import { isSpeaking, speak, stopSpeaking, toSpeakableText, useSpeakingId } from '@/lib/speech';
import ChatAnswer from './ChatAnswer';
import CopyMessageButton from './CopyMessageButton';
import type { ChatMessage } from '@/types';

/** Ruimte boven de vraag zodra die bovenaan staat; gelijk aan de `py-4` van de lijst. */
const LIST_PADDING = 16;
/** Zo veel tekst onder beeld hoort er te zijn voordat de knop "Naar beneden" komt. */
const JUMP_THRESHOLD = 48;
/** Eigen berichten boven deze omvang klappen in: het zijn vaak hele prompts. */
const LONG_MESSAGE_CHARS = 800;
const LONG_MESSAGE_LINES = 12;

/**
 * De berichtenlijst van de chat. Elke rij is gememoïseerd: tijdens het streamen
 * verandert alleen het laatste bericht, dus alleen die rij rendert opnieuw.
 */
export default function ChatMessageList({
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
}: {
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
  /**
   * "Verbeter in generator" op eigen berichten (omgekeerde handoff). Niet
   * meegegeven (bijv. in de Testkamer — je bent daar al in de generator) =
   * geen actie zichtbaar.
   */
  onImprove?: (text: string) => void;
  /** "Bewaar als prompt": sla een eigen bericht op in de bibliotheek. */
  onSaveAsPrompt?: (text: string) => void;
  /** Onder dit eigen bericht staat de bouw-een-prompt-tip (zie ChatPage). */
  nudgeMessageId?: string | null;
  onNudgeDismiss?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [status, setStatus] = useState('');
  const { settings, speechOn } = useAccessibility();
  const speechVoice = useSpeechVoice();

  // De knop "Naar beneden" zet volgen aan; omhoog scrollen zet het weer uit.
  const followRef = useRef(false);
  const lastTopRef = useRef(0);
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;

  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const lastUserId = lastUserIndex >= 0 ? messages[lastUserIndex].id : null;
  const lastIsAnswerToQuestion =
    lastUserIndex >= 0 && lastUserIndex === messages.length - 2;

  /**
   * De laatste beurt vult minstens de hele lijst. Alleen dan is er genoeg ruimte
   * om de vraag bovenaan te zetten terwijl het antwoord nog kort is. Staat als
   * CSS-variabele op de lijst, zodat de maat meteen geldt en de rijen niet
   * opnieuw hoeven te renderen.
   */
  const fitLastTurn = useCallback(() => {
    const list = scrollRef.current;
    if (!list || !lastUserId) return;
    const row = list.querySelector<HTMLElement>(`[data-message-id="${lastUserId}"]`);
    if (!row) return;
    const fill = list.clientHeight - row.getBoundingClientRect().height - 2 * LIST_PADDING - 24;
    list.style.setProperty('--turn-fill', `${Math.max(0, fill)}px`);
  }, [lastUserId]);

  // Een nieuwe vraag gaat bovenaan staan en daarna blijft het scherm stil: het
  // antwoord groeit eronder en je leest in je eigen tempo vanaf het begin. Ook
  // een geopend gesprek begint bij de laatste vraag.
  useLayoutEffect(() => {
    const list = scrollRef.current;
    if (!list || !lastUserId) return;
    followRef.current = false;
    stopSpeaking();
    fitLastTurn();
    const row = list.querySelector<HTMLElement>(`[data-message-id="${lastUserId}"]`);
    if (!row) return;
    const offset = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo({
      top: list.scrollTop + offset - LIST_PADDING,
      behavior: streamingRef.current && !prefersReducedMotion() ? 'smooth' : 'auto',
    });
  }, [lastUserId, fitLastTurn]);

  useEffect(() => {
    const list = scrollRef.current;
    const content = contentRef.current;
    if (!list || !content) return;

    const syncJump = () =>
      setShowJump(list.scrollHeight - list.scrollTop - list.clientHeight > JUMP_THRESHOLD);

    const onResize = () => {
      fitLastTurn();
      if (followRef.current) list.scrollTop = list.scrollHeight;
      syncJump();
    };

    const onScroll = () => {
      if (list.scrollTop < lastTopRef.current - 2) followRef.current = false;
      lastTopRef.current = list.scrollTop;
      syncJump();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(list);
    observer.observe(content);
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', onScroll);
    };
  }, [fitLastTurn]);

  function jumpToEnd() {
    const list = scrollRef.current;
    if (!list) return;
    followRef.current = streaming;
    list.scrollTo({
      top: list.scrollHeight,
      behavior: streaming || prefersReducedMotion() ? 'auto' : 'smooth',
    });
    // De knop verdwijnt zo meteen; de focus mag niet met hem mee verdwijnen.
    list.focus({ preventScroll: true });
  }

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
      if (result === 'geen-stem') toast.error(NO_VOICE_MESSAGE);
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
        toast('Zet voorlezen eerst aan bij Toegankelijkheid.');
        return;
      }
      const answer = [...all].reverse().find((m) => m.role === 'assistant' && m.content.trim());
      if (!answer) {
        setStatus('Er is nog geen antwoord om voor te lezen.');
        return;
      }
      const result = speak(answer.id, toSpeakableText(answer.content), { voice, rate });
      if (result === 'geen-stem') toast.error(NO_VOICE_MESSAGE);
      if (result === 'niet-ondersteund') toast.error('Deze browser kan niet voorlezen.');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      stopSpeaking();
    };
  }, []);

  return (
    <div className="relative flex min-h-0 flex-auto flex-col">
      {/* Bereikbaar met het toetsenbord, zodat de pijltjes en PageDown het gesprek
          scrollen. Zie de status hieronder voor wat een schermlezer hoort. */}
      <div
        ref={scrollRef}
        data-chat-lijst
        tabIndex={0}
        role="region"
        aria-label="Gesprek"
        aria-busy={streaming}
        className="opl-scroll-slim min-h-0 flex-auto overflow-y-auto px-4 py-4 [scrollbar-gutter:stable_both-edges] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rijksblauw-500 sm:px-6"
      >
        {/* Vaste leeskolom: 60ch is in Rijks Sans zo'n 72 tekens per regel (gemeten),
            en onder de 75 leest het oog het prettigst. De schuifbalk blijft wel aan
            de rand van de kaart. */}
        <div ref={contentRef} className="mx-auto max-w-[60ch] space-y-6">
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
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={jumpToEnd}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-rijksblauw-700 shadow-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500 dark:border-slate-600 dark:bg-slate-800 dark:text-rijksblauw-200 dark:hover:bg-slate-700"
        >
          <ArrowDown size={15} /> Naar beneden
        </button>
      )}

      <div role="status" aria-atomic="true" className="sr-only">
        {status}
      </div>
    </div>
  );
}

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
    if (result === 'geen-stem') toast.error(NO_VOICE_MESSAGE);
    if (result === 'niet-ondersteund') toast.error('Deze browser kan niet voorlezen.');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-rijksblauw-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-200"
    >
      {active ? <VolumeX size={12} /> : <Volume2 size={12} />}
      {active ? 'Stop voorlezen' : 'Voorlezen'}
    </button>
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
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const long =
    message.content.length > LONG_MESSAGE_CHARS ||
    message.content.split('\n').length > LONG_MESSAGE_LINES;
  const collapsed = long && !expanded;

  useEffect(() => {
    if (!editing) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  function startEdit() {
    setDraft(message.content);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    // De knop bestaat weer zodra React heeft gerenderd.
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  function saveEdit() {
    const value = draft.trim();
    if (!value || !onEdit) return;
    setEditing(false);
    onEdit(message.id, value);
  }

  return (
    <div data-message-id={message.id} className="group flex flex-col items-end">
      <h2 className="sr-only">Jouw bericht</h2>

      {editing ? (
        <div className="w-full">
          <textarea
            ref={editorRef}
            value={draft}
            aria-label="Bewerk je bericht"
            rows={Math.min(14, draft.split('\n').length + 1)}
            className="opl-input !text-base leading-7"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                cancelEdit();
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                saveEdit();
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="opl-btn-ghost !px-3 !py-1.5" onClick={cancelEdit}>
              Annuleren
            </button>
            <button
              type="button"
              className="opl-btn-primary !px-3 !py-1.5"
              disabled={!draft.trim()}
              onClick={saveEdit}
            >
              <Send size={14} /> Versturen
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-rijksblauw-50 px-4 py-2.5 text-base leading-7 text-slate-900 dark:bg-rijksblauw-500/15 dark:text-slate-100">
          <div
            className={clsx(
              'whitespace-pre-wrap break-words',
              collapsed &&
                'max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_65%,transparent)]',
            )}
          >
            {message.content}
          </div>
          {long && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-sm font-medium text-rijksblauw-700 hover:underline dark:text-rijksblauw-200"
            >
              {expanded ? 'Toon minder' : 'Toon alles'}
            </button>
          )}
        </div>
      )}

      {/* Acties onder het eigen bericht verschijnen bij de muis of toetsenbordfocus,
          zodat het gesprek rustig blijft. In de instellingen kun je ze altijd
          tonen; onzichtbaar zijn ze alleen voor het oog, niet voor de tabvolgorde. */}
      {message.content.trim() && !editing && (
        <div className="opl-msg-actions mt-1 flex flex-wrap items-center justify-end gap-x-3">
          <CopyMessageButton text={message.content} label="" />
          {onEdit && (
            <button
              ref={editButtonRef}
              type="button"
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-600 hover:text-rijksblauw-700 dark:text-slate-300 dark:hover:text-rijksblauw-200"
              onClick={startEdit}
            >
              <Pencil size={12} /> Bewerk
            </button>
          )}
          {onImprove && (
            <button
              type="button"
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-600 hover:text-rijksblauw-700 dark:text-slate-300 dark:hover:text-rijksblauw-200"
              onClick={() => onImprove(message.content)}
              title="Maak hier in de generator een sterkere, herbruikbare prompt van"
            >
              <Wand2 size={12} /> Verbeter in generator
            </button>
          )}
          {onSaveAsPrompt && (
            <button
              type="button"
              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-600 hover:text-rijksblauw-700 dark:text-slate-300 dark:hover:text-rijksblauw-200"
              onClick={() => onSaveAsPrompt(message.content)}
              title="Sla dit bericht op als prompt in de bibliotheek"
            >
              <Save size={12} /> Bewaar als prompt
            </button>
          )}
        </div>
      )}

      {/* De bouw-een-prompt-tip: dit bericht leek een opdracht zonder
          structuur (zie looksLikeMessyPrompt). Subtiel, en definitief weg te
          klikken. */}
      {showNudge && onImprove && (
        // Vaste opbouw, op elke breedte gelijk: lampje en tekst links, het kruisje
        // rechtsboven, de knop recht onder de tekst. Geen flex-wrap, want dan
        // springt de knop per schermbreedte naar een andere plek.
        <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/60 py-2 pl-3 pr-1 text-xs text-slate-600 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10 dark:text-slate-300">
          <Lightbulb size={14} className="mt-px shrink-0 text-pleingroen" />
          <div className="min-w-0 flex-1">
            <p>
              Tip: dit lijkt op een opdracht. In de generator bouw je er een sterkere, herbruikbare
              prompt van.
            </p>
            <button
              type="button"
              className="mt-1.5 inline-flex items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={() => onImprove(message.content)}
            >
              Bouw in generator <ArrowRight size={12} />
            </button>
          </div>
          {onNudgeDismiss && (
            <button
              type="button"
              className="flex shrink-0 items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              onClick={onNudgeDismiss}
              aria-label="Verberg deze tip voortaan"
              title="Verberg deze tip voortaan"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
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
  /** Dit antwoord hoort bij de laatste vraag en vult de rest van de lijst. */
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
    <div
      className={clsx(
        'group flex flex-col items-start gap-2',
        fillsTurn && 'min-h-[var(--turn-fill,0px)]',
      )}
    >
      <h2 className="sr-only">Antwoord</h2>
      <div
        className={clsx(
          'w-full text-base leading-7 text-slate-800 dark:text-slate-100',
          message.error && !message.content && 'text-rijksrood dark:text-red-400',
        )}
      >
        {message.content ? (
          <ChatAnswer text={message.content} isStreaming={isStreaming} onRepair={onRepair} />
        ) : isStreaming ? (
          <span className="text-slate-500 dark:text-slate-400">
            {phase === 'searching'
              ? 'Aan het zoeken op internet…'
              : phase === 'sources'
                ? 'Bronnen doorzoeken…'
                : 'Aan het nadenken…'}
          </span>
        ) : null}
      </div>

      {/* Kopieerknop onder het antwoord: dit is de tekst waar de gebruiker voor
          kwam, dus die moet in één klik mee naar een document of e-mail. Pas
          zichtbaar zodra het antwoord af is — halverwege kopiëren levert een
          afgekapte tekst op. */}
      {/* De bronnen waarmee dit antwoord is geschreven. Staan er los onder, ook
          al noemt het model ze meestal zelf in de tekst: hier zijn het echte
          links die je kunt aanklikken om na te lezen of het klopt. De nummering
          loopt gelijk met de [1]-verwijzingen in het antwoord. */}
      {!isStreaming && message.sources && message.sources.length > 0 && (
        <div className="mt-1 w-full">
          <p className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Globe size={12} className="shrink-0" />
            Bronnen van internet
          </p>
          <ol className="space-y-0.5">
            {message.sources.map((source, i) => (
              <li key={source.url} className="flex gap-1.5 text-xs">
                <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
                  [{i + 1}]
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 truncate text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  title={source.url}
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!isStreaming && message.projectSources && message.projectSources.length > 0 && (
        <div className="mt-1 w-full">
          <p className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <FileText size={12} className="shrink-0" />
            Stukken uit je bestanden
          </p>
          <ul className="space-y-0.5">
            {message.projectSources.map((name) => (
              <li key={name} className="truncate text-xs text-slate-600 dark:text-slate-300">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Onder het laatste antwoord altijd in beeld; bij oudere pas bij de muis
          of toetsenbordfocus, anders staat er na elk antwoord dezelfde rij. */}
      {!isStreaming && message.content.trim() && (
        <div
          className={clsx('-ml-1.5 flex flex-wrap items-center gap-2', !canRetry && 'opl-msg-actions')}
        >
          <CopyMessageButton text={message.content} label="Kopieer antwoord" />
          {canRetry && !message.error && !message.madeBy && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-rijksblauw-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-200"
              title="Laat de AI dit antwoord opnieuw schrijven"
            >
              <RotateCcw size={12} /> Opnieuw
            </button>
          )}
          {speechOn && <SpeakButton messageId={message.id} text={message.content} />}
        </div>
      )}

      {/* Een lang antwoord gaat in meerdere rondes; tussen twee rondes is het
          even stil en zonder uitleg lijkt het dan of de chat is gestopt. */}
      {isStreaming && phase === 'continuing' && message.content && (
        <p className="text-[0.6875rem] text-slate-400 dark:text-slate-500">
          Lang antwoord, de AI schrijft verder…
        </p>
      )}

      {message.stopped && (
        <p className="text-[0.6875rem] text-slate-400 dark:text-slate-500">Gestopt door jou.</p>
      )}

      {/* Niet af: gestopt, of ook na het automatisch verderschrijven nog niet
          klaar. "Ga verder" pakt het op vanaf de laatste letter, zonder dat je
          het zelf hoeft te vragen. */}
      {canRetry && onContinue && (message.incomplete || message.stopped) && message.content.trim() && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {message.incomplete && !message.error && <span>Het antwoord is nog niet af.</span>}
          <button
            type="button"
            className="inline-flex items-center gap-1 font-medium text-rijksblauw-700 hover:underline dark:text-rijksblauw-200"
            onClick={onContinue}
          >
            <ArrowRight size={12} /> Ga verder
          </button>
        </div>
      )}

      {message.error && (
        <div className="flex items-center gap-2 text-xs text-rijksrood dark:text-red-400">
          <AlertTriangle size={14} />
          <span>{message.error}</span>
          {canRetry && !message.incomplete && (
            <button
              type="button"
              className="inline-flex items-center gap-1 font-medium text-rijksblauw-700 hover:underline dark:text-rijksblauw-200"
              onClick={onRetry}
            >
              <RotateCcw size={12} /> Opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
});

