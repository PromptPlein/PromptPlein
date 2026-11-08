import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BookmarkPlus,
  FolderOpen,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Paperclip,
  Scissors,
  Send,
  Sparkles,
  Square,
  Undo2,
  X,
} from '@/components/common/icons';
import clsx from 'clsx';
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
import { MAX_CHAT_ATTACHMENTS } from './useChatController';
import type { ChatAttachment } from '@/types';

/**
 * Bovengrens van het tekstvak. Daarboven groeit het niet verder mee en scrollt
 * de inhoud van binnen: anders zou een lange tekst het gesprek erboven volledig
 * wegdrukken.
 */
const MAX_HEIGHT = 240;
/**
 * Een invulplek tussen haken. `[ontbreekt]` hoort daar niet bij: dat is een woord
 * dat de AI zelf gebruikt als iets niet in de bronnen staat.
 */
const SLOT = /\[(?!ontbreekt\])[^\]\n]+\]/;
/** Het vergrote tekstvak: dit deel van de vensterhoogte. */
const ENLARGED_SHARE = 0.55;

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
}

interface ChatComposerProps {
  /** Volledig uitgeschakeld (bijv. chat uitgezet of geen AI-service). */
  disabled: boolean;
  /** Tekst in het lege vak zolang het uitgeschakeld is; standaard "laden". */
  disabledPlaceholder?: string;
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
  const [overflowing, setOverflowing] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Meegroeien met de inhoud: eerst terug naar 'auto' (anders houdt het vak zijn
  // vorige, grotere hoogte vast en meet scrollHeight de oude stand), dan precies
  // zo hoog als de tekst nodig heeft. Boven MAX_HEIGHT stopt het en neemt de
  // eigen schuifbalk het over.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Het vak rekent met border-box, dus een eventuele rand telt mee in de
    // hoogte. Alleen scrollHeight aanhouden laat de tekst er net overheen lopen,
    // en dat is precies genoeg voor een schuifbalk bij tekst die eigenlijk past.
    const borders = el.offsetHeight - el.clientHeight;
    const needed = el.scrollHeight + borders;
    const limit = enlarged ? Math.round(window.innerHeight * ENLARGED_SHARE) : MAX_HEIGHT;
    el.style.height = `${Math.min(limit, needed)}px`;
    setOverflowing(needed > MAX_HEIGHT);
  }, [text, enlarged]);

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
        setMadePrompt({ text: value, before: textareaRef.current?.value ?? '', ...made });
        setBeforeOptimize(null);
        setText(value);
        setEnlarged(true);
        focusAfterFill.current = 'start';
      },
      getText: () => textareaRef.current?.value ?? '',
      focus() {
        const el = textareaRef.current;
        if (!el || document.activeElement === el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      },
    }),
    [setText],
  );
  useLayoutEffect(() => {
    const place = focusAfterFill.current;
    if (!place) return;
    focusAfterFill.current = null;
    const el = textareaRef.current;
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
    <div
      className={clsx(
        'px-4 pb-3 pt-3 sm:px-6 laag:!pb-1 laag:!pt-1',
        // In een leeg gesprek staat het veld los in het midden, zonder scheidslijn.
        !prominent && 'border-t border-slate-200 dark:border-slate-700',
      )}
    >
      {/* Even breed als de leeskolom in ChatMessageList, zodat je tekst en het
          antwoord op dezelfde lijn beginnen. */}
      <div className="mx-auto max-w-[60ch]">
        {/* Een routekaart programmeert de AI niet zelf: PromptPlein heeft een
            vaste, geteste versie, en Verstuur maakt hem daarmee. */}
        {isRoutekaart && !streaming && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/70 px-3 py-2 text-xs text-slate-700 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10 dark:text-slate-200">
            <MapIcon size={15} className="shrink-0 text-rijksblauw-600 dark:text-rijksblauw-300" />
            <span className="min-w-0 flex-1 basis-48">
              Dit is een routekaart. PromptPlein maakt hem direct in de vaste rijksstijl, zonder AI:
              altijd dezelfde opmaak en meteen klaar. Ook Verstuur maakt hem zo.
            </span>
            <button
              type="button"
              className="opl-btn-primary !px-2.5 !py-1.5 text-xs"
              onClick={makeRoutekaart}
              disabled={disabled}
            >
              <MapIcon size={14} /> Maak de routekaart
            </button>
          </div>
        )}
        {/* Eén omhulsel dat er als hét invoerveld uitziet: bijlagen, tekstvak en
            knoppen zitten er samen in en de rand licht op zodra je in het tekstvak
            staat (focus-within). Zo hoort alles zichtbaar bij elkaar, terwijl de
            knoppen buiten het tekstvak blijven staan — daar kan de tekst dus nooit
            onderdoor lopen. */}
        <div
          className={clsx(
            'relative rounded-xl border bg-white transition-colors dark:bg-slate-800',
            'focus-within:border-rijksblauw-500 focus-within:ring-2 focus-within:ring-rijksblauw-500/20',
            // In een leeg gesprek springt het veld eruit: blauwe rand, zachte gloed
            // en een schaduw, zodat meteen duidelijk is waar je typt.
            prominent
              ? 'border-rijksblauw-300 shadow-md ring-4 ring-rijksblauw-500/10 dark:border-rijksblauw-500/50 dark:ring-rijksblauw-500/10'
              : 'border-slate-300 dark:border-slate-600',
            disabled && 'opacity-60',
          )}
          // Klikken op de rand of de lege ruimte eromheen zet de cursor in de
          // tekst, zoals je van één veld verwacht.
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              textareaRef.current?.focus();
            }
          }}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => void onDrop(e)}
        >
          {allowAttachments && attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((a, i) => (
                <span
                  key={a.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  title={`Bijlage ${i + 1}: ${a.name}, ${a.chars.toLocaleString('nl-NL')} tekens`}
                >
                  <Paperclip size={12} className="shrink-0" />
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 text-slate-400">
                    {a.chars.toLocaleString('nl-NL')} tekens
                  </span>
                  {a.truncated && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400"
                      title="De tekst is ingekort tot de bijlagelimiet"
                    >
                      <Scissors size={11} /> ingekort
                    </span>
                  )}
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    onClick={() => onRemoveAttachment(a.id)}
                    aria-label={`Verwijder bijlage ${a.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Het tekstvak zelf: zonder eigen rand of focusring, want die zitten op
              het omhulsel. Alleen het sterretje ligt eroverheen (rechtsboven); de
              tekst houdt daar afstand van via de rechtermarge. */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              // De chat heeft zijn eigen microfoon in de werkbalk hieronder, en
              // groeit zelf mee tot MAX_HEIGHT.
              data-dictation="off"
              data-autogrow="off"
              className={clsx(
                // opl-scroll-slim: een slanke schuifbalk met vaste goot, zodat een
                // langere tekst geen brede systeembalk oplevert die tegen het
                // sterretje aan botst — en de tekst niet verspringt op het moment
                // dat de balk verschijnt.
                'opl-scroll-slim block w-full resize-none border-0 bg-transparent px-3.5 py-2.5',
                'text-base leading-7 text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-0',
                'dark:text-slate-100 dark:placeholder:text-slate-400',
                // Leeg gesprek: een ruimer vak, zodat het als een uitnodiging leest
                // en niet als een smal regeltje onderaan het scherm.
                prominent && 'min-h-[3.5rem] py-3.5',
                // Ruimte rechtsboven voor het sterretje, zodat de tekst er niet
                // onder doorloopt. Vast (niet afhankelijk van of de knop er staat),
                // anders zou de tekst verspringen zodra je begint te typen.
                onOptimize && 'pr-12',
              )}
              // Eén regel als startpunt; de layout-effect hierboven laat het vak
              // daarna meegroeien met de tekst.
              rows={1}
              aria-label="Je bericht"
              placeholder={
                disabled
                  ? (disabledPlaceholder ?? 'Chat wordt geladen…')
                  : prominent
                    ? touchKeyboard
                      ? 'Typ hier je bericht'
                      : 'Typ hier je bericht en druk op Enter'
                    : 'Stel je vraag…'
              }
              value={text}
              disabled={disabled || optimizing}
              onChange={(e) => {
                const value = e.target.value;
                setText(value);
                // Een @ als allereerste teken is een commando, geen tekst: dat opent
                // de context. Verderop in een zin (een e-mailadres, een naam) doen
                // we niets, anders zou hij bij elk adres opengaan.
                if (value === '@' && onContext) {
                  clearText();
                  onContext('context');
                }
              }}
              onKeyDown={(e) => {
                // Enter verzendt; Shift+Enter maakt een nieuwe regel.
                // Tijdens samenstellen van een teken bevestigt Enter dat teken.
                // Op het schermtoetsenbord blijft de returntoets een nieuwe regel, zoals
                // in elke berichtenapp: versturen doe je met de knop Verstuur.
                if (e.key === 'Enter' && !touchKeyboard && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {/* Sterretje rechtsboven: verbetert in één klik wat er staat. Verschijnt
                pas zodra er tekst is, zodat een leeg veld rustig blijft. Zelfde
                oranje verloop als het gereedschap "Genereren" in de menubalk. */}
            {onOptimize && (text.trim().length > 0 || optimizing) && (
              <button
                type="button"
                className={clsx(
                  // right-3 laat de schuifbalk vrij; zonder balk oogt het als een
                  // bewuste marge in plaats van een knop tegen de rand.
                  'absolute right-3 top-2 flex h-7 w-7 items-center justify-center rounded-lg',
                  'bg-rijksoranje text-white shadow-sm',
                  'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rijksoranje/40',
                  canOptimize && !optimizing
                    ? 'hover:shadow-md motion-safe:hover:-translate-y-px'
                    : 'cursor-default opacity-60',
                )}
                onClick={() => void optimize()}
                disabled={!canOptimize || optimizing}
                title={
                  optimizing
                    ? 'Bezig met verbeteren…'
                    : 'Verbeter mijn tekst met AI; je oorspronkelijke tekst kun je daarna terughalen'
                }
                aria-label="Verbeter mijn tekst met AI"
              >
                {optimizing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} strokeWidth={2.25} />
                )}
              </button>
            )}
          </div>

          {/* Werkbalk onderin hetzelfde veld: bijlage links, versturen rechts.
              Staat onder het tekstvak in plaats van eroverheen, dus de tekst kan er
              nooit achter verdwijnen. Een lichte scheidingslijn erboven zet de
              knoppen los van wat je typt. */}
          <div className="opl-chat-balk mt-1 flex items-center gap-1 border-t border-slate-100 px-2 pb-2 pt-1.5 dark:border-slate-700/60">
            {/* De plusknop houdt alles bij elkaar wat je kunt toevoegen of aanzetten.
                De balk laat daarnaast alleen zien wat er nu aanstaat. */}
            <ComposerPlusMenu
              disabled={disabled || streaming}
              busy={extracting}
              canAddFile={
                allowAttachments && !extracting && attachments.length < MAX_CHAT_ATTACHMENTS
              }
              addFileHint={
                attachments.length >= MAX_CHAT_ATTACHMENTS
                  ? `Maximaal ${MAX_CHAT_ATTACHMENTS} per chat`
                  : 'PDF, Word of tekst, tot 10 MB'
              }
              onAddFile={() => fileInputRef.current?.click()}
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
              <button
                type="button"
                className={clsx(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40',
                  activeProjectName
                    ? 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                )}
                onClick={() => onContext('context')}
                disabled={disabled || streaming}
                title="Kies een project met bronbestanden of maak een context prompt"
                aria-label={activeProjectName ? `Project: ${activeProjectName}` : 'Projecten'}
              >
                <FolderOpen size={16} className="shrink-0" />
                <span className="opl-balk-optioneel max-w-[9rem] truncate text-xs font-medium">
                  {activeProjectName ?? 'Projecten'}
                </span>
              </button>
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
              <WebSearchToggle
                value={webSearch}
                onChange={onToggleWebSearch}
                disabled={disabled || streaming}
              />
            )}

            {(overflowing || enlarged) && (
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                onClick={() => setEnlarged((value) => !value)}
                aria-pressed={enlarged}
                aria-label="Groter tekstvak"
                title={enlarged ? 'Kleiner tekstvak' : 'Groter tekstvak'}
              >
                {enlarged ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            )}

            {allowAttachments && (
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_DOC_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onAddFile(file);
                  e.target.value = '';
                }}
              />
            )}

            {/* De microfoon rechts naast Verstuur: inspreken is een manier om te
                schrijven en moet zonder menu bereikbaar blijven. Tijdens het
                opnemen wordt het een balk met een geluidsmeter en de tijd. */}
            {dictation.available && (
              <DictationButton
                state={dictationState}
                seconds={dictation.seconds}
                stream={dictation.stream}
                onToggle={dictation.toggle}
                disabled={disabled || streaming}
                size="md"
                className="ml-auto"
              />
            )}

            {streaming ? (
              <button
                type="button"
                className={clsx(
                  'opl-btn-secondary shrink-0 !rounded-lg !px-3 !py-1.5',
                  !dictation.available && 'ml-auto',
                )}
                onClick={onStop}
                aria-label="Stop het antwoord"
              >
                <Square size={15} /> <span className="opl-balk-kort">Stop</span>
              </button>
            ) : (
              <button
                type="button"
                className={clsx(
                  'opl-btn-primary shrink-0 !rounded-lg !px-3 !py-1.5',
                  !dictation.available && 'ml-auto',
                  !canSend && 'opacity-50',
                )}
                onClick={submit}
                disabled={!canSend}
                aria-label="Verstuur"
              >
                <Send size={15} /> <span className="opl-balk-kort">Verstuur</span>
              </button>
            )}
          </div>

          {/* Sleep je bestanden over het veld, dan legt dit vlak eroverheen uit wat
              er gebeurt als je loslaat. pointer-events-none, zodat het de drop
              zelf niet in de weg zit. */}
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rijksblauw-400 bg-rijksblauw-50/95 text-sm font-medium text-rijksblauw-700 dark:border-rijksblauw-500/60 dark:bg-slate-800/95 dark:text-rijksblauw-200">
              <Paperclip size={16} />
              Laat los om als bijlage toe te voegen
            </div>
          )}
        </div>

        {/* Een gemaakte prompt is net binnengekomen: zeg wat het is en wat er nog
            moet gebeuren. Weg zodra de gebruiker hem wijzigt of verstuurt. */}
        {madePrompt && text === madePrompt.text && (
          <div className="mt-1.5 flex animate-fade-in flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-700 dark:text-slate-200">
            <Sparkles size={14} className="shrink-0 text-rijksoranje" />
            <span className="font-semibold">
              {madePrompt.framework ? `Gebouwd met ${madePrompt.framework}.` : 'Je prompt staat klaar.'}
            </span>
            {madePrompt.reden && <InfoDot label="Waarom deze aanpak" text={madePrompt.reden} />}
            {SLOT.test(text) && <span>Vul de plekken tussen haken in.</span>}
            {madePrompt.before.trim() && (
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={() => {
                  setText(madePrompt.before);
                  setMadePrompt(null);
                  setEnlarged(false);
                  textareaRef.current?.focus();
                }}
              >
                <Undo2 size={13} /> Herstel mijn tekst
              </button>
            )}
          </div>
        )}

        {/* Een woord als "voortaan" of "onthoud": al vóór het versturen zichtbaar dat
            de wens in het geheugen komt. Geen live-regio: dit verandert bij elke toets. */}
        {memoryHint && hasMemoryTrigger(text) && (
          <div className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-slate-500 dark:text-slate-400">
            <BookmarkPlus size={12} aria-hidden="true" className="shrink-0 text-rijksblauw-600 dark:text-rijksblauw-300" />
            <span className="min-w-0">Bij versturen wordt je wens in geheugen opgeslagen.</span>
          </div>
        )}

        {/* Na een verbetering: één klik terug naar de eigen tekst. Verdwijnt zodra
            de gebruiker zelf verder typt of het bericht verstuurt. */}
        {canUndo && (
          <div className="mt-1.5 flex items-center gap-2 text-[0.6875rem] text-slate-500 dark:text-slate-400">
            <Sparkles size={12} className="shrink-0 text-rijksoranje" />
            <span className="min-w-0">Je tekst is verbeterd. Lees hem na en pas gerust aan.</span>
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={undoOptimize}
            >
              <Undo2 size={12} /> Herstel mijn tekst
            </button>
          </div>
        )}

        {/* Sneltoetsen en de bijlagelimiet stonden hier als een regel kleine
            grijze tekst. Die staat nu achter het infobolletje: wie het wil weten
            vindt het, en het veld blijft rustig. */}
        <div className="opl-chat-notitie mt-1 flex items-center justify-between gap-2">
          <InfoDot
            label="Uitleg bij het invoerveld"
            className="-ml-1"
            text={
              allowAttachments
                ? `${enterHint}\nBijlagen: maximaal ${MAX_CHAT_ATTACHMENTS}, elk tot 10 MB. Sleep ze hierheen of kies Bestand achter de plus. Ze blijven de hele chat beschikbaar.`
                : enterHint
            }
          />
          {notice && (
            <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{notice}</p>
          )}
          {/* Op de telefoon telt elke regel; de melding over persoonsgegevens gaat voor. */}
          <span className="hidden shrink-0 sm:inline">{badge}</span>
        </div>
      </div>
    </div>
  );
});

export default ChatComposer;
