import { type ReactNode } from 'react';
import InfoDot from '@/components/common/InfoDot';

/**
 * Kop van één genummerde stap in "Prompt maken": het nummer in een bolletje, een
 * korte vraag en de uitleg achter een infobolletje. Rechts is plek voor de
 * knoppen die bij de stap horen (voorbeelden, opschonen).
 */
export default function StepHeading({
  step,
  title,
  htmlFor,
  info,
  children,
}: {
  step: number;
  title: string;
  /** Hoort de kop bij één invoerveld, dan is hij ook het label van dat veld. */
  htmlFor?: string;
  /** Korte uitleg achter het infobolletje. */
  info?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rijksblauw-700 text-sm font-bold text-white dark:bg-rijksblauw-500"
      >
        {step}
      </span>
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
        {htmlFor ? <label htmlFor={htmlFor}>{title}</label> : title}
      </h2>
      {info && <InfoDot label={`Uitleg bij: ${title}`} text={info} className="-ml-1" />}
      {children}
    </div>
  );
}
