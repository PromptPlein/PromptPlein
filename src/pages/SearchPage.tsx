import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, SearchX } from '@/components/common/icons';
import AdvancedFilterBar from '@/components/prompts/AdvancedFilterBar';
import PromptCard from '@/components/prompts/PromptCard';
import UploadModal from '@/components/prompts/UploadModal';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { searchPrompts } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { activityIdentifier } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import type { AdvancedPromptFilters, Prompt, SortOption } from '@/types';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, user } = useAuth();

  const [filters, setFilters] = useState<AdvancedPromptFilters>(() => ({
    query: searchParams.get('q') ?? '',
    category_ids: searchParams.get('category') ? [searchParams.get('category')!] : [],
    organization_ids: searchParams.get('org') ? [searchParams.get('org')!] : [],
    role_ids: [],
    technique_ids: [],
    sharing_levels: [],
    sort: (searchParams.get('sort') as SortOption | null) ?? 'newest',
  }));

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const debouncedQuery = useDebouncedValue(filters.query ?? '', 300);
  const lastTrackedQuery = useRef('');

  // Houd de basis-filters in de URL (deelbare links).
  useEffect(() => {
    const params: Record<string, string> = {};
    if (filters.query) params.q = filters.query;
    if (filters.category_ids?.length === 1) params.category = filters.category_ids[0];
    if (filters.organization_ids?.length === 1) params.org = filters.organization_ids[0];
    if (filters.sort && filters.sort !== 'newest') params.sort = filters.sort;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filters.category_ids, filters.organization_ids, filters.sort]);

  // Data ophalen wanneer filters wijzigen.
  useEffect(() => {
    let active = true;
    setLoading(true);
    searchPrompts({ ...filters, query: debouncedQuery })
      .then((p) => active && setPrompts(p))
      .finally(() => active && setLoading(false));

    // Log een zoekopdracht (alleen bij een niet-lege, nieuwe zoekterm).
    if (debouncedQuery && debouncedQuery !== lastTrackedQuery.current) {
      lastTrackedQuery.current = debouncedQuery;
      void trackEvent({
        event_type: 'search',
        user_identifier: activityIdentifier(profile, user?.email),
        metadata: { query: debouncedQuery },
      });
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedQuery,
    filters.category_ids,
    filters.organization_ids,
    filters.role_ids,
    filters.technique_ids,
    filters.sharing_levels,
    filters.date_from,
    filters.date_to,
    filters.sort,
  ]);

  function handleChanged(updated: Prompt) {
    setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  const { enriched, authors } = usePromptCommunity(prompts);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Geavanceerd zoeken</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Combineer meerdere filters, een datumbereik en sortering.
          </p>
        </div>
        <button onClick={() => setUploadOpen(true)} className="opl-btn-primary">
          <Plus size={18} /> Nieuwe prompt
        </button>
      </div>

      <div className="mb-6">
        <AdvancedFilterBar filters={filters} onChange={setFilters} />
      </div>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : prompts.length === 0 ? (
        <div className="opl-card flex flex-col items-center gap-3 p-12 text-center">
          <SearchX size={40} className="text-slate-300 dark:text-slate-500" />
          <p className="text-slate-600 dark:text-slate-300">Geen prompts gevonden met deze filters.</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {prompts.length} resultaat{prompts.length === 1 ? '' : 'en'}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                author={p.created_by_user ? authors[p.created_by_user] : null}
                onChanged={handleChanged}
              />
            ))}
          </div>
        </>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(prompt) => setPrompts((prev) => [prompt, ...prev])}
      />
    </div>
  );
}
