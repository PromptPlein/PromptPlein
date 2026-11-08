import { useId } from 'react';
import InfoDot from '@/components/common/InfoDot';
import { setChatIntakeEnabled, useChatIntakeEnabled } from '@/lib/chatIntake';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';

/**
 * Doorvragen bij het eerste bericht van een nieuwe chat aan of uit. Staat in deze
 * browser en vraagt dus geen account, net als de chat zelf.
 */
export default function ChatIntakeSettings() {
  const enabled = useChatIntakeEnabled();
  const titleId = useId();

  return (
    <section className={SECTION_CLASS} aria-labelledby={titleId}>
      <div className="flex items-center gap-1">
        <h2 id={titleId} className={TITLE_CLASS}>
          Doorvragen
        </h2>
        <InfoDot
          label="Uitleg over doorvragen"
          text="Bij het eerste bericht van een nieuwe chat kijkt de AI of hij genoeg weet. Zo niet, dan stelt hij eerst een paar vragen en maakt hij er een prompt van, die je zelf verstuurt."
        />
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 py-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setChatIntakeEnabled(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-rijksblauw-700"
        />
        <span>
          <span className="block font-medium text-slate-900 dark:text-slate-100">
            Eerst doorvragen bij een nieuwe chat
          </span>
          <span className="block text-sm text-slate-600 dark:text-slate-300">
            Geldt in deze browser.
          </span>
        </span>
      </label>
    </section>
  );
}
