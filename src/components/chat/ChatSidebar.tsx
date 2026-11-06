import { useEffect, useRef, useState } from 'react';
import { FolderOpen, MessageSquare, Plus, Trash2 } from '@/components/common/icons';
import clsx from 'clsx';
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry, ChatProject } from '@/types';

/**
 * Zijbalk (desktop): projecten boven, losse gesprekken eronder.
 *
 * De volgorde is de boodschap. Een project is een plek waar je naartoe gaat en
 * waar je werk zich verzamelt; een los gesprek is een losse vraag. Gesprekken
 * die bij een project horen staan daarom NIET in de lijst hieronder maar in het
 * project zelf — anders zou dezelfde chat op twee plaatsen staan en zou de
 * lijst voor iemand met een druk project onbruikbaar worden.
 *
 * Puur presentationeel: verwijderacties vragen de pagina om bevestiging via
 * onRequestDelete/onRequestDeleteAll.
 */
/**
 * Kopregel van een lijst met het plusje rechts op dezelfde hoogte.
 *
 * Het kopje en de knop delen één regel zodat "Projecten" en "Chats" precies
 * dezelfde vorm hebben: label links, plus helemaal rechts. Het plusje is
 * bewust ingetogen (klein, grijs) — de grote knop bovenaan blijft de hoofdweg,
 * dit is de snelkoppeling voor wie al weet waar hij heen wil.
 */
function SectionHeading({
  label,
  addLabel,
  onAdd,
  disabled,
  className,
}: {
  label: string;
  /** Wat de knop doet, in gewone taal — wordt het toegankelijkheidslabel. */
  addLabel: string;
  onAdd: () => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center gap-2 px-2 pb-1 pt-1', className)}>
      <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <button
        type="button"
        className="-mr-1 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        onClick={onAdd}
        disabled={disabled}
        aria-label={addLabel}
        title={addLabel}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default function ChatSidebar({
  entries,
  totalConversations,
  projects,
  activeId,
  openProjectId,
  disabled,
  onSelect,
  onNew,
  onNewProject,
  onOpenProject,
  onRequestDelete,
  onRequestDeleteAll,
}: {
  /** Alleen de LOSSE gesprekken; projectgesprekken staan in hun project. */
  entries: ChatIndexEntry[];
  /**
   * Totaal aantal gesprekken op dit apparaat, projectgesprekken meegeteld.
   * "Alles verwijderen" wist ze namelijk állemaal, dus die knop mag niet
   * verdwijnen zodra alleen de losse lijst leeg is.
   */
  totalConversations: number;
  projects: ChatProject[];
  activeId: string | null;
  /** Het project dat op dit moment geopend is (de projectpagina). */
  openProjectId: string | null;
  /** Tijdens het streamen is wisselen/verwijderen uitgeschakeld. */
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestDeleteAll: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    /* Zit binnen dezelfde kaart als het gesprek: geen eigen rand of schaduw,
       alleen een scheidingslijn en een iets rustiger vlak. Zo lezen de lijst en
       het gesprek als één omgeving in plaats van twee losse blokken. */
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 p-3 lg:flex dark:border-slate-700 dark:bg-slate-900/40">
      {/* Eén knop met een klein menu erachter: nieuw gesprek is de gewone daad,
          nieuw project de zeldzame. Twee even grote knoppen zouden suggereren
          dat je elke keer moet kiezen. */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="opl-btn-primary w-full"
          onClick={() => setMenuOpen((open) => !open)}
          disabled={disabled}
          aria-expanded={menuOpen}
        >
          <Plus size={16} /> Nieuw
        </button>
        {menuOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => {
                setMenuOpen(false);
                onNew();
              }}
            >
              <MessageSquare size={15} className="shrink-0 text-slate-400" />
              Nieuwe chat
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => {
                setMenuOpen(false);
                onNewProject();
              }}
            >
              <FolderOpen size={15} className="shrink-0 text-slate-400" />
              Nieuw project
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {/* De kopregels zijn tegelijk de snelste weg naar "nog een erbij": het
            plusje staat rechts op dezelfde regel als het kopje. Daarom staan ze
            er ook als de lijst nog leeg is — anders is de knop pas te vinden
            nadat je al een project hebt. */}
        <SectionHeading label="Projecten" addLabel="Nieuw project" onAdd={onNewProject} disabled={disabled} />
        {projects.length > 0 && (
          <>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  project.id === openProjectId
                    ? 'bg-rijksblauw-50 font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
                onClick={() => onOpenProject(project.id)}
                disabled={disabled}
              >
                <FolderOpen size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {Boolean(project.fileCount) && (
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                    {project.fileCount}
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        <SectionHeading label="Chats" addLabel="Nieuwe chat" onAdd={onNew} disabled={disabled} className="pt-3" />

        {entries.length === 0 && (
          <p className="px-2 py-4 text-xs text-slate-400 dark:text-slate-500">
            Nog geen eerdere chats op dit apparaat.
          </p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={clsx(
              'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
              entry.id === activeId
                ? 'bg-rijksblauw-50 dark:bg-rijksblauw-500/15'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left"
              onClick={() => onSelect(entry.id)}
              disabled={disabled}
            >
              <span
                className={clsx(
                  'flex w-full items-center gap-1.5 text-sm',
                  entry.id === activeId
                    ? 'font-medium text-rijksblauw-700 dark:text-rijksblauw-200'
                    : 'text-slate-700 dark:text-slate-300',
                )}
              >
                <MessageSquare size={13} className="shrink-0" />
                <span className="truncate">{entry.title}</span>
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {formatDate(entry.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-rijksrood group-hover:opacity-100 dark:hover:bg-slate-700"
              onClick={() => onRequestDelete(entry.id)}
              disabled={disabled}
              aria-label={`Verwijder chat "${entry.title}"`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {totalConversations > 0 && (
        <button
          type="button"
          className="opl-btn-ghost mt-2 w-full text-rijksrood dark:text-red-400"
          onClick={onRequestDeleteAll}
          disabled={disabled}
        >
          <Trash2 size={14} /> Alles verwijderen
        </button>
      )}
    </aside>
  );
}
