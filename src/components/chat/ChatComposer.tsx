import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AtSign,
  FolderOpen,
  Loader2,
  Paperclip,
  Scissors,
  Send,
  Sparkles,
  Square,
  Undo2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import DictationButton from '@/components/common/DictationButton';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';
import { ACCEPTED_DOC_ACCEPT } from '@/lib/extractDocument';
import { insertDictatedText, useDictation } from '@/lib/useDictation';
import { MAX_CHAT_ATTACHMENTS } from './useChatController';
import type { ChatAttachment, ChatProject } from '@/types';

/**
 * Bovengrens van het tekstvak. Daarboven groeit het niet verder mee en scrollt
 * de inhoud van binnen: anders zou een lange tekst het gesprek erboven volledig
 * wegdrukken.
 */
const MAX_HEIGHT = 240;

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
}

interface ChatComposerProps {
  /** Volledig uitgeschakeld (bijv. chat uitgezet of geen AI-service). */
  disabled: boolean;
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
  /** Bijlagen toestaan? De Testkamer zet dit uit: daar test je de prompt zelf. */
  allowAttachments?: boolean;
  /**
   * De projecten van de gebruiker, voor het @-menu. Afwezig = geen @-knop (de
   * Testkamer bijvoorbeeld: daar test je één prompt, geen project).
   */
  projects?: ChatProject[];
  /** Het project waar dit gesprek nu onder valt. */
  activeProjectId?: string | null;
  /** Koppel het gesprek aan een project (of ontkoppel met null). */
  onPickProject?: (projectId: string | null) => void;
  /**
   * Mag er nog gekozen worden? Zodra er een bericht staat niet meer: de
   * projectinstructie geldt voor het hele gesprek, dus halverwege wisselen zou
   * betekenen dat eerdere antwoorden onder andere regels tot stand kwamen. Het
   * @-menu blijft dan wel zichtbaar (met uitleg), zodat het niet lijkt of de
   * knop verdwenen is.
   */
  canPickProject?: boolean;
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
const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  {
    disabled,
    streaming,
    extracting,
    attachments,
    onSend,
    onStop,
    onAddFile,
    onRemoveAttachment,
    onOptimize,
    badge,
    allowAttachments = true,
    projects,
    activeProjectId = null,
    onPickProject,
    canPickProject = false,
    thinking = false,
    onToggleThinking,
    thinkingUnavailable,
    webSearch = false,
    onToggleWebSearch,
    prominent = false,
  },
  ref,
) {
  const [text, setText] = useState('');
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const [optimizing, setOptimizing] = useState(false);
  // Sleept de gebruiker op dit moment bestanden boven het veld?
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  // De tekst van vóór de laatste verbetering, met wat eruit kwam. Zolang het
  // veld nog exact het resultaat bevat, kan de gebruiker terug.
  const [beforeOptimize, setBeforeOptimize] = useState<{ before: string; after: string } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inspreken: de uitgeschreven tekst komt op de plek van de cursor, en
  // versturen blijft een eigen handeling, zodat je eerst kunt nalezen.
  const dictation = useDictation((spoken) => {
    if (textareaRef.current) insertDictatedText(textareaRef.current, spoken);
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
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight + borders)}px`;
  }, [text]);

  // Van buitenaf tekst klaarzetten (startsjablonen). Focussen doen we pas nadat
  // React de nieuwe waarde in het veld heeft gezet — anders zou de cursor nog op
  // de oude, lege tekst worden gezet.
  const focusAfterFill = useRef(false);
  useImperativeHandle(
    ref,
    () => ({
      fill(value: string) {
        setText(value);
        setBeforeOptimize(null);
        focusAfterFill.current = true;
      },
    }),
    [],
  );
  useLayoutEffect(() => {
    if (!focusAfterFill.current) return;
    focusAfterFill.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    // Staat er een invulplek tussen [haken], selecteer dan de eerste: je typt er
    // meteen overheen. Zo niet, dan de cursor achter de tekst.
    const slot = /\[[^\]\n]+\]/.exec(el.value);
    if (slot) el.setSelectionRange(slot.index, slot.index + slot[0].length);
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [text]);

  // --- Het @-menu: koppel dit gesprek aan een project ---
  const projectPickerAvailable = Boolean(onPickProject && projects && projects.length > 0);
  const activeProject = projects?.find((p) => p.id === activeProjectId) ?? null;

  // Buiten het menu klikken of Escape sluit het weer.
  useEffect(() => {
    if (!projectMenuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!projectMenuRef.current?.contains(e.target as Node)) setProjectMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setProjectMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [projectMenuOpen]);

  function pickProject(projectId: string | null) {
    setProjectMenuOpen(false);
    onPickProject?.(projectId);
    // Heeft de gebruiker het menu met een getypte @ geopend, haal die dan weer
    // weg: het is een commando geweest, geen tekst die hij wil versturen.
    setText((cur) => (cur === '@' ? '' : cur));
    textareaRef.current?.focus();
  }

  const canSend = !disabled && !streaming && !optimizing && text.trim().length > 0;
  const canOptimize = Boolean(onOptimize) && !disabled && !streaming && text.trim().length > 0;
  // Alleen terugdraaien zolang het veld nog precies het verbeterde resultaat
  // bevat; typt de gebruiker verder, dan slaat "herstellen" nergens meer op.
  const canUndo = beforeOptimize !== null && text === beforeOptimize.after && !optimizing;

  function submit() {
    if (!canSend) return;
    const value = text.trim();
    setText('');
    setBeforeOptimize(null);
    onSend(value);
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

  return (
    <div className="border-t border-slate-200 px-4 pb-3 pt-3 dark:border-slate-700 sm:px-6">
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
              'text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0',
              'dark:text-slate-100 dark:placeholder:text-slate-500',
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
            placeholder={
              disabled
                ? 'Chat wordt geladen…'
                : prominent
                  ? 'Typ hier je bericht en druk op Enter'
                  : 'Stel je vraag…'
            }
            value={text}
            disabled={disabled || optimizing}
            onChange={(e) => {
              const value = e.target.value;
              setText(value);
              // Een @ als allereerste teken is een commando, geen tekst: open
              // meteen het projectmenu. Verderop in een zin (een e-mailadres,
              // een naam) doen we niets — dat zou het menu bij elk adres openen.
              if (value === '@' && projectPickerAvailable && canPickProject) {
                setProjectMenuOpen(true);
              } else if (!value.startsWith('@')) {
                setProjectMenuOpen(false);
              }
            }}
            onKeyDown={(e) => {
              // Enter verzendt; Shift+Enter maakt een nieuwe regel.
              if (e.key === 'Enter' && !e.shiftKey) {
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
                'bg-gradient-to-br from-rijksoranje to-rijksoranje-dark text-white shadow-sm',
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
        <div className="mt-1 flex items-center gap-1 border-t border-slate-100 px-2 pb-2 pt-1.5 dark:border-slate-700/60">
          {/* Microfoon: linksonder, als eerste knop. Tijdens het opnemen wordt
              het een balk met een geluidsmeter en de tijd. */}
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

          {/* @-menu: hetzelfde project kiezen als vanuit de zijbalk, maar dan
              zonder het gesprek te verlaten. Bewust naast de paperclip: het is
              dezelfde soort handeling — bronmateriaal aan dit gesprek hangen. */}
          {projectPickerAvailable && (
            <div className="relative shrink-0" ref={projectMenuRef}>
              <button
                type="button"
                className={clsx(
                  'flex h-8 items-center gap-1.5 rounded-lg px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40',
                  activeProject
                    ? 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
                )}
                onClick={() => setProjectMenuOpen((open) => !open)}
                disabled={disabled || streaming || !canPickProject}
                title={
                  canPickProject
                    ? 'Koppel deze chat aan een project'
                    : 'Het project ligt vast zodra de chat is begonnen. Start een nieuwe chat om te wisselen.'
                }
                aria-label="Kies een project voor deze chat"
                aria-expanded={projectMenuOpen}
              >
                <AtSign size={16} className="shrink-0" />
                {activeProject && (
                  <span className="max-w-[8rem] truncate text-xs font-medium">
                    {activeProject.name}
                  </span>
                )}
              </button>

              {projectMenuOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Projecten
                  </p>
                  {projects?.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                        project.id === activeProjectId
                          ? 'bg-rijksblauw-50 font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700',
                      )}
                      onClick={() => pickProject(project.id)}
                    >
                      <FolderOpen size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))}
                  {activeProjectId && (
                    <button
                      type="button"
                      className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-2 py-1.5 text-left text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
                      onClick={() => pickProject(null)}
                    >
                      <X size={14} className="shrink-0" />
                      Losmaken van het project
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Denken: het model redeneert eerst en antwoordt daarna pas. Blijft
              aan tussen beurten, want wie aan een zwaardere vraag werkt, werkt er
              meestal een gesprek lang aan. */}
          {onToggleThinking && (
            <ThinkingToggle
              value={thinking}
              onChange={onToggleThinking}
              disabled={disabled || streaming}
              unavailableReason={thinkingUnavailable}
            />
          )}

          {/* Zoeken op internet: de AI haalt er bronnen bij en verwijst ernaar.
              Naast "Denken", want het is dezelfde afweging: je wacht langer voor
              een beter onderbouwd antwoord. */}
          {onToggleWebSearch && (
            <WebSearchToggle
              value={webSearch}
              onChange={onToggleWebSearch}
              disabled={disabled || streaming}
            />
          )}

          {allowAttachments && (
            <>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  disabled || streaming || extracting || attachments.length >= MAX_CHAT_ATTACHMENTS
                }
                title={
                  attachments.length >= MAX_CHAT_ATTACHMENTS
                    ? `Maximaal ${MAX_CHAT_ATTACHMENTS} bijlagen per chat`
                    : 'Document toevoegen (PDF, Word, tekst, max. 10 MB)'
                }
                aria-label="Document toevoegen"
              >
                {extracting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Paperclip size={18} />
                )}
              </button>
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
            </>
          )}

          {streaming ? (
            <button
              type="button"
              className="opl-btn-secondary ml-auto shrink-0 !rounded-lg !px-3 !py-1.5"
              onClick={onStop}
              aria-label="Stop het antwoord"
            >
              <Square size={15} /> Stop
            </button>
          ) : (
            <button
              type="button"
              className={clsx(
                'opl-btn-primary ml-auto shrink-0 !rounded-lg !px-3 !py-1.5',
                !canSend && 'opacity-50',
              )}
              onClick={submit}
              disabled={!canSend}
              aria-label="Verstuur"
            >
              <Send size={15} /> Verstuur
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

      {/* Na een verbetering: één klik terug naar de eigen tekst. Verdwijnt zodra
          de gebruiker zelf verder typt of het bericht verstuurt. */}
      {canUndo && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
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

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="hidden sm:inline">Enter = verzenden · Shift+Enter = nieuwe regel</span>
          {allowAttachments && (
            <>
              <span className="hidden sm:inline"> · </span>
              max. {MAX_CHAT_ATTACHMENTS} bijlagen, 10&nbsp;MB
              <span className="hidden sm:inline"> per stuk · sleep ze hierheen of klik op de paperclip</span>
            </>
          )}
        </p>
        <span className="shrink-0">{badge}</span>
      </div>
    </div>
  );
});

export default ChatComposer;
