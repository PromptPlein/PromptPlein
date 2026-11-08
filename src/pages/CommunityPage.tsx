import { useEffect, useState } from 'react';
import OrgTree from '@/components/network/OrgTree';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listCommunityMembers, firstName } from '@/services/communityService';
import type { CommunityMember } from '@/types';
import '@nldd/design-system/badge';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/card';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/hero';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/one-half-one-half-section';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/tab-bar';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

export default function CommunityPage() {
  return <CommunityTab />;
}

/** "1 prompt", "2 prompts": the noun follows the number. */
function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
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
      {/* De opening zoals op Start: het lijnenbeeld met in het midden een
          donkerblauw vlak, met de drie aantallen erin. */}
      <nldd-hero
        width="full"
        background="tinted"
        layout="contained"
        main-background="accent"
        main-position="top-center"
        media-height="clamp(180px, 26vw, 320px)"
        media-src="/lijnen.jpg"
        media-alt=""
      >
        <nldd-container gap="20">
          <nldd-title
            color="inherit"
            heading-level={1}
            size={1}
            text="Community"
            supporting-text="Wie maakt de prompts, en welke waarderen collega’s het meest."
          ></nldd-title>
          {!loading && (
            <nldd-container layout="grid" column-count={3} gap="16">
              <Stat value={members.length} label={members.length === 1 ? 'Maker' : 'Makers'} />
              <Stat value={totalPrompts} label={totalPrompts === 1 ? 'Prompt' : 'Prompts'} />
              <Stat value={totalLikes} label={totalLikes === 1 ? 'Like' : 'Likes'} />
            </nldd-container>
          )}
        </nldd-container>
      </nldd-hero>

      <nldd-simple-section background="tinted" padding-top="0">
        <nldd-tab-bar navigation accessible-label="Onderdelen van Community">
          <nldd-tab-bar-item href="/community" text="Community" current></nldd-tab-bar-item>
          <nldd-tab-bar-item href="/trending" text="Trending"></nldd-tab-bar-item>
        </nldd-tab-bar>
      </nldd-simple-section>

      <nldd-one-half-one-half-section background="tinted" padding-top="0">
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
            <nldd-list appearance="box-base" accessible-label="Ranglijst van makers">
              {members.map((m, i) => (
                <nldd-list-item
                  key={m.id}
                  href={`/community/${m.id}`}
                  accessible-label={`${firstName(m.full_name)}, plaats ${i + 1}`}
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
                    text={count(m.total_likes, 'like', 'likes')}
                    supporting-text={count(m.prompt_count, 'prompt', 'prompts')}
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
          <nldd-card accessible-label="Organisatie">
            <nldd-container padding="16">
              <OrgTree orgs={organizations} />
            </nldd-container>
          </nldd-card>
        </nldd-container>
      </nldd-one-half-one-half-section>
    </>
  );
}

/** Eén aantal in het donkerblauwe vlak: het getal groot en wat het telt eronder. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <nldd-container>
      <nldd-text size="display-6" color="inherit">
        {value}
      </nldd-text>
      <nldd-text size="sm" color="inherit">
        {label}
      </nldd-text>
    </nldd-container>
  );
}
