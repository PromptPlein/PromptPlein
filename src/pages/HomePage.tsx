import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  FileText,
  Megaphone,
  Scale,
  BarChart3,
  Mail,
  Users,
  Search,
  Folder,
  Sparkles,
  MessageSquare,
  Layers,
  type LucideIcon,
} from 'lucide-react';

// Expliciete icoon-map (geen `import *`, dat zou de hele icon-set bundelen).
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  FileText,
  Megaphone,
  Scale,
  BarChart3,
  Mail,
  Users,
  Search,
  Folder,
};

// De hero wisselt per kalenderdag tussen twee achtergronden: de tegels (Three.js)
// en de promptregels (Canvas 2D). Beide lazy, zodat de hero direct rendert en
// three.js alleen laadt op een tegeldag.
const DashboardBackground = lazy(() => import('@/components/three/DashboardBackground'));
const PromptLinesBackground = lazy(() => import('@/components/common/PromptLinesBackground'));

function heroBackgroundForToday(): 'tegels' | 'regels' {
  const now = new Date();
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return dayNumber % 2 === 0 ? 'tegels' : 'regels';
}
// Recharts is zwaar; lazy-load de overzichtsgrafieken.
const PromptBreakdown = lazy(() => import('@/components/analytics/PromptBreakdown'));
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listPrompts } from '@/services/repository';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import UploadModal from '@/components/prompts/UploadModal';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import type { Prompt } from '@/types';

export default function HomePage() {
  const navigate = useNavigate();
  const { categories } = useReferenceData();
  const [recent, setRecent] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const heroBackground = useMemo(heroBackgroundForToday, []);

  useEffect(() => {
    let active = true;
    listPrompts()
      .then((p) => active && setRecent(p.slice(0, 6)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const totalPrompts = recent.length;
  const { enriched, authors } = usePromptCommunity(recent);

  return (
    <div>
      {/* Hero met een achtergrond die per dag wisselt */}
      <section
        className={`relative overflow-hidden ${
          heroBackground === 'tegels' ? 'bg-rijksblauw-700' : 'bg-rijksblauw-900'
        }`}
      >
        <Suspense fallback={null}>
          {heroBackground === 'tegels' ? <DashboardBackground /> : <PromptLinesBackground />}
        </Suspense>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Prompt Library voor de Nederlandse overheid
            </h1>
            <p className="mt-4 text-lg text-rijksblauw-50/90">
              Upload, deel, zoek en optimaliseer AI-prompts op basis van bewezen
              prompting-technieken. Voor ambtenaren, door ambtenaren.
            </p>
            <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
              <Link
                to="/genereren"
                className="opl-btn flex-1 justify-center border border-white/70 text-white hover:bg-white/10"
              >
                <Sparkles size={18} className="text-rijksoranje" /> Genereer een prompt
              </Link>
              <Link
                to="/chat"
                className="opl-btn flex-1 justify-center border border-white/70 text-white hover:bg-white/10"
              >
                <MessageSquare size={18} /> Start een chat
              </Link>
            </div>
            {/* Derde instap: de lijst met prompttechnieken zelf. Voor de training —
                deelnemers kiezen een techniek en vullen hem met hun eigen gegevens.
                Zelfde maat, tekstgrootte en vorm als de twee knoppen erboven; hij
                valt op door de gevulde witte achtergrond en de volle breedte, niet
                door een groter formaat. De witte rand houdt zijn hoogte gelijk aan
                de omrande knoppen. */}
            <div className="mx-auto mt-3 w-full max-w-md">
              <Link
                to="/technieken"
                className="opl-btn w-full justify-center border border-white bg-white text-rijksblauw-700 shadow-lg hover:bg-rijksblauw-50 focus:ring-white"
              >
                <Layers size={18} className="text-rijksoranje" /> Werken met Prompt Engineering
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Categorie-grid */}
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Categorieën</h2>
          <CategoryGrid />
        </section>

        {/* Recente prompts */}
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Recente prompts</h2>
            <Link
              to="/zoeken"
              className="inline-flex items-center gap-1 text-sm font-medium text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
            >
              Alles bekijken <ArrowRight size={16} />
            </Link>
          </div>

          {loading ? (
            <SkeletonGrid count={6} />
          ) : totalPrompts === 0 ? (
            <div className="opl-card flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-slate-600 dark:text-slate-300">Er zijn nog geen prompts. Voeg de eerste toe!</p>
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

        {/* Overzicht: prompts per categorie en per techniek (klikbaar) */}
        <section>
          <h2 className="mb-4 text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Overzicht</h2>
          <Suspense fallback={<div className="skeleton h-72 w-full rounded-xl" />}>
            <PromptBreakdown />
          </Suspense>
        </section>
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(prompt) => navigate(`/prompt/${prompt.id}`)}
      />
    </div>
  );

  function CategoryGrid() {
    const items = useMemo(() => categories, [categories]);
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((c) => {
          const Icon = CATEGORY_ICONS[c.icon ?? 'Folder'] ?? Folder;
          return (
            <Link
              key={c.id}
              to={`/zoeken?category=${c.id}`}
              className="opl-card group flex items-start gap-3 p-4 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-500 group-hover:bg-rijksblauw-500 group-hover:text-white dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</p>
                <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{c.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    );
  }
}
