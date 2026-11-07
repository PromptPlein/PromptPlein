import { Suspense, lazy, useEffect, useState } from 'react';
import { Network, Boxes, List } from '@/components/common/icons';
import clsx from 'clsx';
import OrgTree from '@/components/network/OrgTree';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listOrganizations } from '@/services/orgService';
import { listPrompts } from '@/services/repository';
import type { Organization, Prompt } from '@/types';

const OrgChart = lazy(() => import('@/components/network/OrgChart'));
const PromptEcosystem = lazy(() => import('@/components/three/PromptEcosystem'));

type Tab = 'lijst' | 'organisaties' | 'prompts';

const TABS: { id: Tab; label: string; icon: typeof Network }[] = [
  { id: 'lijst', label: 'Lijst', icon: List },
  { id: 'organisaties', label: 'Organisatienetwerk', icon: Network },
  { id: 'prompts', label: 'Prompt-ecosysteem', icon: Boxes },
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Netwerkverkenner</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {tab === 'lijst'
            ? 'Alle organisaties. Kies er een om de prompts ervan te zien.'
            : tab === 'organisaties'
            ? 'Organogram van het organisatienetwerk. Sleep om te verschuiven, scroll of gebruik de knoppen om te zoomen, klik een organisatie aan voor details.'
            : 'Interactieve weergave van het promptlandschap.'}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={clsx(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === id ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* De tekeningen vangen elke veeg op. Daarom nooit het hele scherm vullen:
          er moet ruimte overblijven om de pagina zelf te kunnen schuiven. */}
      <div
        className={clsx(
          'opl-card',
          tab === 'lijst'
            ? 'p-3'
            : 'h-[55dvh] min-h-[16rem] overflow-hidden sm:h-[60vh] sm:min-h-[420px] laag:h-[60dvh] laag:min-h-0',
        )}
      >
        {tab === 'lijst' ? (
          loading ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Organisaties laden…</p>
          ) : (
            <OrgTree orgs={orgs} />
          )
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            3D-scène laden…
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                3D-scène laden…
              </div>
            }
          >
            {tab === 'organisaties' ? (
              <OrgChart orgs={orgs} />
            ) : (
              <PromptEcosystem prompts={prompts} categories={categories} />
            )}
          </Suspense>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        {orgs.length} organisaties · {prompts.length} prompts
      </p>
    </div>
  );
}
