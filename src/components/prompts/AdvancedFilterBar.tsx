import { Search, X, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { SHARING_LEVELS } from '@/lib/utils';
import type { AdvancedPromptFilters, SharingLevel, SortOption } from '@/types';

interface AdvancedFilterBarProps {
  filters: AdvancedPromptFilters;
  onChange: (next: AdvancedPromptFilters) => void;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Nieuwste eerst' },
  { value: 'oldest', label: 'Oudste eerst' },
  { value: 'title', label: 'Titel (A–Z)' },
  { value: 'most_shared', label: 'Meest gedeeld' },
];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-rijksblauw-500 bg-rijksblauw-500 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {label}
    </button>
  );
}

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const set = new Set(list ?? []);
  set.has(value) ? set.delete(value) : set.add(value);
  return [...set];
}

export default function AdvancedFilterBar({ filters, onChange }: AdvancedFilterBarProps) {
  const { categories, roles, techniques, organizations } = useReferenceData();
  const [expanded, setExpanded] = useState(true);

  function update(patch: Partial<AdvancedPromptFilters>) {
    onChange({ ...filters, ...patch });
  }

  const activeCount =
    (filters.category_ids?.length ?? 0) +
    (filters.role_ids?.length ?? 0) +
    (filters.organization_ids?.length ?? 0) +
    (filters.technique_ids?.length ?? 0) +
    (filters.sharing_levels?.length ?? 0) +
    (filters.date_from ? 1 : 0) +
    (filters.date_to ? 1 : 0);

  return (
    <div className="opl-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={filters.query ?? ''}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Zoek op titel, omschrijving of inhoud…"
            className="opl-input pl-10"
            aria-label="Zoek prompts"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="opl-input w-auto"
            value={filters.sort ?? 'newest'}
            onChange={(e) => update({ sort: e.target.value as SortOption })}
            aria-label="Sorteren"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={clsx('opl-btn-secondary', activeCount > 0 && 'border-rijksblauw-300 text-rijksblauw-600 dark:text-rijksblauw-300')}
          >
            <SlidersHorizontal size={16} /> Filters
            {activeCount > 0 && (
              <span className="ml-1 rounded-full bg-rijksblauw-500 px-1.5 text-xs text-white">{activeCount}</span>
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <FilterGroup label="Categorieën">
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={filters.category_ids?.includes(c.id) ?? false}
                onClick={() => update({ category_ids: toggle(filters.category_ids, c.id) })}
              />
            ))}
          </FilterGroup>

          {organizations.length > 0 && (
            <FilterGroup label="Organisaties">
              {organizations.map((o) => (
                <Chip
                  key={o.id}
                  label={o.code ? `${o.name} (${o.code})` : o.name}
                  active={filters.organization_ids?.includes(o.id) ?? false}
                  onClick={() => update({ organization_ids: toggle(filters.organization_ids, o.id) })}
                />
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Rollen">
            {roles.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                active={filters.role_ids?.includes(r.id) ?? false}
                onClick={() => update({ role_ids: toggle(filters.role_ids, r.id) })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Technieken">
            {techniques.map((t) => (
              <Chip
                key={t.id}
                label={t.name}
                active={filters.technique_ids?.includes(t.id) ?? false}
                onClick={() => update({ technique_ids: toggle(filters.technique_ids, t.id) })}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Deelniveau">
            {SHARING_LEVELS.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                active={filters.sharing_levels?.includes(s.value) ?? false}
                onClick={() =>
                  update({ sharing_levels: toggle<SharingLevel>(filters.sharing_levels, s.value) })
                }
              />
            ))}
          </FilterGroup>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="opl-label">Vanaf datum</label>
              <input
                type="date"
                className="opl-input"
                value={filters.date_from ?? ''}
                onChange={(e) => update({ date_from: e.target.value || null })}
              />
            </div>
            <div>
              <label className="opl-label">Tot datum</label>
              <input
                type="date"
                className="opl-input"
                value={filters.date_to ?? ''}
                onChange={(e) => update({ date_to: e.target.value || null })}
              />
            </div>
            {activeCount > 0 && (
              <button
                onClick={() => onChange({ query: filters.query, sort: filters.sort, favorites_only: filters.favorites_only })}
                className="inline-flex items-center gap-1 pb-2 text-sm text-rijksblauw-500 hover:text-rijksblauw-700 dark:hover:text-rijksblauw-200"
              >
                <X size={14} /> Filters wissen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
