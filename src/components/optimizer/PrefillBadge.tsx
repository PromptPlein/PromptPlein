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
 * duidelijk of de inhoud uit de eigen input van de gebruiker is afgeleid
 * (groen, hoog vertrouwen) of een AI-suggestie is die om controle vraagt
 * (donkeroranje met witte letters, zodat het opvalt).
 */
export default function PrefillBadge({ source, note }: PrefillBadgeProps) {
  const fromPrompt = source === 'prompt';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        fromPrompt
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          // Donkeroranje met witte letters; semibold houdt die kleine witte
          // tekst leesbaar op de volle kleur.
          : 'bg-rijksoranje-dark font-semibold text-white',
      )}
      title={note || (fromPrompt ? 'Afgeleid uit je eigen input' : 'AI-suggestie; controleer of dit klopt')}
    >
      {fromPrompt ? <Sparkles size={11} /> : <Wand2 size={11} />}
      {fromPrompt ? 'Uit jouw input' : 'Controleren'}
    </span>
  );
}
