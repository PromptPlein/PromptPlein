import { v4 as uuidv4 } from 'uuid';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { localStore } from '@/services/localStore';
import { trackEvent } from '@/services/analyticsService';
import type { EmailShare } from '@/types';

const local = !isSupabaseConfigured || !supabase;

/** Bouw de publieke deel-URL voor een token. */
export function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

/**
 * Maak (of hergebruik) een deelbare link voor een prompt.
 * Genereert een willekeurig UUID-token (niet te raden).
 */
export async function createShareLink(promptId: string, sharedBy: string): Promise<EmailShare> {
  const token = uuidv4();

  let share: EmailShare;
  if (local) {
    share = localStore.createShare({ prompt_id: promptId, share_token: token, shared_by: sharedBy });
  } else {
    const { data, error } = await supabase!
      .from('email_shares')
      .insert({ prompt_id: promptId, share_token: token, shared_by: sharedBy })
      .select('*')
      .single();
    if (error) throw error;
    share = data as EmailShare;
  }

  await trackEvent({
    event_type: 'share_created',
    user_identifier: sharedBy,
    prompt_id: promptId,
    metadata: { token },
  });

  return share;
}

export async function getShareByToken(token: string): Promise<EmailShare | null> {
  if (local) return localStore.getShareByToken(token);
  const { data, error } = await supabase!
    .from('email_shares')
    .select('*')
    .eq('share_token', token)
    .maybeSingle();
  if (error) throw error;
  return (data as EmailShare) ?? null;
}

/** Registreer een weergave van een gedeelde prompt. */
export async function trackShareView(token: string): Promise<void> {
  if (local) {
    const share = localStore.incrementShareView(token);
    if (share) {
      await trackEvent({ event_type: 'share_viewed', prompt_id: share.prompt_id, metadata: { token } });
    }
    return;
  }
  const share = await getShareByToken(token);
  if (!share) return;
  await supabase!
    .from('email_shares')
    .update({ view_count: share.view_count + 1 })
    .eq('share_token', token);
  await trackEvent({ event_type: 'share_viewed', prompt_id: share.prompt_id, metadata: { token } });
}

/** Bouw een mailto-link met een ingevuld e-mailsjabloon. */
export function buildMailto(promptTitle: string, url: string, sharedBy: string): string {
  const subject = `Prompt gedeeld: ${promptTitle}`;
  const body = [
    'Hoi,',
    '',
    `${sharedBy || 'Een collega'} deelt een prompt met je uit de Overheid Prompt Library:`,
    '',
    `"${promptTitle}"`,
    url,
    '',
    'Je kunt de prompt rechtstreeks bekijken en kopiëren via bovenstaande link.',
    '',
    'Met vriendelijke groet,',
    sharedBy || '',
  ].join('\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
