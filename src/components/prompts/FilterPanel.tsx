import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from '@/components/common/icons';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import { categoryIcon } from '@/lib/categoryIcons';
import { SHARING_LEVELS, toggled } from '@/lib/utils';
import { descendantsInOrder, ministryOf, orgChain, orgDisplayName, orgSubtreeIds } from '@/lib/orgTree';
import useDialogFocus from '@/lib/useDialogFocus';
import type { AdvancedPromptFilters, SharingLevel } from '@/types';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: AdvancedPromptFilters;
  onChange: (patch: Partial<AdvancedPromptFilters>) => void;
  /** Aantal resultaten met deze filters; null zolang er gezocht wordt. */
  resultCount: number | null;
}

/**
 * Het filterpaneel van Ontdekken. Een keuze werkt meteen door in de resultaten,
 * dus er valt niets te verliezen: anders dan bij Modal sluit hij ook met Escape
 * en met een klik ernaast.
 *
 * Bij Organisatie staat eerst de knop Rijksoverheid: alles wat is goedgekeurd
 * voor de hele Rijksoverheid. Daaronder alleen je eigen ministerie, met de
 * directies en afdelingen eronder als boom; andere ministeries staan er bewust
 * niet bij. Je eigen directie en afdeling zijn gemarkeerd. Filteren op een laag
 * neemt alles mee wat eronder valt; een diepere keuze vernauwt dat (zie
 * `searchOrgIds`). De rasters rekenen in rem: met grote letters op een smal
 * scherm krijgen ze vanzelf minder kolommen.
 */
export default function FilterPanel({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
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

  // Alleen je eigen ministerie, met alles eronder; je eigen lagen zijn gemarkeerd.
  const selectedOrgs = filters.organization_ids ?? [];
  const ownMinistry = profile?.organization_id
    ? ministryOf(profile.organization_id, organizations)
    : null;
  const ownPath = new Set(orgChain(profile?.organization_id, organizations).map((o) => o.id));
  const ownTree = ownMinistry
    ? [{ org: ownMinistry, depth: 0 }, ...descendantsInOrder(ownMinistry.id, organizations)]
    : [];

  function toggleOrg(id: string) {
    onChange({
      // Een laag uitzetten zet ook wat eronder gekozen is uit.
      organization_ids: selectedOrgs.includes(id)
        ? selectedOrgs.filter((other) => !orgSubtreeIds(id, organizations).includes(other))
        : [...selectedOrgs, id],
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
          <FilterGroup title="Categorie">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1.5">
              {categories.map((c) => {
                const Icon = categoryIcon(c.icon);
                return (
                  <ToggleButton
                    key={c.id}
                    active={filters.category_ids?.includes(c.id) ?? false}
                    onClick={() =>
                      onChange({ category_ids: toggled(filters.category_ids, c.id) })
                    }
                    className="justify-start gap-2 text-left text-sm"
                  >
                    <Icon size={18} className="shrink-0" />
                    {c.name}
                  </ToggleButton>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup title="Organisatie">
            <div className="space-y-3">
              <ToggleButton
                active={filters.rijksbreed ?? false}
                onClick={() => onChange({ rijksbreed: !filters.rijksbreed })}
                className="w-full text-left"
              >
                <span className="block py-0.5">
                  <span className="block text-sm font-semibold">Rijksoverheid</span>
                  <span className="block text-xs opacity-80">Goedgekeurd voor de hele Rijksoverheid</span>
                </span>
              </ToggleButton>

              {ownTree.length > 0 ? (
                <ul className="space-y-1.5">
                  {/* Een boom: elke laag springt in onder de laag erboven, zodat je ziet
                      waar een afdeling onder valt. */}
                  {ownTree.map(({ org, depth }) => {
                    const own = ownPath.has(org.id);
                    return (
                      <li key={org.id} style={{ paddingLeft: `${depth * 1.25}rem` }}>
                        <ToggleButton
                          active={selectedOrgs.includes(org.id)}
                          onClick={() => toggleOrg(org.id)}
                          className="w-full justify-between gap-2 text-left text-sm"
                        >
                          <span className={clsx('min-w-0', depth === 0 && 'font-semibold')}>
                            {orgDisplayName(org)}
                          </span>
                          {own && (
                            <span className="shrink-0 text-xs font-medium opacity-80">
                              {depth === 0 ? 'Jouw ministerie' : org.organization_type === 'department' ? 'Jouw afdeling' : 'Jouw directie'}
                            </span>
                          )}
                        </ToggleButton>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {profile
                    ? 'Kies je ministerie en afdeling op je profiel om binnen je eigen organisatie te filteren.'
                    : 'Log in om binnen je eigen organisatie te filteren.'}
                </p>
              )}
            </div>
          </FilterGroup>

          {roles.length > 0 && (
            <FilterGroup title="Functie">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-3">
                {roles.map((r) => (
                  <label
                    key={r.id}
                    className="flex min-h-[2.25rem] cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={filters.role_ids?.includes(r.id) ?? false}
                      onChange={() => onChange({ role_ids: toggled(filters.role_ids, r.id) })}
                      className="h-[1.125rem] w-[1.125rem] shrink-0 accent-rijksblauw-500"
                    />
                    <span className="min-w-0">{r.name}</span>
                  </label>
                ))}
              </div>
            </FilterGroup>
          )}

          <FilterGroup title="Deelniveau">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5">
              {SHARING_LEVELS.map((s) => (
                <ToggleButton
                  key={s.value}
                  active={filters.sharing_levels?.includes(s.value) ?? false}
                  onClick={() =>
                    onChange({
                      sharing_levels: toggled<SharingLevel>(filters.sharing_levels, s.value),
                    })
                  }
                  className="justify-center text-sm"
                >
                  {s.label}
                </ToggleButton>
              ))}
            </div>
          </FilterGroup>

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
