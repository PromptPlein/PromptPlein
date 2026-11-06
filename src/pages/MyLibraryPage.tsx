import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, FileText, Star, Plus } from '@/components/common/icons';
import clsx from 'clsx';
import PromptCard from '@/components/prompts/PromptCard';
import UploadModal from '@/components/prompts/UploadModal';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { listPrompts } from '@/services/repository';
import { listPromptsByAuthor } from '@/services/communityService';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import { useAuth } from '@/context/AuthContext';
import type { Prompt } from '@/types';

type Tab = 'mine' | 'favorites';

/**
 * Mijn bibliotheek: de persoonlijke verzameling van de gebruiker, met twee
 * tabbladen — de prompts die hij zelf gemaakt heeft en zijn favorieten. Eén
 * centrale plek voor "mijn spullen", zodat eigen werk en bewaarde prompts niet
 * verspreid over Community en Favorieten staan.
 */
export default function MyLibraryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<Prompt[]>([]);
  const [favorites, setFavorites] = useState<Prompt[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  // Een prompt die de gebruiker al heeft (uit een ander hulpmiddel, een
  // collega of zijn eigen notities) zonder de bouwer erin zetten.
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setMine([]);
      setLoadingMine(false);
      return;
    }
    setLoadingMine(true);
    listPromptsByAuthor(user.id)
      .then((list) => active && setMine(list))
      .catch(() => active && setMine([]))
      .finally(() => active && setLoadingMine(false));
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    setLoadingFavorites(true);
    listPrompts({ favorites_only: true })
      .then((list) => active && setFavorites(list))
      .catch(() => active && setFavorites([]))
      .finally(() => active && setLoadingFavorites(false));
    return () => {
      active = false;
    };
  }, []);

  const prompts = tab === 'mine' ? mine : favorites;
  const loading = tab === 'mine' ? loadingMine : loadingFavorites;
  const { enriched, authors } = usePromptCommunity(prompts);

  function handleCreated(prompt: Prompt) {
    setMine((prev) => [prompt, ...prev]);
    setTab('mine');
  }

  function handleChanged(updated: Prompt) {
    // Eigen prompts blijven in de lijst staan (alleen bijwerken).
    setMine((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    // Favorieten: verwijder uit de lijst als de favoriet is uitgezet.
    setFavorites((prev) =>
      updated.is_favorite
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : prev.filter((p) => p.id !== updated.id),
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Library className="text-rijksblauw-600 dark:text-rijksblauw-300" />
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            Mijn prompts
          </h1>
        </div>
        <button type="button" onClick={() => setUploadOpen(true)} className="opl-btn-primary">
          <Plus size={18} /> Prompt toevoegen
        </button>
      </div>

      {/* Tabbladen */}
      <div className="mb-6 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <TabButton
          active={tab === 'mine'}
          onClick={() => setTab('mine')}
          icon={<FileText size={16} />}
          label="Mijn prompts"
          count={mine.length}
        />
        <TabButton
          active={tab === 'favorites'}
          onClick={() => setTab('favorites')}
          icon={<Star size={16} />}
          label="Favorieten"
          count={favorites.length}
        />
      </div>

      {loading ? (
        <SkeletonGrid count={3} />
      ) : prompts.length === 0 ? (
        <EmptyState tab={tab} onAdd={() => setUploadOpen(true)} />
      ) : (
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
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
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
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 text-xs font-semibold',
          active
            ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({ tab, onAdd }: { tab: Tab; onAdd: () => void }) {
  if (tab === 'mine') {
    return (
      <div className="opl-card flex flex-col items-center gap-3 p-12 text-center">
        <FileText size={40} className="text-slate-300 dark:text-slate-500" />
        <p className="text-slate-600 dark:text-slate-300">Je hebt nog geen eigen prompts gemaakt.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/genereren" className="opl-btn-primary">
            Maak je eerste prompt
          </Link>
          <button type="button" onClick={onAdd} className="opl-btn-secondary">
            <Plus size={16} /> Zelf een prompt toevoegen
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="opl-card flex flex-col items-center gap-3 p-12 text-center">
      <Star size={40} className="text-slate-300 dark:text-slate-500" />
      <p className="text-slate-600 dark:text-slate-300">Je hebt nog geen favorieten.</p>
      <Link to="/zoeken" className="opl-btn-primary">
        Bekijk de bibliotheek
      </Link>
    </div>
  );
}
