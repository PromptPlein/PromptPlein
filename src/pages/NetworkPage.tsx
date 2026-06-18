import { Suspense, lazy, useEffect, useState } from 'react';
import { Network, Boxes } from 'lucide-react';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listOrganizations } from '@/services/orgService';
import { listPrompts } from '@/services/repository';
import type { Organization, Prompt } from '@/types';

const OrganizationNetwork = lazy(() => import('@/components/three/OrganizationNetwork'));
const PromptEcosystem = lazy(() => import('@/components/three/PromptEcosystem'));

type Tab = 'organisaties' | 'prompts';

const TABS: { id: Tab; label: string; icon: typeof Network }[] = [
  { id: 'organisaties', label: 'Organisatienetwerk', icon: Network },
  { id: 'prompts', label: 'Prompt-ecosysteem', icon: Boxes },
];

export default function NetworkPage() {
  const { categories } = useReferenceData();
  const [tab, setTab] = useState<Tab>('organisaties');
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
        <h1 className="text-2xl font-bold text-rijksblauw-700">Netwerkverkenner</h1>
        <p className="text-sm text-slate-500">
          Interactieve 3D-weergave van organisaties en het promptlandschap. Sleep om te draaien,
          scroll om te zoomen.
        </p>
      </div>

      <div className="mb-4 flex gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === id ? 'bg-rijksblauw-50 text-rijksblauw-700' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <div className="opl-card h-[60vh] min-h-[420px] overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            3D-scène laden…
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                3D-scène laden…
              </div>
            }
          >
            {tab === 'organisaties' ? (
              <OrganizationNetwork orgs={orgs} />
            ) : (
              <PromptEcosystem prompts={prompts} categories={categories} />
            )}
          </Suspense>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {orgs.length} organisaties · {prompts.length} prompts
      </p>
    </div>
  );
}
