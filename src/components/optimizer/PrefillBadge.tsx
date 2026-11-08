import { Globe, Sparkles, Wand2 } from '@/components/common/icons';
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
 * (het volle logogroen met donkere letters, zodat het opvalt).
 */
export default function PrefillBadge({ source, note }: PrefillBadgeProps) {
  const fromPrompt = source === 'prompt';
  // Aangevuld met een feit van internet: blauw met wereldbol, zodat zichtbaar
  // is dat zoeken echt iets heeft opgeleverd. De URL staat in het veld zelf.
  if (source === 'bron') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-50 px-2 py-0.5 text-[0.6875rem] font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200"
        title={note || 'Aangevuld met een feit uit een internetbron; de URL staat in het veld'}
      >
        <Globe size={11} />
        Aangevuld van internet
      </span>
    );
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
        fromPrompt
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          // Het volle logogroen met donkere letters, zodat het opvalt; semibold
          // houdt de kleine tekst leesbaar.
          : 'bg-pleingroen font-semibold text-slate-950',
      )}
      title={note || (fromPrompt ? 'Afgeleid uit je eigen input' : 'AI-suggestie; controleer of dit klopt')}
    >
      {fromPrompt ? <Sparkles size={11} /> : <Wand2 size={11} />}
      {fromPrompt ? 'Uit jouw tekst' : 'Controleren'}
    </span>
  );
}
