// Dicteren: stuurt een opname naar de edge function (mode 'transcribe'), die hem
// door Mistral laat uitschrijven. Alleen voor ingelogde gebruikers. De opname
// wordt nergens bewaard: niet hier, niet in de database en niet bij Mistral als
// bestand (zie transcribeAudio in de edge function).

import { getAnonKey, getFunctionUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Kan er gedicteerd worden? Zonder backend is er geen transcriptie. */
export const isTranscribeAvailable = isSupabaseConfigured;

/** Zet de opname om naar base64 zonder data-URL-voorvoegsel. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Opname niet te lezen'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Schrijft de opname uit. Gooit nooit: bij een fout komt `error` terug met een
 * zin die de UI zo kan tonen.
 */
export async function transcribeRecording(
  audio: Blob,
  signal?: AbortSignal,
): Promise<{ text: string; error?: string }> {
  const functionUrl = getFunctionUrl('optimize-prompt');
  if (!isSupabaseConfigured || !supabase || !functionUrl) {
    return { text: '', error: 'Dicteren werkt alleen met de AI-service erbij.' };
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { text: '', error: 'Log in om te kunnen dicteren.' };
  const anonKey = getAnonKey();

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      body: JSON.stringify({
        mode: 'transcribe',
        audio: await blobToBase64(audio),
        mimeType: audio.type,
      }),
      signal,
    });
    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      text?: string;
      error?: string;
    };
    if (!response.ok || !result.success) {
      return { text: '', error: `${result.error ?? 'Uitschrijven lukte niet'}.` };
    }
    return { text: (result.text ?? '').trim() };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { text: '' };
    return { text: '', error: 'Uitschrijven lukte niet. Controleer je verbinding.' };
  }
}
