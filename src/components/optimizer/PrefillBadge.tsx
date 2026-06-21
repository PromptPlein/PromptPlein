import { Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import type { PrefillSource } from '@/types';

interface PrefillBadgeProps {
  source: PrefillSource;
  /** Optionele korte toelichting (bijv. "Afgeleid uit je prompt"). */
  note?: string;
}

/**
 * Klein herkomst-label bij een voor-ingevuld veld. Maakt in één oogopslag
 * duidelijk of de inhoud uit de prompt van de gebruiker is afgeleid (groen,
 * hoog vertrouwen) of een AI-suggestie is (oranje — controleren).
 */
export default function PrefillBadge({ source, note }: PrefillBadgeProps) {
  const fromPrompt = source === 'prompt';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        fromPrompt
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-rijksoranje/15 text-rijksoranje',
      )}
      title={note || (fromPrompt ? 'Afgeleid uit je prompt' : 'AI-suggestie — controleer of dit klopt')}
    >
      {fromPrompt ? <Sparkles size={11} /> : <Wand2 size={11} />}
      {fromPrompt ? 'Uit jouw prompt' : 'AI-suggestie'}
    </span>
  );
}
