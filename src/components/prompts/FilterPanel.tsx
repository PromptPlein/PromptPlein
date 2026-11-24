import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from '@/components/common/icons';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import { categoryIcon } from '@/lib/categoryIcons';
import { SHARING_LEVELS, toggled } from '@/lib/utils';
import { directorateOf, ministryOf, orgChain, orgDisplayName, orgSubtreeIds } from '@/lib/orgTree';
import type { Organization } from '@/types';
import useDialogFocus from '@/lib/useDialogFocus';
import type { AdvancedPromptFilters, SharingLevel } from '@/types';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: AdvancedPromptFilters;
  onChange: (patch: Partial<AdvancedPromptFilters>) => void;
  /** Aantal resultaten met deze filters; null zolang er gezocht wordt. */
  resultCount: number | null;
  /**
   * Hoeveel prompts elke optie oplevert binnen "Zoek binnen" en de andere keuzes.
   * Een optie zonder prompts verdwijnt, tenzij hij aanstaat: dan moet hij uit kunnen.
   */
  counts: FacetCounts;
}

export interface FacetCounts {
  categories: Map<string, number>;
  roles: Map<string, number>;
  levels: Map<string, number>;
}

/**
 * Het filterpaneel van Ontdekken. Een keuze werkt meteen door in de resultaten,
 * dus er valt niets te verliezen: anders dan bij Modal sluit hij ook met Escape
 * en met een klik ernaast.
 *
 * "Zoek binnen" staat bovenaan en bepaalt wat de rest toont: categorieën, functies
 * en deelniveaus zonder prompts binnen die keuze verdwijnen, en elke optie toont
 * hoeveel prompts hij oplevert.
 *
 * "Zoek binnen" is één keuze: alles wat je mag zien, je
 * afdeling, je directie, je ministerie, of wat voor de hele Rijksoverheid is
 * goedgekeurd. Een balkje laat zien hoe breed dat is. Alleen je eigen lijn, die
 * volgt uit je afdeling: een andere afdeling of directie is bewust niet te kiezen.
 * Een laag neemt alles mee wat eronder valt (zie `searchOrgIds`). De rasters rekenen in rem: met grote letters op een smal
 * scherm krijgen ze vanzelf minder kolommen.
 */
export default function FilterPanel({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
  counts,
}: FilterPanelProps) {
  const { categories, organizations, roles } = useReferenceData();
  const { profile } = useAuth();
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

  // Je eigen lagen, van klein naar groot.
  const selectedOrgs = filters.organization_ids ?? [];
  const ownOrgId = profile?.organization_id ?? null;
  const ownMinistry = ownOrgId ? ministryOf(ownOrgId, organizations) : null;
  const ownChain = orgChain(ownOrgId, organizations);
  const ownDeepest = ownChain.length ? ownChain[ownChain.length - 1] : null;
  const ownAfdeling = ownDeepest?.organization_type === 'department' ? ownDeepest : null;
  const ownDirectie = directorateOf(ownOrgId, organizations);

  type Scope = 'alles' | 'afdeling' | 'directie' | 'ministerie' | 'rijk';
  const scopes: { key: Scope; label: string; org: Organization | null; width: number }[] = [
    { key: 'alles', label: 'Alles wat je mag zien', org: null, width: 0 },
    { key: 'afdeling', label: 'Jouw afdeling', org: ownAfdeling, width: 1 },
    { key: 'directie', label: 'Jouw directie of dienst', org: ownDirectie, width: 2 },
    { key: 'ministerie', label: 'Jouw ministerie', org: ownMinistry, width: 3 },
    { key: 'rijk', label: 'Rijksoverheid', org: null, width: 4 },
  ];
  const shown = scopes.filter((sc) => sc.key === 'alles' || sc.key === 'rijk' || sc.org);

  // Welke keuze staat aan? De diepste gekozen organisatie telt.
  const deepestSelected = selectedOrgs.filter(
    (id) => !selectedOrgs.some((o) => o !== id && orgSubtreeIds(id, organizations).includes(o)),
  );
  const pickedId = deepestSelected.length === 1 ? deepestSelected[0] : null;
  const current: Scope = filters.rijksbreed
    ? 'rijk'
    : (shown.find((sc) => sc.org && sc.org.id === pickedId)?.key ?? 'alles');

  // Alleen wat binnen de keuze bestaat, plus wat aanstaat zodat het uit kan.
  const catSel = filters.category_ids ?? [];
  const roleSel = filters.role_ids ?? [];
  const levelSel = filters.sharing_levels ?? [];
  const shownCategories = categories.filter(
    (c) => (counts.categories.get(c.id) ?? 0) > 0 || catSel.includes(c.id),
  );
  const shownRoles = roles.filter(
    (r) => (counts.roles.get(r.id) ?? 0) > 0 || roleSel.includes(r.id),
  );
  const shownLevels = SHARING_LEVELS.filter(
    (s) => (counts.levels.get(s.value) ?? 0) > 0 || levelSel.includes(s.value),
  );
  const nothing =
    resultCount !== null &&
    !shownCategories.length &&
    !shownRoles.length &&
    !shownLevels.length;

  function chooseScope(scope: (typeof scopes)[number]) {
    onChange({
      rijksbreed: scope.key === 'rijk',
      organization_ids: scope.org ? [scope.org.id] : [],
    });
  }

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
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              Zoek binnen
            </legend>
            <div className="space-y-2">
              {shown.map((sc) => {
                const active = current === sc.key;
                return (
                  <label
                    key={sc.key}
                    className={clsx(
                      'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                      active
                        ? 'border-rijksblauw-700 bg-rijksblauw-50/70 shadow-[inset_4px_0_0_theme(colors.nadruk.DEFAULT)] dark:border-rijksblauw-400 dark:bg-rijksblauw-500/15'
                        : 'border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/50',
                    )}
                  >
                    <input
                      type="radio"
                      name="zoek-binnen"
                      checked={active}
                      onChange={() => chooseScope(sc)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-rijksblauw-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {sc.label}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {sc.org
                          ? orgDisplayName(sc.org)
                          : sc.key === 'rijk'
                            ? 'Goedgekeurd voor de hele Rijksoverheid'
                            : 'Geen beperking op organisatie'}
                      </span>
                      {sc.width > 0 && (
                        // Hoe breed je zoekt; alleen voor het oog, de tekst zegt het al.
                        <span aria-hidden className="mt-1.5 flex gap-1">
                          {[1, 2, 3, 4].map((n) => (
                            <span
                              key={n}
                              className={clsx(
                                'h-1.5 flex-1 rounded-full',
                                n <= sc.width
                                  ? 'bg-rijksblauw-600 dark:bg-rijksblauw-300'
                                  : 'bg-slate-200 dark:bg-slate-600',
                              )}
                            />
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {nothing && (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Binnen deze keuze staan nog geen prompts.
              </p>
            )}

            {!ownMinistry && (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                {profile
                  ? 'Kies je ministerie en afdeling op je profiel om binnen je eigen organisatie te zoeken.'
                  : 'Log in om binnen je eigen organisatie te zoeken.'}
              </p>
            )}
          </fieldset>

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

          {shownRoles.length > 0 && (
            <FilterGroup title="Functie">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3">
                {shownRoles.map((r) => (
                  <label
                    key={r.id}
                    className="flex min-h-[2.25rem] cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={roleSel.includes(r.id)}
                      onChange={() => onChange({ role_ids: toggled(filters.role_ids, r.id) })}
                      className="h-[1.125rem] w-[1.125rem] shrink-0 accent-rijksblauw-500"
                    />
                    <span className="min-w-0 flex-1">{r.name}</span>
                    <Count n={counts.roles.get(r.id) ?? 0} />
                  </label>
                ))}
              </div>
            </FilterGroup>
          )}

          {shownLevels.length > 0 && (
            <FilterGroup title="Deelniveau">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1.5">
                {shownLevels.map((s) => (
                  <ToggleButton
                    key={s.value}
                    active={levelSel.includes(s.value)}
                    onClick={() =>
                      onChange({
                        sharing_levels: toggled<SharingLevel>(filters.sharing_levels, s.value),
                      })
                    }
                    className="justify-between gap-2 text-left text-sm"
                  >
                    {s.label}
                    <Count n={counts.levels.get(s.value) ?? 0} />
                  </ToggleButton>
                ))}
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
                organization_ids: [],
                role_ids: [],
                sharing_levels: [],
                rijksbreed: false,
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
