import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SearchX,
  LayoutGrid,
  SlidersHorizontal,
  X,
} from '@/components/common/icons';
import FilterPanel from '@/components/prompts/FilterPanel';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { searchPrompts } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { categoryIcon } from '@/lib/categoryIcons';
import { PROMPT_KIND_META, isPromptKind, promptKindOf } from '@/lib/promptKinds';
import { PROMPT_KINDS } from '@/lib/techniques';
import { activityIdentifier, formatDate, toggled } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import type { AdvancedPromptFilters, Prompt, PublicProfile, SortOption } from '@/types';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Nieuwste eerst' },
  { value: 'oldest', label: 'Oudste eerst' },
  { value: 'popular', label: 'Populairste eerst' },
  { value: 'title', label: 'Titel (A–Z)' },
];

/** Aantal kaarten per rij op de ontdekpagina. */
const ROW_SIZE = 3;

/**
 * De filters staan in de URL: deelbaar, en de terugknop van de browser werkt.
 * Oude links met `org`, `functie`, `niveau` of `rijk` openen nog, maar die
 * parameters tellen sinds 25-11-2026 niet meer mee.
 */
function readFilters(params: URLSearchParams): AdvancedPromptFilters {
  const sort = params.get('sort');
  return {
    query: params.get('q') ?? '',
    category_ids: params.getAll('category'),
    kinds: params.getAll('soort').filter(isPromptKind),
    date_from: params.get('van'),
    date_to: params.get('tot'),
    sort: SORT_OPTIONS.find((o) => o.value === sort)?.value ?? 'newest',
  };
}

function writeFilters(filters: AdvancedPromptFilters, showAll: boolean): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  filters.category_ids?.forEach((id) => params.append('category', id));
  filters.kinds?.forEach((k) => params.append('soort', k));
  if (filters.date_from) params.set('van', filters.date_from);
  if (filters.date_to) params.set('tot', filters.date_to);
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  if (showAll) params.set('alles', '1');
  return params;
}

/** Hoeveel prompts er per waarde zijn; prompts zonder waarde tellen niet mee. */
function countBy(list: Prompt[], key: (p: Prompt) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const p of list) {
    const k = key(p);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
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
  const { categories, categoryById } = useReferenceData();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const showAll = searchParams.has('alles');

  const activeCount =
    (filters.category_ids?.length ?? 0) +
    (filters.kinds?.length ?? 0) +
    (filters.date_from ? 1 : 0) +
    (filters.date_to ? 1 : 0);
  const urlQuery = filters.query ?? '';
  const browsing = !urlQuery && activeCount === 0 && !showAll && filters.sort === 'newest';

  const [query, setQuery] = useState(urlQuery);
  const debouncedQuery = useDebouncedValue(query, 300);
  // Alles wat bij de zoekvraag en de overige filters past, nog zonder soort en
  // categorie: daaruit komen de tellers op de tabbladen en de categorietegels.
  const [base, setBase] = useState<Prompt[]>([]);
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


  // Soort en categorie filtert de client (zie hieronder), dus die halen niets nieuws op.
  const fetchKey = JSON.stringify([
    urlQuery,
    filters.date_from,
    filters.date_to,
    filters.sort,
  ]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchPrompts({
      ...filters,
      kinds: [],
      category_ids: [],
    })
      .then((p) => active && setBase(p))
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
  }, [fetchKey]);

  function handleChanged(updated: Prompt) {
    setBase((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  // Soort en categorie filtert de client. Elke keuzelijst telt met de andere keuze
  // erop, maar niet met die van zichzelf: zo blijven de andere opties binnen dezelfde
  // lijst te kiezen.
  const kindSel = filters.kinds ?? [];
  const catSel = filters.category_ids ?? [];
  const selKey = [kindSel, catSel].map((a) => a.join(',')).join('|');
  const facets = useMemo(() => {
    const kindOk = (p: Prompt) => !kindSel.length || kindSel.includes(promptKindOf(p));
    const catOk = (p: Prompt) => !catSel.length || (!!p.category_id && catSel.includes(p.category_id));
    const pool = base;
    const inKind = pool.filter(kindOk);
    return {
      pool,
      prompts: inKind.filter(catOk),
      kinds: countBy(pool, (p) => promptKindOf(p)),
      categories: countBy(inKind, (p) => p.category_id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, selKey]);
  const { pool, prompts } = facets;
  const kindCounts = facets.kinds;
  const activeKind = kindSel.length === 1 ? kindSel[0] : null;

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

      </section>

      {/* Soort als tabbladen; het vlak eronder toont de categorieën binnen die soort,
          met tellers. Op de telefoon schuiven de tabbladen opzij. */}
      <section aria-label="Soort en categorie" className="mx-auto mb-8 max-w-5xl">
        <div
          role="group"
          aria-label="Soort"
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0"
        >
          {[null, ...PROMPT_KINDS].map((k) => {
            const active = k ? activeKind === k : kindSel.length === 0;
            const meta = k ? PROMPT_KIND_META[k] : null;
            const Icon = meta?.icon ?? LayoutGrid;
            const n = k ? (kindCounts.get(k) ?? 0) : pool.length;
            return (
              <button
                key={k ?? 'alles'}
                type="button"
                aria-pressed={active}
                onClick={() => update({ kinds: k ? [k] : [] })}
                className={clsx(
                  'relative flex flex-1 flex-col items-center gap-1 rounded-t-lg px-2 pb-2.5 pt-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rijksblauw-500 sm:min-w-0',
                  active
                    ? 'z-10 -mb-px border border-b-0 border-t-[3px] border-slate-200 border-t-nadruk bg-white font-bold text-rijksblauw-700 dark:border-slate-700 dark:border-t-nadruk dark:bg-slate-800 dark:text-rijksblauw-200'
                    : clsx(
                        'border border-transparent bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600',
                        n === 0 ? 'text-slate-500 dark:text-slate-400' : 'text-rijksblauw-700 dark:text-rijksblauw-200',
                      ),
                )}
              >
                <Icon size={22} aria-hidden="true" />
                <span>{meta?.label ?? 'Alles'}</span>
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  {n}
                  <span className="sr-only"> prompts</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="rounded-b-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="grid grid-cols-1 gap-2 min-[22rem]:grid-cols-2 sm:grid-cols-3">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon);
              const active = catSel.includes(c.id);
              const n = facets.categories.get(c.id) ?? 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  title={c.description || undefined}
                  onClick={() => update({ category_ids: toggled(filters.category_ids, c.id) })}
                  className={clsx(
                    'flex min-h-[3rem] items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                    active
                      ? 'border-2 border-rijksblauw-700 bg-rijksblauw-50 font-bold text-slate-900 dark:border-rijksblauw-300 dark:bg-rijksblauw-500/15 dark:text-slate-100'
                      : clsx(
                          'border border-slate-200 bg-white hover:border-rijksblauw-400 dark:border-slate-600 dark:bg-slate-800',
                          n === 0 ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100',
                        ),
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      active
                        ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-500'
                        : 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200',
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.name}</span>
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    {n}
                    <span className="sr-only"> prompts</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {browsing ? (
        waiting ? (
          <SkeletonGrid count={6} />
        ) : (
          <BrowseRows
            prompts={enriched}
            authors={authors}
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
            {filters.kinds?.map((k) => (
              <ActiveChip
                key={k}
                label={PROMPT_KIND_META[k].label}
                onRemove={() => update({ kinds: toggled(filters.kinds, k) })}
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
        counts={facets}
      />
    </div>
  );
}

/**
 * De rijen. Privéprompts doen niet mee: dit is wat anderen publiek delen. Populair toont
 * alleen prompts met een like, anders is de rij gelijk aan Nieuw. Een rij zonder
 * prompts verdwijnt.
 */
function BrowseRows({
  prompts,
  authors,
  onChanged,
}: {
  prompts: Prompt[];
  authors: Record<string, PublicProfile>;
  onChanged: (updated: Prompt) => void;
}) {
  const shared = prompts.filter((p) => p.sharing_level !== 'private');

  const rows = [
    {
      title: 'Populair',
      to: '/zoeken?alles=1&sort=popular',
      prompts: shared
        .filter((p) => (p.like_count ?? 0) > 0)
        .sort(byLikes)
        .slice(0, ROW_SIZE),
    },
    { title: 'Nieuw', to: '/zoeken?alles=1', prompts: shared.slice(0, ROW_SIZE) },
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
