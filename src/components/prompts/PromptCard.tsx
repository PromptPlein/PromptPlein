import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Star, Check, Share2, ThumbsUp } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import {
  sharingBadgeClasses,
  sharingLabel,
  formatDate,
  copyToClipboard,
  activityIdentifier,
} from '@/lib/utils';
import { toggleFavorite } from '@/services/repository';
import { toggleLike } from '@/services/likeService';
import { firstName } from '@/services/communityService';
import { trackEvent } from '@/services/analyticsService';
import type { Prompt, PublicProfile } from '@/types';

interface PromptCardProps {
  prompt: Prompt;
  /** Publiek auteursprofiel (naam + organisatie) voor het auteurslabel. */
  author?: PublicProfile | null;
  onChanged?: (updated: Prompt) => void;
}

export default function PromptCard({ prompt, author, onChanged }: PromptCardProps) {
  const navigate = useNavigate();
  const { categoryById, roleById, organizationById } = useReferenceData();
  const { user, profile, configured } = useAuth();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeCount, setLikeCount] = useState(prompt.like_count ?? 0);
  const [liked, setLiked] = useState(prompt.liked_by_me ?? false);

  // Verrijking (like-telling + of ik geliket heb) komt asynchroon binnen via
  // de props; neem die over zolang we niet zelf midden in een toggle zitten.
  useEffect(() => {
    if (likeBusy) return;
    if (prompt.like_count !== undefined) setLikeCount(prompt.like_count);
    if (prompt.liked_by_me !== undefined) setLiked(prompt.liked_by_me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.like_count, prompt.liked_by_me]);

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);
  const org = organizationById(author?.organization_id ?? prompt.organization_id);

  const authorId = prompt.created_by_user ?? author?.id ?? null;
  const authorName = author?.full_name
    ? firstName(author.full_name)
    : prompt.created_by || 'Onbekend';

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
        user_identifier: activityIdentifier(profile, user?.email),
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

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    // Met echte backend is liken alleen voor ingelogde gebruikers.
    if (configured && !user) {
      toast.error('Log in om een prompt te liken.');
      navigate('/auth/login');
      return;
    }
    setLikeBusy(true);
    // Optimistische update voor een vlotte UI.
    const prevCount = likeCount;
    const prevLiked = liked;
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));
    try {
      const state = await toggleLike(prompt.id, user?.id ?? 'local-user');
      setLiked(state.liked_by_me);
      setLikeCount(state.like_count);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      toast.error('Liken mislukt');
    } finally {
      setLikeBusy(false);
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
      to={`/prompt/${prompt.id}`}
      className="opl-card group block p-5 transition-shadow duration-200 hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 font-semibold text-rijksblauw-700 group-hover:text-rijksblauw-500 dark:text-rijksblauw-200">
          {prompt.title}
        </h3>
        <button
          onClick={handleFavorite}
          disabled={busy}
          aria-label={prompt.is_favorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
          className="shrink-0 rounded-md p-1 text-amber-400 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-500/10"
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

      {/* Auteur: voornaam + ministerie, klikbaar naar het publieke profiel. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        {authorId ? (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate(`/community/${authorId}`);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/community/${authorId}`);
              }
            }}
            className="cursor-pointer font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
          >
            {authorName}
          </span>
        ) : (
          <span className="font-medium text-slate-500 dark:text-slate-400">{authorName}</span>
        )}
        {org && (
          <span className="opl-badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {org.name}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {category && (
          <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">{category.name}</span>
        )}
        {role && (
          <span className="opl-badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{role.name}</span>
        )}
        <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
          {sharingLabel(prompt.sharing_level)}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {formatDate(prompt.created_at)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleLike}
            disabled={likeBusy}
            className={
              liked
                ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-[#1877F2]'
                : 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-[#1877F2]/70 hover:bg-[#1877F2]/10 hover:text-[#1877F2]'
            }
            aria-label={liked ? 'Like intrekken' : 'Prompt liken'}
            aria-pressed={liked}
            title={liked ? 'Like intrekken' : 'Vind ik goed'}
          >
            <ThumbsUp size={16} className={liked ? 'fill-[#1877F2]/20' : ''} />
            <span className="tabular-nums">{likeCount}</span>
          </button>
          <button
            onClick={handleShare}
            className="rounded-md p-1.5 text-rijksoranje/70 hover:bg-orange-50 hover:text-rijksoranje dark:hover:bg-rijksoranje/10"
            aria-label="Deel prompt"
            title="Deelbare link kopiëren"
          >
            <Share2 size={16} />
          </button>
          <button
            onClick={handleCopy}
            className="rounded-md p-1.5 text-rijksblauw-500/70 hover:bg-rijksblauw-50 hover:text-rijksblauw-600 dark:text-rijksblauw-300/70 dark:hover:bg-rijksblauw-500/10 dark:hover:text-rijksblauw-200"
            aria-label="Kopieer prompt"
            title="Prompt kopiëren"
          >
            {copied ? <Check size={16} className="text-rijksgroen" /> : <Copy size={16} />}
          </button>
        </div>
      </div>
    </Link>
  );
}
