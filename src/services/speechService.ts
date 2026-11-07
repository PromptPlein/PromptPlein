// Voorlezen met de natuurlijke stem: stuurt tekst naar de edge function (mode
// 'speech'), die hem door Mistral laat inspreken. Alleen voor ingelogde
// gebruikers. De audio blijft in het geheugen van de browser en wordt nergens
// bewaard, net als bij dicteren (zie transcribeService.ts).

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Niet ingelogd: geen storing, dus de terugval hoeft dat niet te melden. */
export class SpeechLoginRequiredError extends Error {}

/** Vraagt de audio op als mp3. Gooit bij een fout, ook bij afbreken. */
export async function synthesizeSpeech(text: string, signal?: AbortSignal): Promise<Blob> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    throw new SpeechLoginRequiredError('Geen AI-service');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SpeechLoginRequiredError('Niet ingelogd');
  const anonKey = getAnonKey();

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({ mode: 'speech', text }),
    signal,
  });
  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    audio?: string;
    error?: string;
  };
  if (!response.ok || !result.success || !result.audio) {
    throw new Error(result.error ?? 'Voorlezen lukte niet');
  }

  const binary = atob(result.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/mpeg' });
}
