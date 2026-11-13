import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from '@/components/common/icons';
import FilterPanel from '@/components/prompts/FilterPanel';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { searchPrompts } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { categoryIcon } from '@/lib/categoryIcons';
import { ministryOf, orgChain, orgPathLabel, orgSubtreeIds, searchOrgIds } from '@/lib/orgTree';
import {
  activityIdentifier,
  formatDate,
  SHARING_LEVELS,
  sharingLabel,
  toggled,
} from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import type {
  AdvancedPromptFilters,
  Prompt,
  PublicProfile,
  SharingLevel,
  SortOption,
} from '@/types';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Nieuwste eerst' },
  { value: 'oldest', label: 'Oudste eerst' },
  { value: 'popular', label: 'Populairste eerst' },
  { value: 'title', label: 'Titel (A–Z)' },
];

/** Aantal kaarten per rij op de ontdekpagina. */
const ROW_SIZE = 3;

/** De filters staan in de URL: deelbaar, en de terugknop van de browser werkt. */
function readFilters(params: URLSearchParams): AdvancedPromptFilters {
  const sort = params.get('sort');
  const levels = SHARING_LEVELS.map((s) => s.value);
  return {
    query: params.get('q') ?? '',
    category_ids: params.getAll('category'),
    organization_ids: params.getAll('org'),
    role_ids: params.getAll('functie'),
    sharing_levels: params
      .getAll('niveau')
      .filter((n): n is SharingLevel => levels.includes(n as SharingLevel)),
    rijksbreed: params.get('rijk') === '1',
    date_from: params.get('van'),
    date_to: params.get('tot'),
    sort: SORT_OPTIONS.find((o) => o.value === sort)?.value ?? 'newest',
  };
}

function writeFilters(filters: AdvancedPromptFilters, showAll: boolean): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  filters.category_ids?.forEach((id) => params.append('category', id));
  filters.organization_ids?.forEach((id) => params.append('org', id));
  filters.role_ids?.forEach((id) => params.append('functie', id));
  filters.sharing_levels?.forEach((level) => params.append('niveau', level));
  if (filters.rijksbreed) params.set('rijk', '1');
  if (filters.date_from) params.set('van', filters.date_from);
  if (filters.date_to) params.set('tot', filters.date_to);
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (showAll) params.set('alles', '1');
  return params;
}

const byLikes = (a: Prompt, b: Prompt) => (b.like_count ?? 0) - (a.like_count ?? 0);

/**
 * Ontdekken: zonder zoekvraag of filter rijen om in te bladeren, met een zoekvraag
 * of filter de resultaten. Het zoekvak en de categorieën staan in beide standen
 * op dezelfde plek, zodat er niets verspringt zodra je begint te typen.
 */
export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, user } = useAuth();
  const { categories, organizations, categoryById, organizationById, roleById } =
    useReferenceData();

  const paramKey = searchParams.toString();
  const rawFilters = useMemo(() => readFilters(searchParams), [searchParams]);

  // Op organisatie filter je alleen langs je eigen lijn: je afdeling, je directie
  // en je ministerie. Die volgt uit je afdeling; een link naar een andere
  // afdeling, directie of een ander ministerie telt daarom niet mee.
  const ownTree = useMemo(
    () => new Set(orgChain(profile?.organization_id, organizations).map((o) => o.id)),
    [profile?.organization_id, organizations],
  );
  const filters = useMemo(
    () => ({
      ...rawFilters,
      organization_ids: (rawFilters.organization_ids ?? []).filter((id) => ownTree.has(id)),
    }),
    [rawFilters, ownTree],
  );
  const showAll = searchParams.has('alles');

  const activeCount =
    (filters.category_ids?.length ?? 0) +
    (filters.organization_ids?.length ?? 0) +
    (filters.role_ids?.length ?? 0) +
    (filters.sharing_levels?.length ?? 0) +
    (filters.rijksbreed ? 1 : 0) +
    (filters.date_from ? 1 : 0) +
    (filters.date_to ? 1 : 0);
  const urlQuery = filters.query ?? '';
  const browsing = !urlQuery && activeCount === 0 && !showAll && filters.sort === 'newest';

  const [query, setQuery] = useState(urlQuery);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const lastTrackedQuery = useRef('');

  /** Vanuit de rijen is dit een nieuwe stap in de geschiedenis, daarna niet meer. */
  function update(patch: Partial<AdvancedPromptFilters>) {
    setSearchParams(writeFilters({ ...filters, ...patch }, showAll), { replace: !browsing });
  }

  // De URL kan ook buiten het zoekvak om veranderen: terugknop, Wissen, een link.
  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (debouncedQuery !== urlQuery) update({ query: debouncedQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Een ministerie neemt alles mee wat eronder hangt, tenzij er ook een afdeling
  // van dat ministerie gekozen is.
  const orgIds = useMemo(
    () => searchOrgIds(filters.organization_ids ?? [], organizations),
    [filters.organization_ids, organizations],
  );
  const orgIdsKey = orgIds.join(',');

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchPrompts({ ...filters, organization_ids: orgIds })
      .then((p) => active && setPrompts(p))
      .finally(() => active && setLoading(false));

    // Log een zoekopdracht (alleen bij een niet-lege, nieuwe zoekterm).
    if (urlQuery && urlQuery !== lastTrackedQuery.current) {
      lastTrackedQuery.current = urlQuery;
      void trackEvent({
        event_type: 'search',
        user_identifier: activityIdentifier(profile, user?.email),
        metadata: { query: urlQuery },
      });
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey, orgIdsKey]);

  function handleChanged(updated: Prompt) {
    setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  const { enriched, authors, likesReady } = usePromptCommunity(prompts);
  const waiting = loading || ((browsing || filters.sort === 'popular') && !likesReady);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section
        aria-labelledby="ontdekken-kop"
        className="mx-auto mb-8 flex max-w-3xl flex-col items-center gap-5"
      >
        <h1
          id="ontdekken-kop"
          className="text-3xl font-bold text-rijksblauw-700 dark:text-rijksblauw-100"
        >
          Wat zoek je?
        </h1>

        <div role="search" className="relative w-full">
          <Search
            size={22}
            className="pointer-events-none absolute left-[1.125rem] top-1/2 -translate-y-1/2 text-slate-500 max-sm:left-3 dark:text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op titel of inhoud"
            aria-label="Zoek prompts"
            className="opl-input h-16 rounded-xl pl-[3.375rem] pr-36 text-lg max-sm:pl-[44px] max-sm:pr-[64px]"
          />
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-haspopup="dialog"
            className="absolute bottom-2 right-2 top-2 inline-flex items-center gap-2 rounded bg-rijksblauw-50 px-3.5 max-sm:px-[14px] text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/25"
          >
            <SlidersHorizontal size={18} />
            {/* Op de telefoon alleen het icoon: het zoekvak heeft de breedte nodig. */}
            <span className="max-sm:sr-only">Filters</span>
            {activeCount > 0 && (
              <span className="min-w-[1.375rem] rounded-full bg-rijksblauw-700 px-1.5 text-center text-xs font-bold leading-[1.375rem] text-white dark:bg-rijksblauw-600">
                {activeCount}
                <span className="sr-only"> actief</span>
              </span>
            )}
          </button>
        </div>

        <div className="grid w-full grid-cols-3 gap-1 min-[352px]:grid-cols-4 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const active = filters.category_ids?.includes(c.id) ?? false;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                title={c.description || undefined}
                onClick={() => update({ category_ids: toggled(filters.category_ids, c.id) })}
                className="group flex flex-col items-center gap-1.5 rounded px-0.5 py-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500"
              >
                <span
                  className={clsx(
                    'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
                    active
                      ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-600'
                      : 'bg-rijksblauw-50 text-rijksblauw-700 group-hover:bg-rijksblauw-700 group-hover:text-white dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200',
                  )}
                >
                  <Icon size={22} />
                </span>
                <span
                  className={clsx(
                    'max-w-full text-[0.8125rem] leading-tight text-slate-900 [hyphens:auto] [overflow-wrap:anywhere] dark:text-slate-100',
                    active ? 'font-bold' : 'font-medium',
                  )}
                >
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {browsing ? (
        waiting ? (
          <SkeletonGrid count={6} />
        ) : (
          <BrowseRows
            prompts={enriched}
            authors={authors}
            ministryId={
              profile?.organization_id
                ? (ministryOf(profile.organization_id, organizations)?.id ?? null)
                : null
            }
            departmentId={profile?.organization_id ?? null}
            onChanged={handleChanged}
          />
        )
      ) : (
        <section aria-labelledby="resultaten-kop">
          <h2 id="resultaten-kop" className="sr-only">
            Resultaten
          </h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p role="status" className="mr-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              {waiting
                ? 'Zoeken…'
                : `${prompts.length} ${prompts.length === 1 ? 'resultaat' : 'resultaten'}`}
            </p>

            {filters.category_ids?.map((id) => (
              <ActiveChip
                key={id}
                label={categoryById(id)?.name ?? 'Categorie'}
                onRemove={() => update({ category_ids: toggled(filters.category_ids, id) })}
              />
            ))}
            {filters.rijksbreed && (
              <ActiveChip
                label="Rijksoverheid"
                onRemove={() => update({ rijksbreed: false })}
              />
            )}
            {filters.organization_ids?.map((id) => {
              const org = organizationById(id);
              return (
                <ActiveChip
                  key={id}
                  label={
                    org?.organization_type === 'ministry'
                      ? org.code ?? org.name
                      : orgPathLabel(id, organizations, { short: true }) || 'Organisatie'
                  }
                  onRemove={() =>
                    update({ organization_ids: toggled(filters.organization_ids, id) })
                  }
                />
              );
            })}
            {filters.role_ids?.map((id) => (
              <ActiveChip
                key={id}
                label={roleById(id)?.name ?? 'Functie'}
                onRemove={() => update({ role_ids: toggled(filters.role_ids, id) })}
              />
            ))}
            {filters.sharing_levels?.map((level) => (
              <ActiveChip
                key={level}
                label={sharingLabel(level)}
                onRemove={() => update({ sharing_levels: toggled(filters.sharing_levels, level) })}
              />
            ))}
            {filters.date_from && (
              <ActiveChip
                label={`Vanaf ${formatDate(filters.date_from)}`}
                onRemove={() => update({ date_from: null })}
              />
            )}
            {filters.date_to && (
              <ActiveChip
                label={`Tot ${formatDate(filters.date_to)}`}
                onRemove={() => update({ date_to: null })}
              />
            )}

            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="inline-flex min-h-[2.25rem] items-center gap-1 rounded px-1.5 text-sm font-semibold text-rijksblauw-500 hover:text-rijksblauw-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200 dark:hover:text-white"
            >
              {urlQuery || activeCount > 0 ? (
                'Wissen'
              ) : (
                <>
                  <ArrowLeft size={16} /> Terug
                </>
              )}
            </button>

            <select
              className="opl-input ml-auto w-auto"
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as SortOption })}
              aria-label="Sorteren"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {waiting ? (
            <SkeletonGrid count={6} />
          ) : prompts.length === 0 ? (
            <div className="opl-card flex flex-col items-center gap-3 p-12 text-center">
              <SearchX size={40} className="text-slate-300 dark:text-slate-500" />
              <p className="text-slate-600 dark:text-slate-300">Geen prompts gevonden.</p>
            </div>
          ) : (
            <PromptGrid
              prompts={filters.sort === 'popular' ? [...enriched].sort(byLikes) : enriched}
              authors={authors}
              onChanged={handleChanged}
            />
          )}
        </section>
      )}

      <FilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        filters={filters}
        onChange={update}
        resultCount={loading ? null : prompts.length}
      />
    </div>
  );
}

/**
 * De rijen. Privéprompts doen niet mee: dit is wat collega's delen. Populair toont
 * alleen prompts met een like, anders is de rij gelijk aan Nieuw. Een rij zonder
 * prompts verdwijnt.
 */
function BrowseRows({
  prompts,
  authors,
  ministryId,
  departmentId,
  onChanged,
}: {
  prompts: Prompt[];
  authors: Record<string, PublicProfile>;
  ministryId: string | null;
  /** De organisatie op het profiel; telt alleen als afdeling als hij onder het ministerie hangt. */
  departmentId: string | null;
  onChanged: (updated: Prompt) => void;
}) {
  const { organizations } = useReferenceData();
  const shared = prompts.filter((p) => p.sharing_level !== 'private');
  const own = new Set(ministryId ? orgSubtreeIds(ministryId, organizations) : []);
  const afdeling = departmentId && departmentId !== ministryId ? departmentId : null;
  const ownDepartment = new Set(afdeling ? orgSubtreeIds(afdeling, organizations) : []);

  const rows = [
    {
      title: 'Uit jouw afdeling',
      to: `/zoeken?org=${ministryId}&org=${afdeling}`,
      prompts: shared
        .filter((p) => p.organization_id && ownDepartment.has(p.organization_id))
        .slice(0, ROW_SIZE),
    },
    {
      title: "Populair bij collega's",
      to: '/zoeken?alles=1&sort=popular',
      prompts: shared
        .filter((p) => (p.like_count ?? 0) > 0)
        .sort(byLikes)
        .slice(0, ROW_SIZE),
    },
    { title: 'Nieuw', to: '/zoeken?alles=1', prompts: shared.slice(0, ROW_SIZE) },
    {
      title: 'Uit jouw ministerie',
      to: `/zoeken?org=${ministryId}`,
      prompts: shared
        .filter((p) => p.organization_id && own.has(p.organization_id))
        .slice(0, ROW_SIZE),
    },
  ].filter((row) => row.prompts.length > 0);

  if (rows.length === 0) {
    return (
      <div className="opl-card p-12 text-center text-slate-600 dark:text-slate-300">
        Er zijn nog geen gedeelde prompts.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {rows.map((row) => (
        <section key={row.title} aria-label={row.title}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
              {row.title}
            </h2>
            <Link
              to={row.to}
              aria-label={`Alles: ${row.title}`}
              className="inline-flex min-h-[2.75rem] items-center gap-1 text-sm font-semibold text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
            >
              Alles <ArrowRight size={16} />
            </Link>
          </div>
          <PromptGrid prompts={row.prompts} authors={authors} onChanged={onChanged} />
        </section>
      ))}
    </div>
  );
}

function PromptGrid({
  prompts,
  authors,
  onChanged,
}: {
  prompts: Prompt[];
  authors: Record<string, PublicProfile>;
  onChanged: (updated: Prompt) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {prompts.map((p) => (
        <PromptCard
          key={p.id}
          prompt={p}
          author={p.created_by_user ? authors[p.created_by_user] : null}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Filter ${label} weghalen`}
      className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full bg-rijksblauw-50 pl-3 pr-2 text-sm font-medium text-rijksblauw-700 hover:bg-rijksblauw-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/25"
    >
      {label}
      <X size={14} />
    </button>
  );
}
