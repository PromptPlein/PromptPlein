import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Sparkles, Star, Check, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTilt } from '@/hooks/useTilt';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  sharingBadgeClasses,
  sharingLabel,
  formatDate,
  copyToClipboard,
  getCurrentUser,
} from '@/lib/utils';
import { toggleFavorite } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import type { Prompt } from '@/types';

interface PromptCardProps {
  prompt: Prompt;
  onChanged?: (updated: Prompt) => void;
}

export default function PromptCard({ prompt, onChanged }: PromptCardProps) {
  const tilt = useTilt<HTMLAnchorElement>();
  const { categoryById, roleById } = useReferenceData();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    await copyToClipboard(prompt.content);
    setCopied(true);
    toast.success('Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await toggleFavorite(prompt);
      onChanged?.(updated);
      void trackEvent({
        event_type: 'favorite_toggled',
        user_identifier: getCurrentUser(),
        prompt_id: prompt.id,
        metadata: { is_favorite: updated.is_favorite },
      });
      toast.success(updated.is_favorite ? 'Toegevoegd aan favorieten' : 'Verwijderd uit favorieten');
    } catch {
      toast.error('Bijwerken mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    const url = `${window.location.origin}/prompt/${prompt.id}`;
    await copyToClipboard(url);
    toast.success('Deelbare link gekopieerd');
  }

  return (
    <Link
      ref={tilt.ref}
      to={`/prompt/${prompt.id}`}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={tilt.style}
      className="opl-card group block p-5 will-change-transform"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-semibold text-rijksblauw-700 group-hover:text-rijksblauw-500 dark:text-rijksblauw-200">
          {prompt.title}
        </h3>
        <button
          onClick={handleFavorite}
          disabled={busy}
          aria-label={prompt.is_favorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-500 dark:text-slate-500 dark:hover:bg-amber-500/10"
        >
          <Star
            size={18}
            className={prompt.is_favorite ? 'fill-amber-400 text-amber-400' : ''}
          />
        </button>
      </div>

      {prompt.description && (
        <p className="mb-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{prompt.description}</p>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {category && (
          <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">{category.name}</span>
        )}
        {role && <span className="opl-badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{role.name}</span>}
        <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
          {sharingLabel(prompt.sharing_level)}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {prompt.created_by || 'Onbekend'} · {formatDate(prompt.created_at)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleShare}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Deel prompt"
            title="Deelbare link kopiëren"
          >
            <Share2 size={16} />
          </button>
          <button
            onClick={handleCopy}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Kopieer prompt"
            title="Prompt kopiëren"
          >
            {copied ? <Check size={16} className="text-rijksgroen" /> : <Copy size={16} />}
          </button>
          <Link
            to={`/optimaliseren/${prompt.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-md p-1.5 text-rijksoranje hover:bg-orange-50"
            aria-label="Optimaliseer prompt"
            title="Optimaliseren"
          >
            <Sparkles size={16} />
          </Link>
        </div>
      </div>
    </Link>
  );
}
