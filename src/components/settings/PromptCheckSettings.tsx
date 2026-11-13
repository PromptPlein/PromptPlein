import { useId } from 'react';
import InfoDot from '@/components/common/InfoDot';
import { setPromptCheckEnabled, usePromptCheckEnabled } from '@/lib/promptCheck';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';

/**
 * De promptcheck in de chat aan of uit. Staat in deze browser en vraagt dus geen
 * account, net als de chat zelf.
 */
export default function PromptCheckSettings() {
  const enabled = usePromptCheckEnabled();
  const titleId = useId();

  return (
    <section className={SECTION_CLASS} aria-labelledby={titleId}>
      <div className="flex items-center gap-1">
        <h2 id={titleId} className={TITLE_CLASS}>
          Promptcheck
        </h2>
        <InfoDot
          label="Uitleg over de promptcheck"
          text="Kan je eerste bericht korter of scherper, dan staat er Kan korter bij het tekstvak. Je browser kijkt mee; er gaat niets naar de AI."
        />
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 py-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setPromptCheckEnabled(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-rijksblauw-700"
        />
        <span>
          <span className="block font-medium text-slate-900 dark:text-slate-100">
            Laat zien als mijn bericht korter kan
          </span>
          <span className="block text-sm text-slate-600 dark:text-slate-300">
            Geldt in deze browser.
          </span>
        </span>
      </label>
    </section>
  );
}
