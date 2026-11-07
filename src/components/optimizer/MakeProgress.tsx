import clsx from 'clsx';
import { Check, Loader2 } from '@/components/common/icons';

export type MakeStage = 'lezen' | 'kiezen' | 'invullen';

const VOLGORDE: MakeStage[] = ['lezen', 'kiezen', 'invullen'];

/**
 * Wat de AI aan het doen is tussen "Maak mijn prompt" en de ingevulde velden: lezen,
 * de beste aanpak kiezen en invullen. Bewust zichtbaar: de keuze gebeurt nu zonder
 * tussenstap, en zo blijft duidelijk dat er gekozen wordt en wat het werd.
 */
export default function MakeProgress({
  stage,
  bron = 'Je tekst',
  aanpak,
}: {
  stage: MakeStage;
  /** Wat de AI leest: "Je tekst" of "Het gesprek". */
  bron?: string;
  /** De gekozen aanpak, zodra die er is. */
  aanpak?: string;
}) {
  const huidig = VOLGORDE.indexOf(stage);
  const stappen = [
    huidig > 0 ? `${bron} gelezen` : `${bron} lezen`,
    huidig > 1 && aanpak ? `Beste aanpak gekozen: ${aanpak}` : 'Beste aanpak kiezen',
    'Velden invullen',
  ];

  return (
    <section
      aria-label="De AI is bezig"
      className="animate-fade-in rounded-xl border border-slate-200 bg-white p-5 shadow-[inset_0_4px_0_0_theme(colors.rijksoranje.vast)] dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
        De AI maakt je prompt klaar
      </h2>
      <ol className="mt-3 space-y-2">
        {stappen.map((tekst, i) => {
          const klaar = i < huidig;
          const bezig = i === huidig;
          return (
            <li
              key={i}
              aria-current={bezig ? 'step' : undefined}
              className={clsx(
                'flex items-center gap-2.5',
                bezig
                  ? 'font-bold text-rijksblauw-700 dark:text-rijksblauw-200'
                  : klaar
                    ? 'text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  klaar && 'bg-rijksblauw-500 text-white',
                  bezig && 'text-rijksoranje',
                  !klaar && !bezig && 'border-2 border-slate-300 dark:border-slate-600',
                )}
              >
                {klaar && <Check size={14} />}
                {bezig && <Loader2 size={20} className="animate-spin" />}
              </span>
              {tekst}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
