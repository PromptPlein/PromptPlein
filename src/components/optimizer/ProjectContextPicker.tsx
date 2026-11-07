import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Check,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Sparkles,
  X,
} from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { useAuth } from '@/context/AuthContext';
import { matchProject } from '@/lib/projectMatch';
import { writeNewProjectHandoff } from '@/services/handoffService';
import {
  generatorCharsUsed,
  listProjectFiles,
  MAX_GENERATOR_CONTEXT_CHARS,
  type GeneratorContext,
} from '@/services/chatProjectService';
import type { ChatProject, ChatProjectFile } from '@/types';

/** Wat een instap meegeeft om de context bij zijn eigen tekstvak te tonen. */
export interface ProjectContextSlot {
  /** De tekst in het invoerveld, voor `@` en het voorstel. */
  text: string;
  /** Haal de getypte `@` weer uit het invoerveld. */
  stripMention: () => void;
  className?: string;
}

/** Zoveel bronlabels staan er los; de rest wordt één knop "+3". */
const MAX_FILE_CHIPS = 3;

const CHIP =
  'inline-flex min-h-10 max-w-full items-center gap-1.5 rounded pl-2.5 text-sm';
const REMOVE =
  'flex h-10 w-8 shrink-0 items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500';

const nl = (n: number) => n.toLocaleString('nl-NL');

/**
 * De projectcontext van de bouwer: de knop "Context" plus de labels van wat er
 * meegaat, op de plek waar je typt. Zelfde gebaar als in de chat, en de stappen
 * erboven blijven daardoor gelijk voor wie geen project gebruikt.
 *
 * WAAROM DE KEUZELIJST EEN PORTAL IS
 * De bouwerkaart en het invoerblok hebben `overflow-hidden` voor hun ronde
 * hoeken. Een gewoon uitklapmenu wordt daar afgeknipt, dus hangt de lijst aan
 * `document.body` en wordt hij `fixed` geplaatst, net als InfoDot.
 *
 * WAAROM DE BRONKEUZE PAS BIJ "KLAAR" INGAAT
 * Elke andere selectie is ander materiaal en dus een nieuwe AI-analyse van
 * tientallen seconden. Wie drie bronnen aanvinkt wil er één, geen drie. Daarom
 * staat de selectie zolang de lijst open is in `draft`. Een label weghalen is één
 * duidelijke handeling en gaat wel meteen.
 *
 * WAT HET VOORSTEL DOET
 * Gaat de tekst zichtbaar over een eigen project, dan vraagt de strook of dat
 * mee moet. Dat vangt op dat een knop minder opvalt dan de vroegere balk: wie
 * nooit op "Context" klikt, ziet de mogelijkheid alsnog op het juiste moment.
 */
export default function ProjectContextPicker({
  projects,
  context,
  activeProjectId,
  loading,
  text,
  onStripMention,
  onPick,
  onClear,
  onSelectFiles,
  className,
}: {
  /** De projecten van de ingelogde gebruiker. */
  projects: ChatProject[];
  context: GeneratorContext | null;
  /** Het gekozen project; loopt voor op `context` zolang die nog laadt. */
  activeProjectId: string | null;
  loading: boolean;
  /** De tekst in het invoerveld, voor `@` en het voorstel. */
  text: string;
  /** Haal de getypte `@` weer uit het invoerveld. */
  onStripMention: () => void;
  onPick: (projectId: string) => void;
  onClear: () => void;
  onSelectFiles: (fileIds: string[]) => void;
  className?: string;
}) {
  const { isAuthenticated, configured } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [files, setFiles] = useState<ChatProjectFile[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // De lijst ging open door `@` te typen: dan hoort die `@` er bij het sluiten
  // weer uit en blijft de cursor in het tekstvak in plaats van op de knop.
  const openedByMention = useRef(false);
  const previousText = useRef(text);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectName = context?.name ?? activeProject?.name ?? '';
  const committed = useMemo(() => context?.files.map((f) => f.id) ?? [], [context]);
  const selected = draft ?? committed;

  // De bestandenlijst hoort bij het project, niet bij het openen van de lijst:
  // zo staat hij klaar en springt de lijst niet in hoogte.
  useEffect(() => {
    setFiles([]);
    if (!activeProjectId) return;
    let active = true;
    listProjectFiles(activeProjectId)
      .then((list) => {
        if (active) setFiles(list);
      })
      .catch(() => {
        /* zonder lijst blijft de instructie gewoon meegaan */
      });
    return () => {
      active = false;
    };
  }, [activeProjectId]);

  function close() {
    setOpen(false);
    if (draft && [...draft].sort().join() !== [...committed].sort().join()) {
      onSelectFiles(draft);
    }
    setDraft(null);
    if (openedByMention.current) {
      openedByMention.current = false;
      if (text.endsWith('@')) onStripMention();
    } else {
      anchorRef.current?.focus();
    }
  }

  // `@` aan het begin van een woord opent de lijst; een e-mailadres niet. Typt
  // iemand daarna gewoon door, dan was het niet voor ons bedoeld.
  useEffect(() => {
    const previous = previousText.current;
    previousText.current = text;
    if (text.length === previous.length + 1 && /(^|\s)@$/.test(text)) {
      openedByMention.current = true;
      setOpen(true);
    } else if (open && openedByMention.current && !text.endsWith('@')) {
      openedByMention.current = false;
      setOpen(false);
    }
  }, [text, open]);

  // Eerst onzichtbaar renderen, dan plaatsen: onder de knop als daar ruimte is,
  // anders erboven, en altijd binnen het venster. De lijst scrolt zelf.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const margin = 8;
      const width = Math.min(360, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
      const below = window.innerHeight - anchor.bottom - margin * 2;
      const above = anchor.top - margin * 2;
      setPos(
        below >= 320 || below >= above
          ? { left, width, maxHeight: below, top: anchor.bottom + margin }
          : { left, width, maxHeight: above, bottom: window.innerHeight - anchor.top + margin },
      );
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // close leest de actuele draft en tekst, dus deze effect moet die volgen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, committed, text]);

  const suggestion = useMemo(() => {
    if (activeProjectId || loading || !isAuthenticated) return null;
    return matchProject(
      text,
      projects.filter((p) => !dismissed.includes(p.id)),
    );
  }, [activeProjectId, loading, isAuthenticated, text, projects, dismissed]);

  // Mock-modus (geen backend): dan bestaan projecten niet.
  if (!configured) return null;

  function pickProject(id: string) {
    if (id === activeProjectId) return;
    setDraft(null);
    onPick(id);
  }

  function toggleFile(id: string) {
    setDraft(selected.includes(id) ? selected.filter((f) => f !== id) : [...selected, id]);
  }

  const chosenFiles = files.filter((f) => selected.includes(f.id));
  const used = generatorCharsUsed(activeProject?.instructions ?? '', chosenFiles);
  const over = used > MAX_GENERATOR_CONTEXT_CHARS;

  // De labels tonen wat er echt meegaat, niet wat er in de lijst is aangevinkt:
  // een bron die niet paste hoort hier niet te staan alsof de AI hem kent.
  const chips = context?.files ?? [];
  const hiddenChips = chips.length - MAX_FILE_CHIPS;

  const panel = open && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Context kiezen"
      className="fixed z-50 flex flex-col rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800"
      style={{
        left: pos?.left ?? 0,
        width: pos?.width ?? 360,
        maxHeight: pos?.maxHeight,
        top: pos?.top,
        bottom: pos?.bottom,
        opacity: pos ? 1 : 0,
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {isAuthenticated ? (
          <>
            {projects.length > 0 && (
              <p className="px-2.5 pb-1 pt-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                Project
              </p>
            )}
            {projects.map((project) => {
              const active = project.id === activeProjectId;
              return (
                <button
                  key={project.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickProject(project.id)}
                  className={clsx(
                    'flex min-h-11 w-full items-center gap-2 rounded px-2.5 text-left text-[0.9375rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                    active
                      ? 'bg-rijksblauw-50 font-semibold text-slate-900 dark:bg-rijksblauw-500/15 dark:text-white'
                      : 'text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700',
                  )}
                >
                  <FolderOpen size={16} className="shrink-0 text-rijksblauw-500 dark:text-rijksblauw-300" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {active && (
                    <Check size={16} className="shrink-0 text-rijksblauw-500 dark:text-rijksblauw-300" />
                  )}
                </button>
              );
            })}

            {activeProjectId && files.length > 0 && (
              <>
                <div className="mx-1 my-1.5 border-t border-slate-200 dark:border-slate-700" />
                <p className="px-2.5 pb-1 pt-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                  Bronnen
                </p>
                {files.map((file) => {
                  const on = selected.includes(file.id);
                  return (
                    <button
                      key={file.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleFile(file.id)}
                      className="flex min-h-11 w-full items-center gap-2.5 rounded px-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <span
                        aria-hidden
                        className={clsx(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
                          on
                            ? 'border-rijksblauw-500 bg-rijksblauw-500 text-white'
                            : 'border-slate-400 dark:border-slate-500',
                        )}
                      >
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">
                        {nl(file.chars)}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        ) : (
          <p className="px-2.5 py-2 text-sm text-slate-700 dark:text-slate-200">
            Log in om een project te gebruiken.
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 p-1.5 dark:border-slate-700">
        {activeProjectId && files.length > 0 && (
          <p
            className={clsx(
              'px-2.5 pb-1.5 pt-1 text-[0.8125rem] font-medium',
              over ? 'text-amber-800 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300',
            )}
          >
            {over
              ? 'Past niet meer: zet een bron uit.'
              : `${nl(used)} van ${nl(MAX_GENERATOR_CONTEXT_CHARS)} tekens`}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {isAuthenticated ? (
            <Link
              to="/chat"
              onClick={writeNewProjectHandoff}
              className="inline-flex min-h-11 items-center gap-1.5 rounded px-2.5 text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200 dark:hover:bg-slate-700"
            >
              <Plus size={15} /> Nieuw project
            </Link>
          ) : (
            <Link
              to="/auth/login"
              className="inline-flex min-h-11 items-center rounded px-2.5 text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200 dark:hover:bg-slate-700"
            >
              Inloggen
            </Link>
          )}
          {activeProjectId && (
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                onClear();
              }}
              className="inline-flex min-h-11 items-center rounded px-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Verder zonder project
            </button>
          )}
          <button type="button" onClick={close} className="opl-btn-primary ml-auto">
            Klaar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          ref={anchorRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded border border-rijksblauw-500 bg-white px-3 text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:bg-slate-800 dark:text-rijksblauw-200 dark:hover:bg-slate-700"
        >
          <Plus size={15} /> Context
        </button>

        {activeProjectId && projectName && (
          <span className={clsx(CHIP, 'bg-rijksblauw-700 font-semibold text-white dark:bg-rijksblauw-500')}>
            {loading ? (
              <Loader2 size={15} className="shrink-0 animate-spin" />
            ) : (
              <FolderOpen size={15} className="shrink-0" />
            )}
            <span className="min-w-0 truncate">{projectName}</span>
            <button
              type="button"
              onClick={onClear}
              aria-label="Project loskoppelen"
              className={REMOVE}
            >
              <X size={15} />
            </button>
          </span>
        )}

        {chips.slice(0, MAX_FILE_CHIPS).map((file) => (
          <span
            key={file.id}
            className={clsx(
              CHIP,
              'bg-rijksblauw-50 font-medium text-rijksblauw-800 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100',
            )}
          >
            <FileText size={15} className="shrink-0" />
            <span className="min-w-0 truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => onSelectFiles(committed.filter((id) => id !== file.id))}
              aria-label={`${file.name} weghalen`}
              className={REMOVE}
            >
              <X size={15} />
            </button>
          </span>
        ))}

        {hiddenChips > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Nog ${hiddenChips} bronnen bekijken`}
            className="inline-flex min-h-10 items-center rounded bg-rijksblauw-50 px-2.5 text-sm font-semibold text-rijksblauw-800 transition-colors hover:bg-rijksblauw-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100"
          >
            +{hiddenChips}
          </button>
        )}

        {loading && (
          <span className="text-[0.8125rem] text-slate-600 dark:text-slate-300">
            Je project wordt geanalyseerd…
          </span>
        )}

        {suggestion && !open && (
          <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded bg-rijksblauw-50 pl-2.5 text-sm text-rijksblauw-900 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100">
            <Sparkles size={15} className="shrink-0" />
            <span className="min-w-0 font-medium">Dit lijkt op je project {suggestion.name}.</span>
            <button
              type="button"
              onClick={() => pickProject(suggestion.id)}
              className="min-h-10 rounded px-2 text-sm font-semibold text-rijksblauw-700 underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200"
            >
              Meenemen
            </button>
            <button
              type="button"
              onClick={() => setDismissed((list) => [...list, suggestion.id])}
              aria-label="Voorstel sluiten"
              className={REMOVE}
            >
              <X size={15} />
            </button>
          </span>
        )}

        {!activeProjectId && !suggestion && (
          <InfoDot
            label="Uitleg over context"
            text={'Voeg een project toe. De AI kent je onderwerp dan al en schrijft een scherpere prompt.\nTyp @ om te kiezen.'}
          />
        )}
      </div>

      {context && context.skipped.length > 0 && (
        <p className="mt-1.5 text-[0.8125rem] font-medium text-amber-800 dark:text-amber-400">
          Past niet meer, weggelaten: {context.skipped.join(', ')}. Haal een bron weg.
        </p>
      )}

      {panel && createPortal(panel, document.body)}
    </div>
  );
}
