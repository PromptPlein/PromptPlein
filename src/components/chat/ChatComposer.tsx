import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import InfoDot from '@/components/common/InfoDot';
import DictationButton from '@/components/common/DictationButton';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import { parseRoutekaart } from '@/lib/routekaart';
import { hasMemoryTrigger } from '@/lib/memoryTriggers';
import ComposerPlusMenu from './ComposerPlusMenu';
import ConversationToggle from './ConversationToggle';
import { useChatVoice } from './useChatVoice';
import { MAX_CHAT_ATTACHMENTS, MAX_CHAT_ATTACHMENT_BYTES } from './useChatController';
import type { ChatAttachment } from '@/types';

const MAX_MB = MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024);

/**
 * Upper bound of the field in rows. Above it the field stops growing and scrolls
 * inside, or a long text would push the conversation above it out of view.
 */
const MAX_ROWS = 8;
/** The enlarged field, in rows. */
const ENLARGED_ROWS = 16;
/** Rough characters per row, to count wrapped lines as rows. */
const CHARS_PER_ROW = 60;
/**
 * Een invulplek tussen haken. `[ontbreekt]` hoort daar niet bij: dat is een woord
 * dat de AI zelf gebruikt als iets niet in de bronnen staat.
 */
const SLOT = /\[(?!ontbreekt\])[^\]\n]+\]/;

/** Rows a text needs: its lines, with long lines counted as the rows they wrap to. */
function rowsFor(text: string): number {
  return text
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_ROW)), 0);
}

/** Uitkomst van een verbeterslag op de getypte tekst. */
export interface OptimizeResult {
  text: string;
  changed: boolean;
  error?: string;
}

/**
 * Greep op het invoerveld van buitenaf. Nodig voor de startsjablonen in een leeg
 * gesprek: die zetten hun tekst kláár in het veld — versturen doet de gebruiker
 * zelf, nadat hij de invulplekken heeft ingevuld.
 */
export interface ChatComposerHandle {
  /** Zet `text` in het veld, geeft focus en zet de cursor achter de tekst. */
  fill: (text: string) => void;
  /** Zet een gemaakte prompt in het veld, ruim in beeld en met een korte uitleg. */
  fillPrompt: (text: string, made: { framework?: string; reden?: string }) => void;
  /** Wat er nu in het veld staat. */
  getText: () => string;
  /** Zet de cursor achter de tekst, tenzij hij al in het veld staat. */
  focus: () => void;
  /** Opent de bestandskiezer, net als de paperclip. */
  openFilePicker: () => void;
}

interface ChatComposerProps {
  /** Volledig uitgeschakeld (bijv. chat uitgezet of geen AI-service). */
  disabled: boolean;
  /** Tekst in het lege vak zolang het uitgeschakeld is; standaard "laden". */
  disabledPlaceholder?: string;
  /** Eigen tekst in het lege vak, bijvoorbeeld als het een antwoord op een vraag wordt. */
  placeholder?: string;
  streaming: boolean;
  extracting: boolean;
  attachments: ChatAttachment[];
  onSend: (text: string) => void;
  onStop: () => void;
  /**
   * Voegt één bestand toe. Geeft een promise terug wanneer de aanroeper hem
   * heeft: meerdere gesleepte bestanden gaan dan netjes één voor één.
   */
  onAddFile: (file: File) => void | Promise<void>;
  onRemoveAttachment: (id: string) => void;
  /**
   * Verbetert de getypte tekst. Afwezig = geen sterretje (bijv. wanneer de
   * beheerder de functie uit heeft staan). Mag nooit gooien: bij een fout hoort
   * de oorspronkelijke tekst terug te komen met een melding.
   */
  onOptimize?: (text: string) => Promise<OptimizeResult>;
  /** De modelbadge, rechtsonder in de chat weergegeven. */
  badge?: ReactNode;
  /** Korte waarschuwing die altijd bij het tekstvak hoort, links van de badge. */
  notice?: ReactNode;
  /**
   * Toon onder het veld dat het bericht in het geheugen komt zodra er een woord
   * als "voortaan" of "onthoud" in staat. Uit in een uitvoergesprek.
   */
  memoryHint?: boolean;
  /** Het vak is vergroot: een lege chat maakt dan plaats voor de tekst. */
  onEnlargedChange?: (enlarged: boolean) => void;
  /** Bijlagen toestaan? De Testkamer zet dit uit: daar test je de prompt zelf. */
  allowAttachments?: boolean;
  /**
   * Opent het projectvenster: project en bronnen kiezen, of meteen een context
   * prompt maken. Afwezig = geen knop Projecten en geen plusregels daarvoor.
   */
  onContext?: (start: 'context' | 'taak') => void;
  /** De naam van het project van dit gesprek; staat dan op de knop Projecten. */
  activeProjectName?: string;
  /**
   * Staat de denkstand aan? Afwezige {@link onToggleThinking} = geen knop, net
   * als bij het sterretje.
   */
  thinking?: boolean;
  /** Zet denken aan of uit voor de volgende beurt. */
  onToggleThinking?: (value: boolean) => void;
  /**
   * Staat er iets, dan kan het ingestelde model niet denken: de knop blijft
   * staan maar is uit, met deze tekst als uitleg. Zie {@link ThinkingToggle}.
   */
  thinkingUnavailable?: string;
  /**
   * Staat "Zoeken op internet" aan? Afwezige {@link onToggleWebSearch} = geen
   * knop; zo verdwijnt hij zodra de beheerder de functie uitzet.
   */
  webSearch?: boolean;
  /** Zet zoeken op internet aan of uit voor de volgende beurt. */
  onToggleWebSearch?: (value: boolean) => void;
  /**
   * Nog geen bericht in dit gesprek? Dan is het invoerveld het enige waar de
   * gebruiker iets moet doen: het krijgt een opvallender rand, een ruimer
   * tekstvak en een placeholder die zegt wat er van hem verwacht wordt.
   */
  prominent?: boolean;
  /**
   * Staat er een routekaart in het veld (het inhoudsblok van het sjabloon
   * Routekaart), dan biedt de balk aan hem direct te maken met de vaste
   * routekaart, zonder AI. Afwezig = geen aanbod.
   */
  onRoutekaart?: (text: string) => void;
}

/**
 * Invoerbalk van de chat: tekstveld (Enter = verzenden, Shift+Enter = nieuwe
 * regel), bijlagen (paperclip + chips) en de stop-knop tijdens het streamen.
 *
 * Het tekstvak begint op één regel en groeit mee met wat je typt, tot
 * {@link MAX_HEIGHT}. Daarboven scrollt het van binnen, zodat het gesprek
 * erboven zichtbaar blijft. Er is geen greep om zelf te slepen: het vak weet
 * zelf hoeveel ruimte de tekst nodig heeft.
 *
 * Staat er tekst in het veld en is `onOptimize` meegegeven, dan verschijnt
 * rechtsboven het oranje sterretje: één klik en de AI herschrijft wat er staat
 * tot een scherpere vraag. De oorspronkelijke tekst blijft daarna één klik weg.
 */
/** Aanraakscherm zonder toetsenbord erbij: Enter betekent daar iets anders. */
const touchKeyboard =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  {
    disabled,
    disabledPlaceholder,
    placeholder,
    streaming,
    extracting,
    attachments,
    onSend,
    onStop,
    onAddFile,
    onRemoveAttachment,
    onOptimize,
    badge,
    notice,
    memoryHint = false,
    onEnlargedChange,
    allowAttachments = true,
    onContext,
    activeProjectName,
    thinking = false,
    onToggleThinking,
    thinkingUnavailable,
    webSearch = false,
    onToggleWebSearch,
    prominent = false,
    onRoutekaart,
  },
  ref,
) {
  // Wat je typt, overleeft een refresh of per ongeluk gesloten tab.
  const [text, setText, clearText] = usePersistentDraft('chatComposer');
  // Lange prompts zijn hier de hoofdzaak, dus het vak mag groter als de tekst
  // niet meer past.
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => onEnlargedChange?.(enlarged), [enlarged, onEnlargedChange]);
  // Een leeg vak hoeft niet groot te zijn: de begroeting van een lege chat komt
  // dan ook weer terug.
  useEffect(() => {
    if (!text) setEnlarged(false);
  }, [text]);
  // Een routekaart herken je aan het inhoudsblok: een regel KOP, haltes en FINISH.
  const isRoutekaart = useMemo(
    () => Boolean(onRoutekaart) && /^\s*KOP\s*$/m.test(text) && parseRoutekaart(text) !== null,
    [onRoutekaart, text],
  );
  const [optimizing, setOptimizing] = useState(false);
  // Sleept de gebruiker op dit moment bestanden boven het veld?
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  // De tekst van vóór de laatste verbetering, met wat eruit kwam. Zolang het
  // veld nog exact het resultaat bevat, kan de gebruiker terug.
  const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
    null,
  );
  // Een gemaakte prompt die net is binnengekomen. Zolang hij ongewijzigd in het
  // veld staat, zegt de regel eronder waar hij vandaan komt.
  const [madePrompt, setMadePrompt] = useState<{
    text: string;
    before: string;
    framework?: string;
    reden?: string;
  } | null>(null);
  const fieldRef = useRef<HTMLElement & { value?: string }>(null);
  // The voice hook, dictation and caret placement need the native textarea, which
  // nldd-multi-line-text-field keeps in its shadow root. Resolved on every read,
  // because the field renders it asynchronously.
  const textareaRef = useMemo<RefObject<HTMLTextAreaElement>>(
    () => ({
      get current() {
        return fieldRef.current?.shadowRoot?.querySelector('textarea') ?? null;
      },
    }),
    [],
  );
  /** The native textarea, brought in step with the value React just set. */
  function inner(): HTMLTextAreaElement | null {
    const el = textareaRef.current;
    const value = fieldRef.current?.value;
    if (el && value !== undefined && el.value !== value) el.value = value;
    return el;
  }

  // Inspreken: de uitgeschreven tekst komt op de plek van de cursor, en
  // versturen blijft een eigen handeling, zodat je eerst kunt nalezen.
  const dictation = useChatVoice({
    textareaRef,
    disabled,
    streaming,
    onSubmit: (value) => {
      clearText();
      setBeforeOptimize(null);
      setEnlarged(false);
      onSend(value);
    },
  });
  const { cancel: cancelDictation, state: dictationState } = dictation;

  // Esc tijdens het opnemen breekt af zonder uit te schrijven.
  useEffect(() => {
    if (dictationState !== 'recording') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') cancelDictation();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dictationState, cancelDictation]);

  const neededRows = rowsFor(text);
  const overflowing = neededRows > MAX_ROWS;
  const rows = enlarged
    ? ENLARGED_ROWS
    : Math.max(prominent ? 2 : 1, Math.min(MAX_ROWS, neededRows));

  // React's onChange never reaches an nldd field: the value comes in through the
  // element's own input event.
  useNlddValue(fieldRef, text, (value) => {
    setText(value);
    // Een @ als allereerste teken is een commando, geen tekst: dat opent
    // de context. Verderop in een zin (een e-mailadres, een naam) doen
    // we niets, anders zou hij bij elk adres opengaan.
    if (value === '@' && onContext) {
      clearText();
      onContext('context');
    }
  });
  useNlddEvent<KeyboardEvent>(fieldRef, 'keydown', (e) => {
    // Enter verzendt; Shift+Enter maakt een nieuwe regel.
    // Tijdens samenstellen van een teken bevestigt Enter dat teken.
    // Op het schermtoetsenbord blijft de returntoets een nieuwe regel, zoals
    // in elke berichtenapp: versturen doe je met de knop Verstuur.
    if (e.key === 'Enter' && !touchKeyboard && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  /** Opens the file dialog. A native picker only opens from a real input, made here instead of in the markup. */
  function pickFile() {
    if (!allowAttachments) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_DOC_ACCEPT;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void onAddFile(file);
    };
    input.click();
  }

  // Van buitenaf tekst klaarzetten (startsjablonen). Focussen doen we pas nadat
  // React de nieuwe waarde in het veld heeft gezet — anders zou de cursor nog op
  // de oude, lege tekst worden gezet.
  // Waar de cursor na het invullen komt. Een prompt lees je vanaf het begin.
  const focusAfterFill = useRef<'start' | 'end' | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      fill(value: string) {
        setText(value);
        setBeforeOptimize(null);
        focusAfterFill.current = 'end';
      },
      fillPrompt(value: string, made: { framework?: string; reden?: string }) {
        setMadePrompt({ text: value, before: fieldRef.current?.value ?? '', ...made });
        setBeforeOptimize(null);
        setText(value);
        setEnlarged(true);
        focusAfterFill.current = 'start';
      },
      getText: () => fieldRef.current?.value ?? '',
      openFilePicker() {
        pickFile();
      },
      focus() {
        const el = inner();
        if (!el || fieldRef.current?.shadowRoot?.activeElement === el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setText, allowAttachments, onAddFile],
  );
  useLayoutEffect(() => {
    const place = focusAfterFill.current;
    if (!place) return;
    focusAfterFill.current = null;
    const el = inner();
    if (!el) return;
    el.focus();
    // Staat er een invulplek tussen [haken], selecteer dan de eerste: je typt er
    // meteen overheen. Zo niet, dan de cursor achter de tekst.
    const slot = SLOT.exec(el.value);
    if (slot) el.setSelectionRange(slot.index, slot.index + slot[0].length);
    else if (place === 'start') {
      el.setSelectionRange(0, 0);
      el.scrollTop = 0;
    } else el.setSelectionRange(el.value.length, el.value.length);
  }, [text]);

  const canSend = !disabled && !streaming && !optimizing && text.trim().length > 0;
  const canOptimize = Boolean(onOptimize) && !disabled && !streaming && text.trim().length > 0;
  // Alleen terugdraaien zolang het veld nog precies het verbeterde resultaat
  // bevat; typt de gebruiker verder, dan slaat "herstellen" nergens meer op.
  const canUndo = beforeOptimize !== null && text === beforeOptimize.after && !optimizing;

  function submit() {
    if (!canSend) return;
    // Een routekaart gaat niet naar de AI: die programmeerde de pagina zelf en
    // leverde overlappende labels en een weg die niet aansloot. De vaste
    // routekaart maakt hem altijd in dezelfde, geteste opmaak.
    if (isRoutekaart) {
      makeRoutekaart();
      return;
    }
    const value = text.trim();
    clearText();
    setBeforeOptimize(null);
    setEnlarged(false);
    // Het antwoord komt er nu aan: het toetsenbord gaat weg, anders lees je het
    // door een kiergat van een paar regels.
    if (touchKeyboard) textareaRef.current?.blur();
    onSend(value);
    // Na een klik op Verstuur stond de focus op een knop die nu uitgaat.
    if (!touchKeyboard) textareaRef.current?.focus();
  }

  async function optimize() {
    if (!onOptimize || !canOptimize || optimizing) return;
    const before = text;
    setOptimizing(true);
    try {
      const result = await onOptimize(before);
      // Niets veranderd (fout of al goed genoeg): laat de tekst met rust.
      if (result.error || !result.changed || !result.text.trim()) return;
      setText(result.text);
      setBeforeOptimize({ before, after: result.text });
    } finally {
      setOptimizing(false);
      textareaRef.current?.focus();
    }
  }

  function undoOptimize() {
    if (!canUndo || !beforeOptimize) return;
    setText(beforeOptimize.before);
    setBeforeOptimize(null);
    textareaRef.current?.focus();
  }

  // --- Bestanden hierheen slepen ---
  // Dezelfde route als de paperclip: elk bestand gaat door onAddFile, die de
  // tekst eruit haalt en de grenzen (aantal, omvang) bewaakt en meldt.

  const canDropFiles = allowAttachments && !disabled && !streaming;

  /** Sleept de gebruiker bestanden (en geen tekstselectie of iets anders)? */
  function isFileDrag(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types ?? []).includes('Files');
  }

  function onDragEnter(e: React.DragEvent) {
    if (!canDropFiles || !isFileDrag(e)) return;
    e.preventDefault();
    // Tellen in plaats van een simpele boolean: de browser vuurt bij elk
    // onderliggend element opnieuw enter/leave, en zonder teller flikkert het
    // vlak zodra je over de knoppen beweegt.
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!canDropFiles || !isFileDrag(e)) return;
    // Zonder preventDefault weigert de browser de drop.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(e: React.DragEvent) {
    if (!canDropFiles || !isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  async function onDrop(e: React.DragEvent) {
    if (!canDropFiles || !isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    // Eén voor één en netjes op elkaar wachten: de extractie van een document
    // loopt asynchroon, en tegelijk starten zou bestanden laten vallen.
    for (const file of Array.from(e.dataTransfer.files)) {
      await onAddFile(file);
    }
  }

  function makeRoutekaart() {
    if (!onRoutekaart || disabled || streaming) return;
    const value = text.trim();
    clearText();
    setBeforeOptimize(null);
    onRoutekaart(value);
  }

  const enterHint = touchKeyboard
    ? 'Verstuur met de knop Verstuur. De returntoets geeft een nieuwe regel.'
    : 'Enter verstuurt. Shift+Enter geeft een nieuwe regel.';

  return (
    <nldd-container gap="8">
      {/* Een routekaart programmeert de AI niet zelf: PromptPlein heeft een
          vaste, geteste versie, en Verstuur maakt hem daarmee. */}
      {isRoutekaart && !streaming && (
        <nldd-banner
          size="sm"
          variant="accent"
          icon="map"
          text="Dit is een routekaart."
          supporting-text="PromptPlein maakt hem direct in de vaste rijksstijl, zonder AI: altijd dezelfde opmaak en meteen klaar. Ook Verstuur maakt hem zo."
        >
          <nldd-button
            slot="actions"
            appearance="primary"
            start-icon="map"
            text="Maak de routekaart"
            disabled={disabled || undefined}
            onClick={makeRoutekaart}
          ></nldd-button>
        </nldd-banner>
      )}

      {/* Bijlagen, tekstvak en knoppen horen bij elkaar. Bestanden mogen overal
          op dit blok worden losgelaten. */}
      <nldd-container
        gap="4"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
      >
        {allowAttachments && attachments.length > 0 && (
          <nldd-container layout="wrap" gap="6">
            {attachments.map((a, i) => (
              <AttachmentToken key={a.id} attachment={a} index={i} onRemove={onRemoveAttachment} />
            ))}
          </nldd-container>
        )}

        {dragging && (
          <nldd-container layout="row" gap="8" vertical-alignment="center">
            <nldd-icon icon="paperclip" size="16" color="accent"></nldd-icon>
            <nldd-text size="sm" weight="medium" color="accent">
              Laat los om als bijlage toe te voegen
            </nldd-text>
          </nldd-container>
        )}

        <nldd-multi-line-text-field
          ref={fieldRef}
          // De chat heeft zijn eigen microfoon in de werkbalk hieronder.
          data-dictation="off"
          data-autogrow="off"
          accessible-label="Je bericht"
          rows={rows}
          resize="none"
          placeholder={
            disabled
              ? (disabledPlaceholder ?? 'Chat wordt geladen…')
              : placeholder
                ? placeholder
                : prominent
                  ? touchKeyboard
                    ? 'Typ hier je bericht'
                    : 'Typ hier je bericht en druk op Enter'
                  : 'Stel je vraag…'
          }
          disabled={disabled || optimizing || undefined}
        ></nldd-multi-line-text-field>

        {/* Werkbalk onder het tekstvak: de plus links, versturen rechts. */}
        <nldd-container layout="row" gap="4" vertical-alignment="center">
          {/* De plusknop houdt alles bij elkaar wat je kunt toevoegen of aanzetten.
              De balk laat daarnaast alleen zien wat er nu aanstaat. */}
          <ComposerPlusMenu
            disabled={disabled || streaming}
            busy={extracting}
            canAddFile={allowAttachments && !extracting && attachments.length < MAX_CHAT_ATTACHMENTS}
            addFileHint={
              attachments.length >= MAX_CHAT_ATTACHMENTS
                ? `Maximaal ${MAX_CHAT_ATTACHMENTS} per chat`
                : `Tot ${MAX_MB} MB`
            }
            onAddFile={pickFile}
            onContext={() => onContext?.('context')}
            onMakePrompt={() => onContext?.('taak')}
            thinking={thinking}
            onToggleThinking={onToggleThinking}
            thinkingUnavailable={thinkingUnavailable}
            webSearch={webSearch}
            onToggleWebSearch={onToggleWebSearch}
            onDictate={dictation.available ? dictation.toggle : undefined}
          />
          {dictation.available && (
            <ConversationToggle
              active={dictation.conversation.active}
              phase={dictation.conversation.phase}
              announcement={dictation.conversation.announcement}
              onToggle={dictation.conversation.toggle}
            />
          )}

          {/* Projecten: project met bronbestanden, en van daaruit een context prompt.
              Staat los van de plus, want dit is de snelste weg naar een goed
              antwoord. Hoort de chat bij een project, dan staat dat erop. */}
          {onContext && (
            <nldd-button
              appearance={activeProjectName ? 'neutral-tinted' : 'neutral-transparent'}
              size="sm"
              start-icon="folder-open"
              text={activeProjectName ?? 'Projecten'}
              max-width="12rem"
              single-line
              accessible-label={activeProjectName ? `Project: ${activeProjectName}` : 'Projecten'}
              disabled={disabled || streaming || undefined}
              onClick={() => onContext('context')}
            ></nldd-button>
          )}

          {/* Alleen wat aanstaat: één klik zet het weer uit. */}
          {onToggleThinking && thinking && !thinkingUnavailable && (
            <ThinkingToggle
              value={thinking}
              onChange={onToggleThinking}
              disabled={disabled || streaming}
              unavailableReason={thinkingUnavailable}
            />
          )}
          {onToggleWebSearch && webSearch && (
            <WebSearchToggle value={webSearch} onChange={onToggleWebSearch} disabled={disabled || streaming} />
          )}

          {(overflowing || enlarged) && (
            <nldd-toggle-button
              appearance="neutral-transparent"
              size="sm"
              variant="icon"
              icon="expand"
              selected-icon="collapse"
              accessible-label="Groter tekstvak"
              selected={enlarged || undefined}
              onClick={() => setEnlarged((value) => !value)}
            ></nldd-toggle-button>
          )}

          {/* Verbetert in één klik wat er staat. Verschijnt pas zodra er tekst is,
              zodat een leeg veld rustig blijft. */}
          {onOptimize && (text.trim().length > 0 || optimizing) && (
            <nldd-icon-button
              appearance="neutral-transparent"
              size="sm"
              icon="sparkles"
              text="Verbeter mijn tekst met AI"
              loading={optimizing || undefined}
              loading-text="Bezig met verbeteren"
              disabled={!canOptimize || undefined}
              onClick={() => void optimize()}
            ></nldd-icon-button>
          )}

          <nldd-spacer size="flexible"></nldd-spacer>

          {/* De microfoon naast Verstuur: inspreken is een manier om te
              schrijven en moet zonder menu bereikbaar blijven. */}
          {dictation.available && (
            <DictationButton
              state={dictationState}
              seconds={dictation.seconds}
              stream={dictation.stream}
              onToggle={dictation.toggle}
              disabled={disabled || streaming}
              size="md"
            />
          )}

          {streaming ? (
            <nldd-button
              appearance="secondary"
              size="sm"
              start-icon="stop"
              text="Stop"
              accessible-label="Stop het antwoord"
              onClick={onStop}
            ></nldd-button>
          ) : (
            <nldd-button
              appearance="primary"
              size="sm"
              start-icon="send"
              text="Verstuur"
              disabled={!canSend || undefined}
              onClick={submit}
            ></nldd-button>
          )}
        </nldd-container>
      </nldd-container>

      {/* Een gemaakte prompt is net binnengekomen: zeg wat het is en wat er nog
          moet gebeuren. Weg zodra de gebruiker hem wijzigt of verstuurt. */}
      {madePrompt && text === madePrompt.text && (
        <nldd-container layout="wrap" gap="6" vertical-alignment="center">
          <nldd-icon icon="sparkles" size="16" color="oranje"></nldd-icon>
          <nldd-text size="sm" weight="bold">
            {madePrompt.framework ? `Gebouwd met ${madePrompt.framework}.` : 'Je prompt staat klaar.'}
          </nldd-text>
          {madePrompt.reden && <InfoDot label="Waarom deze aanpak" text={madePrompt.reden} />}
          {SLOT.test(text) && <nldd-text size="sm">Vul de plekken tussen haken in.</nldd-text>}
          {madePrompt.before.trim() && (
            <nldd-button
              appearance="neutral-transparent"
              size="xs"
              start-icon="undo"
              text="Herstel mijn tekst"
              onClick={() => {
                setText(madePrompt.before);
                setMadePrompt(null);
                setEnlarged(false);
                textareaRef.current?.focus();
              }}
            ></nldd-button>
          )}
        </nldd-container>
      )}

      {/* Een woord als "voortaan" of "onthoud": al vóór het versturen zichtbaar dat
          de wens in het geheugen komt. Geen live-regio: dit verandert bij elke toets. */}
      {memoryHint && hasMemoryTrigger(text) && (
        <nldd-container layout="row" gap="6" vertical-alignment="center">
          <nldd-icon icon="bookmark" size="16" color="accent"></nldd-icon>
          <nldd-text size="xs" color="secondary">
            Bij versturen wordt je wens in geheugen opgeslagen.
          </nldd-text>
        </nldd-container>
      )}

      {/* Na een verbetering: één klik terug naar de eigen tekst. Verdwijnt zodra
          de gebruiker zelf verder typt of het bericht verstuurt. */}
      {canUndo && (
        <nldd-container layout="wrap" gap="6" vertical-alignment="center">
          <nldd-icon icon="sparkles" size="16" color="oranje"></nldd-icon>
          <nldd-text size="xs" color="secondary">
            Je tekst is verbeterd. Lees hem na en pas gerust aan.
          </nldd-text>
          <nldd-button
            appearance="neutral-transparent"
            size="xs"
            start-icon="undo"
            text="Herstel mijn tekst"
            onClick={undoOptimize}
          ></nldd-button>
        </nldd-container>
      )}

      {/* Sneltoetsen en de bijlagelimiet staan achter het infobolletje: wie het
          wil weten vindt het, en het veld blijft rustig. */}
      <nldd-container layout="wrap" gap="8" vertical-alignment="center">
        <InfoDot
          label="Uitleg bij het invoerveld"
          text={
            allowAttachments
              ? `${enterHint}\nBijlagen: maximaal ${MAX_CHAT_ATTACHMENTS}, elk tot ${MAX_MB} MB. Sleep ze hierheen of kies Bestand achter de plus. Ze blijven de hele chat beschikbaar.`
              : enterHint
          }
        />
        {notice && <nldd-text size="sm">{notice}</nldd-text>}
        <nldd-spacer size="flexible"></nldd-spacer>
        {badge}
      </nldd-container>
    </nldd-container>
  );
});

/** One attachment as a removable token; its dismiss event is bound on the token itself. */
function AttachmentToken({
  attachment: a,
  index,
  onRemove,
}: {
  attachment: ChatAttachment;
  index: number;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'dismiss', () => onRemove(a.id));
  const chars = `${a.chars.toLocaleString('nl-NL')} tekens`;
  return (
    <nldd-tooltip text={`Bijlage ${index + 1}: ${a.name}, ${chars}${a.truncated ? ', ingekort tot de bijlagelimiet' : ''}`}>
      <nldd-token
        ref={ref}
        control="dismiss"
        dismiss-text={`Verwijder bijlage ${a.name}`}
        text={`${a.name} · ${chars}${a.truncated ? ' · ingekort' : ''}`}
      ></nldd-token>
    </nldd-tooltip>
  );
}

export default ChatComposer;
