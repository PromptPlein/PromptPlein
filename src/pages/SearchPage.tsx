import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FilterPanel from '@/components/prompts/FilterPanel';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { searchPrompts } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { categoryIconName } from '@/lib/categoryIcons';
import MenuAction from '@/components/common/MenuAction';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { ministryOf, orgSubtreeIds } from '@/lib/orgTree';
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
import '@nldd/design-system/button';
import '@nldd/design-system/collection';
import '@nldd/design-system/container';
import '@nldd/design-system/dropdown';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/search-field';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/title';
import '@nldd/design-system/toggle-button';
import '@nldd/design-system/toggle-button-group';
import '@nldd/design-system/token';
import '@nldd/design-system/toolbar';
import '@nldd/design-system/tooltip';

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
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const showAll = searchParams.has('alles');

  const activeCount =
    (filters.category_ids?.length ?? 0) +
    (filters.organization_ids?.length ?? 0) +
    (filters.role_ids?.length ?? 0) +
    (filters.sharing_levels?.length ?? 0) +
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
  const searchRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(searchRef, query, setQuery);

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

  // Een ministerie neemt alles mee wat eronder hangt.
  const orgIds = useMemo(
    () => (filters.organization_ids ?? []).flatMap((id) => orgSubtreeIds(id, organizations)),
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

  const tokens: { key: string; label: string; onRemove: () => void }[] = [
    ...(filters.category_ids ?? []).map((id) => ({
      key: `c-${id}`,
      label: categoryById(id)?.name ?? 'Categorie',
      onRemove: () => update({ category_ids: toggled(filters.category_ids, id) }),
    })),
    ...(filters.organization_ids ?? []).map((id) => {
      const org = organizationById(id);
      return {
        key: `o-${id}`,
        label: org?.code ?? org?.name ?? 'Organisatie',
        onRemove: () => update({ organization_ids: toggled(filters.organization_ids, id) }),
      };
    }),
    ...(filters.role_ids ?? []).map((id) => ({
      key: `r-${id}`,
      label: roleById(id)?.name ?? 'Functie',
      onRemove: () => update({ role_ids: toggled(filters.role_ids, id) }),
    })),
    ...(filters.sharing_levels ?? []).map((level) => ({
      key: `s-${level}`,
      label: sharingLabel(level),
      onRemove: () => update({ sharing_levels: toggled(filters.sharing_levels, level) }),
    })),
    ...(filters.date_from
      ? [{ key: 'van', label: `Vanaf ${formatDate(filters.date_from)}`, onRemove: () => update({ date_from: null }) }]
      : []),
    ...(filters.date_to
      ? [{ key: 'tot', label: `Tot ${formatDate(filters.date_to)}`, onRemove: () => update({ date_to: null }) }]
      : []),
  ];

  return (
    <>
      <nldd-simple-section>
        <nldd-title slot="header" heading-level={1} size={2} text="Wat zoek je?"></nldd-title>

        <nldd-toolbar role="search" accessible-label="Zoeken en filteren">
          <nldd-toolbar-item slot="start" min-width="240px" width="100%" fluid>
            <nldd-search-field
              ref={searchRef}
              placeholder="Zoek op titel of inhoud"
              accessible-label="Zoek op titel of inhoud in prompts"
            ></nldd-search-field>
            <MenuAction slot="overflow" icon="search" text="Zoeken" onSelect={() => searchRef.current?.focus()} />
          </nldd-toolbar-item>
          <nldd-toolbar-item slot="start">
            <nldd-button
              appearance="secondary"
              start-icon="filter"
              text={activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
              accessible-label={activeCount > 0 ? `Filters, ${activeCount} actief` : 'Filters'}
              popup-type="dialog"
              onClick={() => setPanelOpen(true)}
            ></nldd-button>
            <MenuAction slot="overflow" icon="filter" text="Filters" onSelect={() => setPanelOpen(true)} />
          </nldd-toolbar-item>
        </nldd-toolbar>
        <nldd-spacer size="16"></nldd-spacer>

        <nldd-toggle-button-group accessible-label="Categorieën" size="sm" appearance="neutral-transparent">
          {categories.map((c) => {
            const active = filters.category_ids?.includes(c.id) ?? false;
            const button = (
              <nldd-toggle-button
                key={c.id}
                icon={categoryIconName(c.icon)}
                text={c.name}
                selected={active || undefined}
                onClick={() => update({ category_ids: toggled(filters.category_ids, c.id) })}
              ></nldd-toggle-button>
            );
            return c.description ? (
              <nldd-tooltip key={c.id} text={c.description}>
                {button}
              </nldd-tooltip>
            ) : (
              button
            );
          })}
        </nldd-toggle-button-group>

        {tokens.length > 0 && (
          <>
            <nldd-spacer size="16"></nldd-spacer>
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              {tokens.map((t) => (
                <ActiveChip key={t.key} label={t.label} onRemove={t.onRemove} />
              ))}
            </nldd-container>
          </>
        )}

      </nldd-simple-section>

      <nldd-simple-section>
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
              onChanged={handleChanged}
            />
          )
        ) : (
          <>
            <nldd-title slot="header" heading-level={2} size={4} text="Resultaten"></nldd-title>
            <nldd-container layout="wrap" gap="12" vertical-alignment="center">
              <nldd-text size="sm" color="secondary" aria-live="polite">
                {waiting
                  ? 'Zoeken…'
                  : `${prompts.length} ${prompts.length === 1 ? 'prompt' : 'prompts'}`}
              </nldd-text>
              {!urlQuery && activeCount === 0 && (
                <nldd-link
                  href="/zoeken"
                  size="sm"
                  start-icon="arrow-left"
                  text="Terug naar ontdekken"
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchParams({});
                  }}
                ></nldd-link>
              )}
              <nldd-spacer size="flexible"></nldd-spacer>
              <SortDropdown value={filters.sort ?? 'newest'} onChange={(sort) => update({ sort })} />
            </nldd-container>
            <nldd-spacer size="16"></nldd-spacer>

            {waiting ? (
              <SkeletonGrid count={6} />
            ) : prompts.length === 0 ? (
              <nldd-inline-dialog
                icon="search"
                text="Geen prompts gevonden"
                supporting-text="Pas je zoekopdracht of filters aan."
              ></nldd-inline-dialog>
            ) : (
              <PromptGrid
                prompts={filters.sort === 'popular' ? [...enriched].sort(byLikes) : enriched}
                authors={authors}
                onChanged={handleChanged}
              />
            )}
          </>
        )}
      </nldd-simple-section>

      <FilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        filters={filters}
        onChange={update}
        resultCount={loading ? null : prompts.length}
      />
    </>
  );
}

/** The sort choice. Its own component, so the change listener binds when it mounts. */
function SortDropdown({ value, onChange }: { value: SortOption; onChange: (sort: SortOption) => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value?: string }>>(ref, 'change', (e) => {
    const next = e.detail?.value ?? (e.target as HTMLSelectElement | null)?.value;
    if (next) onChange(next as SortOption);
  });
  return (
    <nldd-dropdown ref={ref} size="sm" width="14rem" accessible-label="Sorteren">
      <select value={value} onChange={() => undefined} aria-label="Sorteren">
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </nldd-dropdown>
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
  onChanged,
}: {
  prompts: Prompt[];
  authors: Record<string, PublicProfile>;
  ministryId: string | null;
  onChanged: (updated: Prompt) => void;
}) {
  const { organizations } = useReferenceData();
  const shared = prompts.filter((p) => p.sharing_level !== 'private');
  const own = new Set(ministryId ? orgSubtreeIds(ministryId, organizations) : []);

  const rows = [
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
      <nldd-inline-dialog icon="file-text" text="Er zijn nog geen gedeelde prompts."></nldd-inline-dialog>
    );
  }

  return (
    <nldd-container gap="32">
      {rows.map((row) => (
        <nldd-container key={row.title}>
          <nldd-container layout="row" gap="12" vertical-alignment="center">
            <nldd-title heading-level={2} size={4} text={row.title}></nldd-title>
            <nldd-spacer size="flexible"></nldd-spacer>
            <nldd-link
              href={row.to}
              size="sm"
              end-icon="arrow-right"
              text="Alles"
              accessible-label={`Alles: ${row.title}`}
            ></nldd-link>
          </nldd-container>
          <nldd-spacer size="12"></nldd-spacer>
          <PromptGrid prompts={row.prompts} authors={authors} onChanged={onChanged} />
        </nldd-container>
      ))}
    </nldd-container>
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
    <nldd-collection item-min-width="20rem">
      {prompts.map((p) => (
        <PromptCard
          key={p.id}
          prompt={p}
          author={p.created_by_user ? authors[p.created_by_user] : null}
          onChanged={onChanged}
        />
      ))}
    </nldd-collection>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'dismiss', () => onRemove());
  return <nldd-token ref={ref} text={label} control="dismiss" dismiss-text={`Filter ${label} weghalen`}></nldd-token>;
}
