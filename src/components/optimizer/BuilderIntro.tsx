import { type ReactNode } from 'react';
import InfoDot from '@/components/common/InfoDot';

/**
 * Korte kop boven een techniekbouwer: wat je hier doet in een paar woorden, de
 * uitleg achter het infobolletje. Zo begint elke bouwer gelijk en staat er geen
 * lap tekst boven de velden.
 */
export default function BuilderIntro({
  icon,
  title,
  text,
}: {
  icon?: ReactNode;
  title: string;
  /** Hooguit twee korte zinnen. */
  text: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && (
        <span aria-hidden="true" className="shrink-0 text-rijksblauw-500 dark:text-rijksblauw-200">
          {icon}
        </span>
      )}
      <p className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</p>
      <InfoDot label={`Uitleg bij: ${title}`} text={text} />
    </div>
  );
}
