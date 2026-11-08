import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import OrgTree from '@/components/network/OrgTree';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useNlddEvent } from '@/lib/nldd';
import { listOrganizations } from '@/services/orgService';
import { listPrompts } from '@/services/repository';
import type { Organization, Prompt } from '@/types';

const OrgChart = lazy(() => import('@/components/network/OrgChart'));
const PromptEcosystem = lazy(() => import('@/components/three/PromptEcosystem'));

type Tab = 'lijst' | 'organisaties' | 'prompts';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'lijst', label: 'Lijst', icon: 'list' },
  { id: 'organisaties', label: 'Organisatienetwerk', icon: 'network' },
  { id: 'prompts', label: 'Prompt-ecosysteem', icon: 'boxes-3' },
];

/**
 * Het organogram is een tekening die je met de muis bedient. Op een telefoon past
 * hij amper, en een schermlezer ziet er niets aan. De lijst bevat dezelfde
 * organisaties en werkt met alles, daarom is hij daar de standaard.
 */
function initialTab(): Tab {
  return window.matchMedia('(max-width: 39.99rem)').matches ? 'lijst' : 'organisaties';
}

export default function NetworkPage() {
  const { categories } = useReferenceData();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const tabsRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ item?: HTMLElement }>>(tabsRef, 'tabchange', (e) => {
    const id = e.detail?.item?.dataset.tab as Tab | undefined;
    if (id) setTab(id);
  });

  useEffect(() => {
    let active = true;
    Promise.all([listOrganizations(), listPrompts({})])
      .then(([o, p]) => {
        if (!active) return;
        setOrgs(o);
        setPrompts(p);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const loader = <nldd-activity-indicator size="32" show-text text="3D-scène laden"></nldd-activity-indicator>;

  return (
    <nldd-simple-section>
      <nldd-title
        slot="header"
        heading-level={1}
        size={2}
        text="Netwerkverkenner"
        supporting-text={
          tab === 'lijst'
            ? 'Alle organisaties. Kies er een om de prompts ervan te zien.'
            : tab === 'organisaties'
            ? 'Organogram van het organisatienetwerk. Sleep om te verschuiven, scroll of gebruik de knoppen om te zoomen, klik een organisatie aan voor details.'
            : 'Interactieve weergave van het promptlandschap.'
        }
      ></nldd-title>

      <nldd-tab-bar ref={tabsRef} accessible-label="Weergave">
        {TABS.map(({ id, label, icon }) => (
          <nldd-tab-bar-item key={id} data-tab={id} text={label} icon={icon} current={tab === id || undefined}></nldd-tab-bar-item>
        ))}
      </nldd-tab-bar>
      <nldd-spacer size="16"></nldd-spacer>

      <nldd-card>
        {tab === 'lijst' ? (
          <nldd-container padding="12">
            {loading ? (
              <nldd-activity-indicator size="32" show-text text="Organisaties laden"></nldd-activity-indicator>
            ) : (
              <OrgTree orgs={orgs} />
            )}
          </nldd-container>
        ) : (
          // The drawings catch every swipe, so they never fill the whole screen:
          // there has to be room left to scroll the page itself. nldd-container
          // has min-height but no fixed height in 0.18.0, so the drawing itself
          // has to take this height.
          <nldd-container min-height="420px">
            {loading ? (
              loader
            ) : (
              <Suspense fallback={loader}>
                {tab === 'organisaties' ? (
                  <OrgChart orgs={orgs} />
                ) : (
                  <PromptEcosystem prompts={prompts} categories={categories} />
                )}
              </Suspense>
            )}
          </nldd-container>
        )}
      </nldd-card>

      <nldd-spacer size="8"></nldd-spacer>
      <nldd-text size="sm" color="secondary">
        {orgs.length} organisaties · {prompts.length} prompts
      </nldd-text>
    </nldd-simple-section>
  );
}
