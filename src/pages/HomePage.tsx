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

// Three.js is zwaar; lazy-load zodat de hero direct rendert.
const DashboardBackground = lazy(() => import('@/components/three/DashboardBackground'));
import { useReferenceData } from '@/context/ReferenceDataContext';
import { listPrompts } from '@/services/repository';
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

  return (
    <div>
      {/* Hero met Three.js achtergrond */}
      <section className="relative overflow-hidden bg-rijksblauw-700">
        <Suspense fallback={null}>
          <DashboardBackground />
        </Suspense>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <span className="opl-badge bg-white/15 text-white backdrop-blur">
              Phase 1 · MVP
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              Prompt Library voor de Nederlandse overheid
            </h1>
            <p className="mt-4 text-lg text-rijksblauw-50/90">
              Upload, deel, zoek en optimaliseer AI-prompts op basis van bewezen
              prompting-technieken. Voor ambtenaren, door ambtenaren.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => setUploadOpen(true)} className="opl-btn-primary bg-white text-rijksblauw-700 hover:bg-rijksblauw-50">
                <Plus size={18} /> Nieuwe prompt
              </button>
              <Link
                to="/zoeken"
                className="opl-btn border border-white/40 text-white hover:bg-white/10"
              >
                Verken bibliotheek <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Categorie-grid */}
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold text-rijksblauw-700">Categorieën</h2>
          <CategoryGrid />
        </section>

        {/* Recente prompts */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-rijksblauw-700">Recente prompts</h2>
            <Link
              to="/zoeken"
              className="inline-flex items-center gap-1 text-sm font-medium text-rijksblauw-500 hover:text-rijksblauw-700"
            >
              Alles bekijken <ArrowRight size={16} />
            </Link>
          </div>

          {loading ? (
            <SkeletonGrid count={6} />
          ) : totalPrompts === 0 ? (
            <div className="opl-card flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-slate-600">Er zijn nog geen prompts. Voeg de eerste toe!</p>
              <button onClick={() => setUploadOpen(true)} className="opl-btn-primary">
                <Plus size={18} /> Nieuwe prompt
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((p) => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  onChanged={(u) => setRecent((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
                />
              ))}
            </div>
          )}
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-500 group-hover:bg-rijksblauw-500 group-hover:text-white">
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{c.name}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{c.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    );
  }
}
