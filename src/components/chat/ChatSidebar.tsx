import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry } from '@/types';

/**
 * Gesprekkenlijst (desktop). Puur presentationeel: verwijderacties vragen de
 * pagina om bevestiging via onRequestDelete/onRequestDeleteAll.
 */
export default function ChatSidebar({
  entries,
  activeId,
  disabled,
  onSelect,
  onNew,
  onRequestDelete,
  onRequestDeleteAll,
}: {
  entries: ChatIndexEntry[];
  activeId: string | null;
  /** Tijdens het streamen is wisselen/verwijderen uitgeschakeld. */
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRequestDelete: (id: string) => void;
  onRequestDeleteAll: () => void;
}) {
  return (
    /* Zit binnen dezelfde kaart als het gesprek: geen eigen rand of schaduw,
       alleen een scheidingslijn en een iets rustiger vlak. Zo lezen de lijst en
       het gesprek als één omgeving in plaats van twee losse blokken. */
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 p-3 lg:flex dark:border-slate-700 dark:bg-slate-900/40">
      <button type="button" className="opl-btn-primary w-full" onClick={onNew} disabled={disabled}>
        <Plus size={16} /> Nieuw gesprek
      </button>

      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {entries.length === 0 && (
          <p className="px-2 py-4 text-xs text-slate-400 dark:text-slate-500">
            Nog geen eerdere gesprekken op dit apparaat.
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
              aria-label={`Verwijder gesprek "${entry.title}"`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
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
