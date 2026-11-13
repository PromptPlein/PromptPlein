import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import { getPublicProfile, listPromptsByAuthor, firstName } from '@/services/communityService';
import PromptCard from '@/components/prompts/PromptCard';
import type { Organization, Prompt, PublicProfile } from '@/types';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/avatar';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/collection';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

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
      <nldd-simple-section background="tinted">
        <nldd-title slot="header" heading-level={1} size={3} text="Profiel"></nldd-title>
        <nldd-activity-indicator size="32" show-text text="Profiel laden"></nldd-activity-indicator>
      </nldd-simple-section>
    );
  }

  if (notFound) {
    return (
      <nldd-simple-section background="tinted">
        <nldd-inline-dialog
          icon="person-circle"
          heading-level={1}
          text="Profiel niet gevonden"
          supporting-text="Dit profiel bestaat niet of heeft geen openbare prompts."
        >
          <nldd-button-group slot="actions">
            <nldd-button appearance="primary" href="/community" text="Naar de community"></nldd-button>
          </nldd-button-group>
        </nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  return (
    <nldd-simple-section background="tinted">
        <nldd-container slot="header">
          <nldd-link href="/community" size="sm" start-icon="arrow-left" text="Community"></nldd-link>
          <nldd-spacer size="16"></nldd-spacer>
          <nldd-container layout="row" gap="16" vertical-alignment="center">
            <nldd-avatar name={displayName} size="64" decorative></nldd-avatar>
            <nldd-container>
              <nldd-title heading-level={1} size={3} text={displayName}></nldd-title>
              <nldd-spacer size="4"></nldd-spacer>
              <nldd-text size="sm" color="secondary">
                {orgPath.length > 0
                  ? orgPath.map((o, i) => (
                      <Fragment key={o.id}>
                        {i > 0 && ' / '}
                        <nldd-link href={`/zoeken?org=${o.id}`} text={o.name}></nldd-link>
                      </Fragment>
                    ))
                  : 'Geen organisatie ingesteld'}
              </nldd-text>
              <nldd-spacer size="4"></nldd-spacer>
              <nldd-text size="sm" color="secondary">
                {prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'} · {totalLikes}{' '}
                {totalLikes === 1 ? 'like' : 'likes'}
              </nldd-text>
            </nldd-container>
          </nldd-container>
        </nldd-container>
        <nldd-title heading-level={2} size={4} text={`Prompts van ${displayName}`}></nldd-title>
        <nldd-spacer size="12"></nldd-spacer>
        {enriched.length === 0 ? (
          <nldd-inline-dialog text="Nog geen openbare prompts."></nldd-inline-dialog>
        ) : (
          <nldd-collection item-min-width="20rem" gap="16">
            {enriched.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                author={p.created_by_user ? authors[p.created_by_user] : profile}
                onChanged={(u) => setPrompts((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
              />
            ))}
          </nldd-collection>
        )}
    </nldd-simple-section>
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
