import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  Sparkles,
  Star,
  Share2,
  Trash2,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ShareModal from '@/components/share/ShareModal';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  deletePrompt,
  getPrompt,
  listOptimizations,
  toggleFavorite,
} from '@/services/repository';
import {
  copyToClipboard,
  formatDate,
  sharingBadgeClasses,
  sharingLabel,
} from '@/lib/utils';
import type { Optimization, Prompt } from '@/types';

export default function PromptDetailPage() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { categoryById, roleById, techniqueById } = useReferenceData();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!promptId) return;
    let active = true;
    setLoading(true);
    Promise.all([getPrompt(promptId), listOptimizations(promptId)])
      .then(([p, opts]) => {
        if (!active) return;
        setPrompt(p);
        setOptimizations(opts);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [promptId]);

  async function handleCopy(text: string) {
    await copyToClipboard(text);
    setCopied(true);
    toast.success('Gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleFavorite() {
    if (!prompt) return;
    const updated = await toggleFavorite(prompt);
    setPrompt(updated);
  }

  async function handleDelete() {
    if (!prompt) return;
    if (!confirm('Weet je zeker dat je deze prompt wilt verwijderen?')) return;
    await deletePrompt(prompt.id);
    toast.success('Prompt verwijderd');
    navigate('/zoeken');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="skeleton mb-4 h-8 w-2/3 rounded" />
        <div className="skeleton h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-slate-600">Deze prompt bestaat niet (meer).</p>
        <Link to="/zoeken" className="opl-btn-primary mt-4 inline-flex">
          Terug naar zoeken
        </Link>
      </div>
    );
  }

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} /> Terug
      </button>

      <div className="opl-card p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-rijksblauw-700">{prompt.title}</h1>
          <button
            onClick={handleFavorite}
            className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-500"
            aria-label="Favoriet"
          >
            <Star size={22} className={prompt.is_favorite ? 'fill-amber-400 text-amber-400' : ''} />
          </button>
        </div>

        {prompt.description && <p className="mb-4 text-slate-600">{prompt.description}</p>}

        <div className="mb-5 flex flex-wrap gap-1.5">
          {category && (
            <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700">{category.name}</span>
          )}
          {role && <span className="opl-badge bg-slate-100 text-slate-600">{role.name}</span>}
          <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
            {sharingLabel(prompt.sharing_level)}
          </span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Prompt-inhoud</h2>
          <button
            onClick={() => handleCopy(prompt.content)}
            className="inline-flex items-center gap-1 text-sm text-rijksblauw-500 hover:text-rijksblauw-700"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} Kopiëren
          </button>
        </div>
        <pre className="mb-5 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800">
          {prompt.content}
        </pre>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <Link to={`/optimaliseren/${prompt.id}`} className="opl-btn-primary">
            <Sparkles size={16} /> Optimaliseren
          </Link>
          <button onClick={() => setShareOpen(true)} className="opl-btn-secondary">
            <Share2 size={16} /> Delen
          </button>
          <button
            onClick={handleDelete}
            className="opl-btn-ghost ml-auto text-rijksrood hover:bg-red-50"
          >
            <Trash2 size={16} /> Verwijderen
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Aangemaakt door {prompt.created_by || 'onbekend'} op {formatDate(prompt.created_at)}
        </p>
      </div>

      {/* Eerdere optimalisaties */}
      {optimizations.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-rijksblauw-700">
            <History size={20} /> Eerdere optimalisaties ({optimizations.length})
          </h2>
          <div className="space-y-3">
            {optimizations.map((opt) => {
              const tech = techniqueById(opt.technique_id);
              return (
                <div key={opt.id} className="opl-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700">
                      {tech?.name ?? 'Techniek'}
                    </span>
                    <button
                      onClick={() => handleCopy(opt.optimized_content)}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Kopieer optimalisatie"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                    {opt.optimized_content}
                  </pre>
                  <p className="mt-2 text-xs text-slate-400">{formatDate(opt.created_at)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} prompt={prompt} />
    </div>
  );
}
