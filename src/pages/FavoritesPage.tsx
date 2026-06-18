import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import { listPrompts } from '@/services/repository';
import type { Prompt } from '@/types';

export default function FavoritesPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    listPrompts({ favorites_only: true })
      .then(setPrompts)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function handleChanged(updated: Prompt) {
    // Verwijder uit de lijst als de favoriet is uitgezet.
    setPrompts((prev) =>
      updated.is_favorite
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : prev.filter((p) => p.id !== updated.id),
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Star className="fill-amber-400 text-amber-400" />
        <h1 className="text-2xl font-bold text-rijksblauw-700">Favorieten</h1>
      </div>

      {loading ? (
        <SkeletonGrid count={3} />
      ) : prompts.length === 0 ? (
        <div className="opl-card flex flex-col items-center gap-3 p-12 text-center">
          <Star size={40} className="text-slate-300" />
          <p className="text-slate-600">Je hebt nog geen favorieten.</p>
          <Link to="/zoeken" className="opl-btn-primary">
            Bekijk de bibliotheek
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prompts.map((p) => (
            <PromptCard key={p.id} prompt={p} onChanged={handleChanged} />
          ))}
        </div>
      )}
    </div>
  );
}
