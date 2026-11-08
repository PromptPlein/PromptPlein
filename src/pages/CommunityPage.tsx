import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Trophy, ThumbsUp, FileText, Building2, ChevronRight, Flame } from '@/components/common/icons';
import OrgTree from '@/components/network/OrgTree';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listCommunityMembers, firstName } from '@/services/communityService';
import TrendingPage from '@/pages/TrendingPage';
import type { CommunityMember } from '@/types';

type Tab = 'community' | 'trending';

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>('community');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
          <Users size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Community</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Wie maakt de prompts, bij welk ministerie horen ze, en welke prompts waarderen collega’s het meest.
          </p>
        </div>
      </div>

      {/* Tabbladen */}
      <div className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <TabButton
          active={tab === 'community'}
          onClick={() => setTab('community')}
          icon={<Users size={16} />}
          label="Community"
        />
        <TabButton
          active={tab === 'trending'}
          onClick={() => setTab('trending')}
          icon={<Flame size={16} />}
          label="Trending"
        />
      </div>

      {tab === 'community' ? <CommunityTab /> : <TrendingPage embedded />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-rijksblauw-600 text-rijksblauw-700 dark:border-rijksblauw-300 dark:text-rijksblauw-200'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {label}
    </button>
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
      <div className="mb-8 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={<Users size={18} />} value={members.length} label="Makers" />
        <Stat icon={<FileText size={18} />} value={totalPrompts} label="Prompts" />
        <Stat icon={<ThumbsUp size={18} />} value={totalLikes} label="Likes" />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Ranglijst */}
        <section className="min-w-0">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-200">
            <Trophy size={18} className="text-nadruk" /> Ranglijst
          </h2>
          {loading ? (
            <div className="opl-card p-6 text-sm text-slate-400 dark:text-slate-500">Laden…</div>
          ) : members.length === 0 ? (
            <div className="opl-card p-6 text-sm text-slate-500 dark:text-slate-400">
              Nog geen makers met prompts. Maak de eerste prompt en verschijn hier!
            </div>
          ) : (
            <ol className="opl-card divide-y divide-slate-100 p-0 dark:divide-slate-700">
              {members.map((m, i) => (
                <li key={m.id}>
                  <Link
                    to={`/community/${m.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span
                      className={
                        i < 3
                          ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nadruk/15 text-sm font-bold text-nadruk'
                          : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                        {firstName(m.full_name)}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {organizationById(m.organization_id)?.name ?? 'Onbekende organisatie'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1" title="Likes">
                        <ThumbsUp size={13} /> {m.total_likes}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Prompts">
                        <FileText size={13} /> {m.prompt_count}
                      </span>
                      <ChevronRight size={15} className="text-slate-300 dark:text-slate-600" />
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Boomstructuur Rijksoverheid → ministerie → afdeling */}
        <section className="min-w-0">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-200">
            <Building2 size={18} className="text-rijksblauw-500" /> Organisatie
          </h2>
          <div className="opl-card p-4">
            <OrgTree orgs={organizations} />
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="opl-card flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-500 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}
