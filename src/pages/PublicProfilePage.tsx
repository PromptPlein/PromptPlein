import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserCircle2, Building2, FileText, ThumbsUp, ArrowLeft } from '@/components/common/icons';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import { getPublicProfile, listPromptsByAuthor, firstName } from '@/services/communityService';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import type { Organization, Prompt, PublicProfile } from '@/types';

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { organizations } = useReferenceData();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    Promise.all([getPublicProfile(userId), listPromptsByAuthor(userId)])
      .then(([p, list]) => {
        if (!active) return;
        setProfile(p);
        setPrompts(list);
        if (!p && list.length === 0) setNotFound(true);
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId]);

  const { enriched, authors } = usePromptCommunity(prompts);

  // Naam: liever uit het profiel, anders uit de eerste prompt (created_by).
  const displayName = profile?.full_name
    ? firstName(profile.full_name)
    : prompts[0]?.created_by || 'Onbekende ambtenaar';

  const orgPath = useMemo(
    () => buildOrgPath(profile?.organization_id ?? prompts[0]?.organization_id, organizations),
    [profile?.organization_id, prompts, organizations],
  );

  const totalLikes = enriched.reduce((n, p) => n + (p.like_count ?? 0), 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="skeleton mb-6 h-24 w-full rounded-xl" />
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <UserCircle2 size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-slate-600 dark:text-slate-300">Dit profiel bestaat niet of heeft geen openbare prompts.</p>
        <Link to="/community" className="opl-btn-primary mt-4 inline-flex">
          Naar de community
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to="/community"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
      >
        <ArrowLeft size={16} /> Community
      </Link>

      <div className="opl-card mb-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
          <UserCircle2 size={34} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{displayName}</h1>
          {orgPath.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
              <Building2 size={14} className="shrink-0" />
              {orgPath.map((o, i) => (
                <span key={o.id} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                  <Link to={`/zoeken?org=${o.id}`} className="hover:underline">
                    {o.name}
                  </Link>
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">Geen organisatie ingesteld</p>
          )}
        </div>
        <div className="flex shrink-0 gap-5 text-center">
          <div>
            <p className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{prompts.length}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <FileText size={12} /> prompts
            </p>
          </div>
          <div>
            <p className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{totalLikes}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <ThumbsUp size={12} /> likes
            </p>
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-700 dark:text-slate-200">Prompts van {displayName}</h2>
      {enriched.length === 0 ? (
        <div className="opl-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Nog geen openbare prompts.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enriched.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              author={p.created_by_user ? authors[p.created_by_user] : profile}
              onChanged={(u) => setPrompts((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Bouw het pad van wortel → organisatie (bv. Rijksoverheid / BZK / Afdeling X). */
function buildOrgPath(
  orgId: string | null | undefined,
  orgs: Organization[],
): Organization[] {
  if (!orgId) return [];
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const path: Organization[] = [];
  let current = byId.get(orgId);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}
