import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Star, Check, Share2, ThumbsUp } from '@/components/common/icons';
import { notify } from '@/lib/notify';
import InfoDot from '@/components/common/InfoDot';
import { categoryIcon } from '@/lib/categoryIcons';
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
    notify.success('Prompt gekopieerd');
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
      notify.success(updated.is_favorite ? 'Toegevoegd aan favorieten' : 'Verwijderd uit favorieten');
    } catch {
      notify.error('Bijwerken mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    // Met echte backend is liken alleen voor ingelogde gebruikers.
    if (configured && !user) {
      notify.error('Log in om een prompt te liken.');
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
      notify.error('Liken mislukt');
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    const url = `${window.location.origin}/prompt/${prompt.id}`;
    await copyToClipboard(url);
    notify.success('Deelbare link gekopieerd');
  }

  const CategoryIcon = categoryIcon(category?.icon);
  // Wat van de kaart af is gegaan (omschrijving, organisatie, functie, datum)
  // staat achter het infobolletje: één blik op de kaart, de rest op verzoek.
  const info = [
    prompt.description,
    [org?.name, role?.name, formatDate(prompt.created_at)].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
  const ACTION =
    'relative z-10 inline-flex h-9 min-w-[2.25rem] items-center justify-center gap-1 rounded px-1.5 text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/15';

  return (
    // De titel is de link; zijn klikvlak (after:inset-0) beslaat de hele kaart.
    // De knoppen liggen er met z-10 bovenop en blijven dus gewone knoppen.
    <article className="opl-card group relative flex h-full flex-col gap-3 p-4 transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-center justify-between gap-2 flex-wrap gap-y-1">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 dark:bg-rijksblauw-500/15">
            <CategoryIcon size={16} />
          </span>
          <span className="truncate">{category?.name ?? 'Overig'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
            {sharingLabel(prompt.sharing_level)}
          </span>
          {info && (
            <InfoDot label="Meer over deze prompt" text={info} className="relative z-10 -mr-1.5" />
          )}
        </span>
      </div>

      <h3 className="line-clamp-2 text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">
        <Link
          to={`/prompt/${prompt.id}`}
          className="after:absolute after:inset-0 after:rounded-xl group-hover:text-rijksblauw-700 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-rijksblauw-500 dark:group-hover:text-rijksblauw-200"
        >
          {prompt.title}
        </Link>
      </h3>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        {/* Auteur: voornaam, klikbaar naar het publieke profiel. */}
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-rijksblauw-700 dark:bg-slate-700 dark:text-rijksblauw-200"
          >
            {authorName.charAt(0).toUpperCase()}
          </span>
          {authorId ? (
            <Link
              to={`/community/${authorId}`}
              className="opl-raak relative z-10 truncate font-medium hover:underline focus:outline-none focus-visible:underline"
            >
              {authorName}
            </Link>
          ) : (
            <span className="truncate">{authorName}</span>
          )}
        </span>

        <div className="flex items-center">
          <button
            onClick={handleLike}
            disabled={likeBusy}
            className={ACTION}
            aria-label={`${liked ? 'Like intrekken' : 'Prompt liken'}, ${likeCount}`}
            aria-pressed={liked}
            title={liked ? 'Like intrekken' : 'Vind ik goed'}
          >
            <ThumbsUp size={18} className={liked ? 'fill-rijksblauw-500/30' : ''} />
            <span className="text-sm font-semibold tabular-nums">{likeCount}</span>
          </button>
          <button
            onClick={handleShare}
            className={ACTION}
            aria-label="Deel prompt"
            title="Deelbare link kopiëren"
          >
            <Share2 size={18} />
          </button>
          <button
            onClick={handleCopy}
            className={ACTION}
            aria-label="Kopieer prompt"
            title="Prompt kopiëren"
          >
            {copied ? <Check size={18} className="text-rijksgroen" /> : <Copy size={18} />}
          </button>
          <button
            onClick={handleFavorite}
            disabled={busy}
            className={ACTION}
            aria-label={prompt.is_favorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
            aria-pressed={Boolean(prompt.is_favorite)}
            title={prompt.is_favorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
          >
            <Star
              size={18}
              className={prompt.is_favorite ? 'fill-rijksoranje text-rijksoranje' : ''}
            />
          </button>
        </div>
      </div>
    </article>
  );
}
