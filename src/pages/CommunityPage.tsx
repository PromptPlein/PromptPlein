import { useEffect, useRef, useState } from 'react';
import OrgTree from '@/components/network/OrgTree';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useNlddEvent } from '@/lib/nldd';
import { listCommunityMembers, firstName } from '@/services/communityService';
import TrendingPage from '@/pages/TrendingPage';
import type { CommunityMember } from '@/types';

type Tab = 'community' | 'trending';

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>('community');
  const tabsRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ item?: HTMLElement }>>(tabsRef, 'tabchange', (e) => {
    const next = e.detail?.item?.dataset.tab;
    if (next === 'community' || next === 'trending') setTab(next);
  });

  return (
    <>
      <nldd-simple-section padding-bottom="0">
        <nldd-title
          slot="header"
          heading-level={1}
          size={2}
          text="Community"
          supporting-text="Wie maakt de prompts, bij welk ministerie horen ze, en welke prompts waarderen collega’s het meest."
        ></nldd-title>
        <nldd-tab-bar ref={tabsRef} accessible-label="Onderdelen van Community">
          <nldd-tab-bar-item data-tab="community" text="Community" current={tab === 'community' || undefined}></nldd-tab-bar-item>
          <nldd-tab-bar-item data-tab="trending" text="Trending" current={tab === 'trending' || undefined}></nldd-tab-bar-item>
        </nldd-tab-bar>
      </nldd-simple-section>

      {tab === 'community' ? <CommunityTab /> : <TrendingPage embedded />}
    </>
  );
}

function CommunityTab() {
  const { organizations, organizationById } = useReferenceData();
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listCommunityMembers()
      .then((m) => active && setMembers(m))
      .catch(() => active && setMembers([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const totalPrompts = members.reduce((n, m) => n + m.prompt_count, 0);
  const totalLikes = members.reduce((n, m) => n + m.total_likes, 0);

  return (
    <>
      <nldd-simple-section padding-top="24">
        <nldd-container layout="grid" column-count={3} gap="16">
          <Stat value={members.length} label="Makers" />
          <Stat value={totalPrompts} label="Prompts" />
          <Stat value={totalLikes} label="Likes" />
        </nldd-container>
      </nldd-simple-section>

      <nldd-one-half-one-half-section>
        <nldd-container slot="left">
          <nldd-title heading-level={2} size={4} text="Ranglijst"></nldd-title>
          <nldd-spacer size="12"></nldd-spacer>
          {loading ? (
            <nldd-inline-dialog variant="loading" text="Ranglijst laden"></nldd-inline-dialog>
          ) : members.length === 0 ? (
            <nldd-inline-dialog
              icon="users"
              text="Nog geen makers met prompts"
              supporting-text="Maak de eerste prompt en verschijn hier."
            ></nldd-inline-dialog>
          ) : (
            <nldd-list accessible-label="Ranglijst van makers" appearance="box-base">
              {members.map((m, i) => (
                <nldd-list-item
                  key={m.id}
                  href={`/community/${m.id}`}
                  accessible-label={`${i + 1}. ${firstName(m.full_name)}`}
                >
                  <nldd-cell>
                    <nldd-badge
                      color={i < 3 ? 'accent' : 'neutral'}
                      number={String(i + 1)}
                      accessible-label={`Plaats ${i + 1}`}
                    ></nldd-badge>
                  </nldd-cell>
                  <nldd-spacer-cell size="12"></nldd-spacer-cell>
                  <nldd-text-cell
                    text={firstName(m.full_name)}
                    supporting-text={organizationById(m.organization_id)?.name ?? 'Onbekende organisatie'}
                  ></nldd-text-cell>
                  <nldd-spacer-cell size="12"></nldd-spacer-cell>
                  <nldd-text-cell
                    width="fit-content"
                    horizontal-alignment="right"
                    size="sm"
                    color="secondary"
                    text={`${m.total_likes} likes`}
                    supporting-text={`${m.prompt_count} prompts`}
                  ></nldd-text-cell>
                  <nldd-spacer-cell size="12"></nldd-spacer-cell>
                  <nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
                </nldd-list-item>
              ))}
            </nldd-list>
          )}
        </nldd-container>

        {/* Tree: Rijksoverheid, ministry, department */}
        <nldd-container slot="right">
          <nldd-title heading-level={2} size={4} text="Organisatie"></nldd-title>
          <nldd-spacer size="12"></nldd-spacer>
          <nldd-card>
            <nldd-container padding="8">
              <OrgTree orgs={organizations} />
            </nldd-container>
          </nldd-card>
        </nldd-container>
      </nldd-one-half-one-half-section>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <nldd-container gap="2">
      <nldd-text size="lg" weight="bold">{value}</nldd-text>
      <nldd-text size="sm" color="secondary">{label}</nldd-text>
    </nldd-container>
  );
}
