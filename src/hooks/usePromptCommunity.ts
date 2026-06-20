import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getLikeInfo } from '@/services/likeService';
import { getPublicProfiles } from '@/services/communityService';
import type { Prompt, PublicProfile } from '@/types';

/**
 * Verrijkt een lijst prompts met community-data: like-tellingen (+ of de
 * huidige gebruiker geliket heeft) en de publieke auteursprofielen (naam +
 * organisatie). Eén batch-call per soort, zodat een grid geen N requests doet.
 */
export function usePromptCommunity(prompts: Prompt[]): {
  /** Prompts verrijkt met like_count + liked_by_me. */
  enriched: Prompt[];
  /** Auteursprofiel per user-id, voor het auteurslabel op de kaart. */
  authors: Record<string, PublicProfile>;
} {
  const { user } = useAuth();
  const [likes, setLikes] = useState<Record<string, { like_count: number; liked_by_me: boolean }>>(
    {},
  );
  const [authors, setAuthors] = useState<Record<string, PublicProfile>>({});

  // Stabiele sleutel zodat we niet bij elke render opnieuw fetchen.
  const idKey = prompts.map((p) => p.id).join(',');
  const authorKey = [...new Set(prompts.map((p) => p.created_by_user).filter(Boolean))].join(',');

  useEffect(() => {
    let active = true;
    const ids = prompts.map((p) => p.id);
    if (ids.length === 0) {
      setLikes({});
      return;
    }
    getLikeInfo(ids, user?.id)
      .then((info) => active && setLikes(info))
      .catch(() => active && setLikes({}));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, user?.id]);

  useEffect(() => {
    let active = true;
    const authorIds = [...new Set(prompts.map((p) => p.created_by_user).filter(Boolean))] as string[];
    if (authorIds.length === 0) {
      setAuthors({});
      return;
    }
    getPublicProfiles(authorIds)
      .then((map) => active && setAuthors(map))
      .catch(() => active && setAuthors({}));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorKey]);

  const enriched = prompts.map((p) => {
    const info = likes[p.id];
    return info ? { ...p, like_count: info.like_count, liked_by_me: info.liked_by_me } : p;
  });

  return { enriched, authors };
}
