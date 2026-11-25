import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from '@/components/common/icons';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { categoryIcon } from '@/lib/categoryIcons';
import { toggled } from '@/lib/utils';
import useDialogFocus from '@/lib/useDialogFocus';
import type { AdvancedPromptFilters } from '@/types';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: AdvancedPromptFilters;
  onChange: (patch: Partial<AdvancedPromptFilters>) => void;
  /** Aantal resultaten met deze filters; null zolang er gezocht wordt. */
  resultCount: number | null;
  /**
   * Hoeveel prompts elke optie oplevert binnen de andere keuzes. Een optie zonder
   * prompts verdwijnt, tenzij hij aanstaat: dan moet hij uit kunnen.
   */
  counts: FacetCounts;
}

export interface FacetCounts {
  categories: Map<string, number>;
}

/**
 * Het filterpaneel van Ontdekken. Een keuze werkt meteen door in de resultaten,
 * dus er valt niets te verliezen: anders dan bij Modal sluit hij ook met Escape
 * en met een klik ernaast.
 *
 * Een categorie zonder prompts binnen de andere keuzes verdwijnt, en elke optie
 * toont hoeveel prompts hij oplevert. De rasters rekenen in rem: met grote letters
 * op een smal scherm krijgen ze vanzelf minder kolommen.
 */
export default function FilterPanel({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
  counts,
}: FilterPanelProps) {
  const { categories } = useReferenceData();
  const panelRef = useRef<HTMLElement>(null);

  useDialogFocus(open, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  // Alleen wat binnen de keuze bestaat, plus wat aanstaat zodat het uit kan.
  const catSel = filters.category_ids ?? [];
  const shownCategories = categories.filter(
    (c) => (counts.categories.get(c.id) ?? 0) > 0 || catSel.includes(c.id),
  );

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 dark:bg-black/60"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-kop"
        className="absolute inset-y-0 right-0 flex w-full max-w-md animate-fade-in flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] focus:outline-none border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 py-3 pl-5 pr-3 dark:border-slate-700">
          <h2
            id="filter-kop"
            className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit filters"
            className="flex h-11 w-11 items-center justify-center rounded text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {shownCategories.length > 0 && (
            <FilterGroup title="Categorie">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1.5">
                {shownCategories.map((c) => {
                  const Icon = categoryIcon(c.icon);
                  return (
                    <ToggleButton
                      key={c.id}
                      active={catSel.includes(c.id)}
                      onClick={() =>
                        onChange({ category_ids: toggled(filters.category_ids, c.id) })
                      }
                      className="justify-start gap-2 text-left text-sm"
                    >
                      <Icon size={18} className="shrink-0" />
                      <span className="min-w-0 flex-1">{c.name}</span>
                      <Count n={counts.categories.get(c.id) ?? 0} />
                    </ToggleButton>
                  );
                })}
              </div>
            </FilterGroup>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
            <div>
              <label htmlFor="filter-van" className="opl-label">
                Vanaf
              </label>
              <input
                id="filter-van"
                type="date"
                className="opl-input"
                value={filters.date_from ?? ''}
                onChange={(e) => onChange({ date_from: e.target.value || null })}
              />
            </div>
            <div>
              <label htmlFor="filter-tot" className="opl-label">
                Tot
              </label>
              <input
                id="filter-tot"
                type="date"
                className="opl-input"
                value={filters.date_to ?? ''}
                onChange={(e) => onChange({ date_to: e.target.value || null })}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={() =>
              onChange({
                category_ids: [],
                kinds: [],
                date_from: null,
                date_to: null,
              })
            }
            className="opl-btn-ghost"
          >
            Wissen
          </button>
          <button type="button" onClick={onClose} className="opl-btn-primary">
            {resultCount === null
              ? 'Toon resultaten'
              : `Toon ${resultCount} ${resultCount === 1 ? 'resultaat' : 'resultaten'}`}
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/** Hoeveel prompts een optie oplevert. Op een gekozen (blauwe) knop erft hij het wit. */
function Count({ n }: { n: number }) {
  return (
    <span className="shrink-0 text-xs font-normal tabular-nums opacity-80">
      {n}
      <span className="sr-only"> prompts</span>
    </span>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {children}
    </section>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Volledige naam als de knop zelf alleen een code toont. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={clsx(
        'flex min-h-[2.75rem] items-center rounded border px-2 py-1 leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-800',
        active
          ? 'border-rijksblauw-700 bg-rijksblauw-700 text-white dark:border-rijksblauw-600 dark:bg-rijksblauw-600'
          : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700',
        className,
      )}
    >
      {children}
    </button>
  );
}
