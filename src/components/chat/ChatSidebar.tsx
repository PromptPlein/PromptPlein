import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, MessageSquare, Plus, Settings2, Trash2 } from '@/components/common/icons';
import clsx from 'clsx';
import InfoDot from '@/components/common/InfoDot';
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
 * bewust ingetogen: de grote knop bovenaan blijft de hoofdweg, dit is de
 * snelkoppeling voor wie al weet waar hij heen wil. Wat een project is, staat
 * achter het infobolletje naast het kopje.
 */
function SectionHeading({
  label,
  addLabel,
  onAdd,
  disabled,
  className,
  info,
}: {
  label: string;
  /** Korte uitleg achter een infobolletje naast het kopje. */
  info?: string;
  /** Wat de knop doet, in gewone taal — wordt het toegankelijkheidslabel. */
  addLabel: string;
  onAdd: () => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-center gap-0.5 px-2 pb-1 pt-1', className)}>
      <h2 className="truncate text-sm font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
        {label}
      </h2>
      {info && <InfoDot label={`Uitleg over ${label.toLowerCase()}`} text={info} />}
      <button
        type="button"
        className="-mr-1 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:pointer-events-none disabled:opacity-40 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/15"
        onClick={onAdd}
        disabled={disabled}
        aria-label={addLabel}
        title={addLabel}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

/** Rond tegeltje met het icoon van een project of chat, zoals op de startpagina. */
function ItemIcon({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-500'
          : 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200',
      )}
    >
      {children}
    </span>
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
  const navigate = useNavigate();
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
        <SectionHeading
          label="Projecten"
          addLabel="Nieuw project"
          onAdd={onNewProject}
          disabled={disabled}
          info="Een project bundelt een instructie, bronbestanden en chats over één onderwerp."
        />
        {projects.length > 0 && (
          <>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                  project.id === openProjectId
                    ? 'bg-rijksblauw-50 font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100'
                    : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                )}
                onClick={() => onOpenProject(project.id)}
                disabled={disabled}
              >
                <ItemIcon active={project.id === openProjectId}>
                  <FolderOpen size={15} />
                </ItemIcon>
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {Boolean(project.fileCount) && (
                  <span
                    aria-label={`${project.fileCount} bronbestanden`}
                    title={`${project.fileCount} bronbestanden`}
                    className="min-w-[1.5rem] shrink-0 rounded-full bg-rijksblauw-700 px-1.5 text-center text-xs font-bold leading-6 text-white dark:bg-rijksblauw-500"
                  >
                    {project.fileCount}
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        <SectionHeading label="Chats" addLabel="Nieuwe chat" onAdd={onNew} disabled={disabled} className="pt-3" />

        {entries.length === 0 && (
          <p className="px-2 py-3 text-sm text-slate-600 dark:text-slate-400">Nog geen chats.</p>
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
              className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left"
              onClick={() => onSelect(entry.id)}
              disabled={disabled}
            >
              <ItemIcon active={entry.id === activeId}>
                <MessageSquare size={15} />
              </ItemIcon>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={clsx(
                    'truncate text-sm',
                    entry.id === activeId
                      ? 'font-semibold text-rijksblauw-700 dark:text-rijksblauw-100'
                      : 'text-slate-800 dark:text-slate-200',
                  )}
                >
                  {entry.title}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {formatDate(entry.updatedAt)}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md p-1.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-200 hover:text-rijksrood focus:opacity-100 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-700"
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
      {/* Uit tijdens het streamen, net als wisselen van chat: wegklikken zou het
          lopende antwoord afbreken. */}
      <button
        type="button"
        className="opl-btn-ghost mt-2 w-full"
        onClick={() => navigate('/instellingen/chat')}
        disabled={disabled}
      >
        <Settings2 size={14} /> Instellingen
      </button>
    </aside>
  );
}
