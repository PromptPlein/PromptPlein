import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  Search,
  Sparkles,
  MessageSquare,
  Layers,
  type LucideIcon,
} from '@/components/common/icons';
import clsx from 'clsx';
import InfoDot from '@/components/common/InfoDot';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { categoryIcon } from '@/lib/categoryIcons';
import { listPrompts } from '@/services/repository';
import { getChatSettingsCached } from '@/services/settingsService';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import UploadModal from '@/components/prompts/UploadModal';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import type { Prompt } from '@/types';

/**
 * De startpagina in tegels: eerst de vier dingen die je hier kunt doen, dan de
 * categorieën als iconen met een aantal, dan de nieuwste prompts. Uitleg staat
 * niet als lopende tekst op de pagina, maar achter een infobolletje.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { categories, techniques } = useReferenceData();
  const [recent, setRecent] = useState<Prompt[]>([]);
  // Aantal prompts in totaal en per categorie, voor de getallen op de tegels.
  const [total, setTotal] = useState<number | null>(null);
  const [perCategory, setPerCategory] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  // De chattegel staat er alleen zolang de beheerder de chat aan heeft, net als
  // het menu-item in de kopbalk.
  const [chatEnabled, setChatEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    listPrompts()
      .then((p) => {
        if (!active) return;
        setRecent(p.slice(0, 6));
        setTotal(p.length);
        const counts: Record<string, number> = {};
        for (const prompt of p) {
          if (prompt.category_id) counts[prompt.category_id] = (counts[prompt.category_id] ?? 0) + 1;
        }
        setPerCategory(counts);
      })
      .finally(() => active && setLoading(false));
    void getChatSettingsCached().then((s) => {
      if (active) setChatEnabled(s.enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const { enriched, authors } = usePromptCommunity(recent);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Wat wil je doen? Vier grote tegels, elk één taak. */}
      <section className="mb-10" aria-labelledby="home-taken">
        <h1
          id="home-taken"
          className="mb-4 text-3xl font-bold text-rijksblauw-700 dark:text-rijksblauw-100"
        >
          Wat wil je doen?
        </h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TaskTile
            to="/genereren"
            icon={Sparkles}
            label="Prompt maken"
            className="bg-rijksblauw-700 text-white hover:bg-rijksblauw-800 dark:bg-rijksblauw-600 dark:hover:bg-rijksblauw-500"
          />
          {chatEnabled && (
            <TaskTile
              to="/chat"
              icon={MessageSquare}
              label="Chatten"
              className="bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-[#123a55] dark:text-white dark:hover:bg-[#184a6c]"
            />
          )}
          <TaskTile
            to="/zoeken"
            icon={Search}
            label="Prompts zoeken"
            count={total}
            countLabel="prompts"
            className="bg-[#dff4ed] text-rijksblauw-700 hover:bg-[#c8ecdf] dark:bg-[#1f4346] dark:text-white dark:hover:bg-[#285558]"
          />
          <TaskTile
            to="/technieken"
            icon={Layers}
            label="Technieken leren"
            count={techniques.length || null}
            countLabel="technieken"
            className="bg-[#fff0c9] text-rijksblauw-700 hover:bg-[#ffe6a6] dark:bg-[#403a24] dark:text-white dark:hover:bg-[#524a2d]"
          />
        </div>
      </section>

      {/* Categorieën als iconen met het aantal prompts. */}
      <section className="mb-10" aria-labelledby="home-categorieen">
        <div className="mb-3 flex items-center gap-1">
          <h2
            id="home-categorieen"
            className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            Categorieën
          </h2>
          <InfoDot
            label="Uitleg over categorieën"
            text="Klik een categorie. Het getal is het aantal prompts."
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const count = perCategory[c.id] ?? 0;
            return (
              <Link
                key={c.id}
                to={`/zoeken?category=${c.id}`}
                title={c.description || undefined}
                className="opl-card group relative flex min-h-[7.5rem] flex-col items-center justify-center gap-2.5 px-2 pb-3 pt-5 text-center hover:border-rijksblauw-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-700 transition-colors group-hover:bg-rijksblauw-700 group-hover:text-white dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                  <Icon size={24} />
                </span>
                <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                  {c.name}
                </span>
                {!loading && (
                  <span
                    aria-label={`${count} prompts`}
                    className="absolute right-2 top-2 min-w-[1.5rem] rounded-full bg-rijksblauw-700 px-1.5 text-center text-xs font-bold leading-6 text-white dark:bg-rijksblauw-500"
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Nieuwste prompts */}
      <section aria-labelledby="home-nieuw">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="home-nieuw" className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            Nieuwe prompts
          </h2>
          <Link
            to="/zoeken"
            className="inline-flex items-center gap-1 text-sm font-semibold text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
          >
            Alles <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <SkeletonGrid count={6} />
        ) : recent.length === 0 ? (
          <div className="opl-card flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-slate-600 dark:text-slate-300">Er zijn nog geen prompts.</p>
            <button onClick={() => setUploadOpen(true)} className="opl-btn-primary">
              <Plus size={18} /> Nieuwe prompt
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                author={p.created_by_user ? authors[p.created_by_user] : null}
                onChanged={(u) => setRecent((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
              />
            ))}
          </div>
        )}
      </section>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(prompt) => navigate(`/prompt/${prompt.id}`)}
      />
    </div>
  );
}

/** Eén taaktegel: groot icoon, één label, een pijl en soms een aantal. */
function TaskTile({
  to,
  icon: Icon,
  label,
  count,
  countLabel,
  className,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number | null;
  countLabel?: string;
  className: string;
}): ReactNode {
  return (
    <Link
      to={to}
      className={clsx(
        'flex min-h-[10.5rem] flex-col justify-between gap-4 rounded-xl p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
        className,
      )}
    >
      <span className="flex items-start justify-between">
        <Icon size={44} strokeWidth={1.5} />
        {count != null && (
          <span
            aria-label={`${count} ${countLabel ?? ''}`.trim()}
            className="rounded-full bg-white px-2.5 py-0.5 text-sm font-bold text-rijksblauw-700"
          >
            {count}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="text-2xl font-bold leading-tight">{label}</span>
        <ArrowRight size={22} className="shrink-0" />
      </span>
    </Link>
  );
}
