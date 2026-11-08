import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNlddEvent } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import InfoDot from '@/components/common/InfoDot';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import {
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
import '@nldd/design-system/avatar';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/link';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/title';
import '@nldd/design-system/toggle-button';

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

  const likeRef = useRef<HTMLElement & { selected?: boolean }>(null);
  const favoriteRef = useRef<HTMLElement & { selected?: boolean }>(null);
  // The toggles flip themselves on a click; the state lives here, so set them
  // back and let the handler decide.
  useNlddEvent(likeRef, 'change', () => {
    if (likeRef.current) likeRef.current.selected = liked;
    void handleLike();
  });
  useNlddEvent(favoriteRef, 'change', () => {
    if (favoriteRef.current) favoriteRef.current.selected = Boolean(prompt.is_favorite);
    void handleFavorite();
  });

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);
  const org = organizationById(author?.organization_id ?? prompt.organization_id);

  const authorId = prompt.created_by_user ?? author?.id ?? null;
  const authorName = author?.full_name
    ? firstName(author.full_name)
    : prompt.created_by || 'Onbekend';

  async function handleCopy() {
    await copyToClipboard(prompt.content);
    setCopied(true);
    notify.success('Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleFavorite() {
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

  async function handleLike() {
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

  async function handleShare() {
    const url = `${window.location.origin}/prompt/${prompt.id}`;
    await copyToClipboard(url);
    notify.success('Deelbare link gekopieerd');
  }

  // What came off the card (description, organization, role, date) sits behind
  // the info dot: one glance at the card, the rest on request.
  const info = [
    prompt.description,
    [org?.name, role?.name, formatDate(prompt.created_at)].filter(Boolean).join(' · '),
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <nldd-card>
      <nldd-container padding="20" gap="8">
        <nldd-title
          heading-level={3}
          size={5}
          overline={category?.name ?? 'Overig'}
          text={prompt.title}
        ></nldd-title>
        <nldd-container layout="wrap" gap="4" vertical-alignment="center">
          <nldd-tag size="sm" text={sharingLabel(prompt.sharing_level)}></nldd-tag>
          {info && <InfoDot label="Meer over deze prompt" text={info} />}
        </nldd-container>
        <nldd-link
          size="sm"
          href={`/prompt/${prompt.id}`}
          end-icon="chevron-right"
          text="Bekijk prompt"
          accessible-label={`Bekijk prompt ${prompt.title}`}
        ></nldd-link>
      </nldd-container>

      <nldd-container slot="footer" padding-inline="20" padding-bottom="20" layout="grid" column-count={2} gap="8" vertical-alignment="center">
        {/* Author: first name, linked to the public profile. */}
        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-avatar size="28" name={authorName} decorative></nldd-avatar>
          {authorId ? (
            <nldd-link size="sm" href={`/community/${authorId}`} text={authorName}></nldd-link>
          ) : (
            <nldd-text size="sm" color="secondary">
              {authorName}
            </nldd-text>
          )}
        </nldd-container>

        <nldd-container layout="row" gap="2" vertical-alignment="center" horizontal-alignment="right">
          <nldd-toggle-button
            ref={likeRef}
            appearance="neutral-transparent"
            size="sm"
            icon="hand-thumbs-up"
            text={String(likeCount)}
            accessible-label={`${liked ? 'Like intrekken' : 'Prompt liken'}, ${likeCount}`}
            selected={liked || undefined}
            disabled={likeBusy || undefined}
          ></nldd-toggle-button>
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon="share"
            accessible-label="Deelbare link kopiëren"
            onClick={() => void handleShare()}
          ></nldd-icon-button>
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon={copied ? 'check-mark' : 'copy'}
            accessible-label="Kopieer prompt"
            onClick={() => void handleCopy()}
          ></nldd-icon-button>
          <nldd-toggle-button
            ref={favoriteRef}
            appearance="neutral-transparent"
            size="sm"
            variant="icon"
            icon="star"
            selected-icon="star-filled"
            accessible-label={prompt.is_favorite ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
            selected={prompt.is_favorite || undefined}
            disabled={busy || undefined}
          ></nldd-toggle-button>
        </nldd-container>
      </nldd-container>
    </nldd-card>
  );
}
