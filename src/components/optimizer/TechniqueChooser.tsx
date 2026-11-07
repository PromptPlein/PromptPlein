import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowRight, Check } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import { TECHNIEK_DOELEN, techniekKaart, type TechniekDoel } from '@/lib/techniekDoelen';
import type { Technique } from '@/types';

/**
 * Kiezen op doel: eerst wat je wilt bereiken, dan de frameworks en technieken die
 * daarbij passen. De doelen zijn tabbladen: de gekozen tegel loopt zonder lijn over
 * in het vlak eronder. Dat kan alleen als ze op één rij staan, dus pas vanaf lg.
 * Oranje staat alleen op de streep bovenaan en op kleine iconen: als tekst op wit
 * haalt het de contrasteis niet.
 */
export default function TechniqueChooser({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { techniques } = useReferenceData();

  const perDoel = useMemo(() => {
    const groepen = new Map<TechniekDoel, Technique[]>();
    for (const t of techniques) {
      const { doel } = techniekKaart(t);
      groepen.set(doel, [...(groepen.get(doel) ?? []), t]);
    }
    // Frameworks eerst: die zetten de hele prompt neer, de technieken sturen bij.
    for (const lijst of groepen.values()) {
      lijst.sort((a, b) => Number(isContextPrompt(b)) - Number(isContextPrompt(a)));
    }
    return groepen;
  }, [techniques]);

  // Een doel zonder techniek (kan in de lokale modus) krijgt geen tegel.
  const doelen = TECHNIEK_DOELEN.filter((d) => perDoel.has(d.id));

  const gekozen = techniques.find((t) => t.id === selectedId);
  const [keuze, setKeuze] = useState<TechniekDoel | null>(
    gekozen ? techniekKaart(gekozen).doel : null,
  );
  const actief = doelen.find((d) => d.id === keuze) ?? doelen[0];
  if (!actief) return null;

  const lijst = perDoel.get(actief.id) ?? [];

  return (
    <div>
      <div
        role="group"
        aria-label="Kies je doel"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {doelen.map((d) => {
          const aan = d.id === actief.id;
          const Icon = d.icon;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={aan}
              onClick={() => setKeuze(d.id)}
              className={clsx(
                'relative mb-3 flex min-h-[9.25rem] flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/50',
                aan
                  ? // z-10 en -mb-px: de tegel legt zich over de bovenrand van het
                    // vlak heen, zodat er geen lijn tussen beide loopt.
                    'z-10 border-slate-200 bg-white shadow-[inset_0_4px_0_0_theme(colors.rijksoranje.vast)] lg:-mb-px lg:rounded-b-none lg:border-b-white dark:border-slate-700 dark:bg-slate-800 lg:dark:border-b-slate-800'
                  : 'border-slate-200 bg-[#e6edf3] hover:border-rijksblauw-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-rijksblauw-200',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-full',
                  aan
                    ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200'
                    : 'bg-white text-rijksblauw-700 dark:bg-slate-800 dark:text-rijksblauw-200',
                )}
              >
                <Icon size={26} />
              </span>
              <span className="text-lg font-bold leading-tight text-rijksblauw-700 dark:text-rijksblauw-200">
                {d.naam}
              </span>
              <span className="text-sm leading-snug text-slate-600 dark:text-slate-300">{d.zin}</span>
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby="techniek-keuzes"
        className="rounded-xl border border-slate-200 bg-white p-4 lg:rounded-t-none dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <h2
            id="techniek-keuzes"
            className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            {actief.naam}: {lijst.length} {lijst.length === 1 ? 'keuze' : 'keuzes'}
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full bg-rijksblauw-700 dark:bg-rijksblauw-200"
              />
              Framework: bouwt je hele prompt op
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full bg-rijksblauw-50 ring-1 ring-inset ring-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:ring-rijksblauw-200"
              />
              Techniek: stuurt hoe de AI werkt
            </span>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {lijst.map((t) => (
            <TechniqueRow
              key={t.id}
              technique={t}
              active={t.id === selectedId}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TechniqueRow({
  technique: t,
  active,
  onSelect,
}: {
  technique: Technique;
  active: boolean;
  onSelect: () => void;
}) {
  const kaart = techniekKaart(t);
  const framework = isContextPrompt(t);
  const Icon = kaart.icon;

  // Het infobolletje staat naast de knop en niet erin: een knop in een knop is
  // ongeldige HTML en een schermlezer slaat hem dan over.
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={clsx(
          'group/rij flex h-full min-h-[5.25rem] w-full items-center gap-3 rounded-xl border bg-slate-50 py-3 pl-3.5 pr-20 text-left transition-all',
          'hover:border-rijksblauw-700 hover:bg-white hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/50',
          'dark:bg-slate-900/40 dark:hover:border-rijksblauw-200 dark:hover:bg-slate-900',
          active
            ? 'border-rijksblauw-700 ring-1 ring-rijksblauw-700 dark:border-rijksblauw-200 dark:ring-rijksblauw-200'
            : 'border-slate-200 dark:border-slate-700',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            framework
              ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-200 dark:text-slate-900'
              : 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200',
          )}
        >
          <Icon size={22} />
        </span>
        <span className="min-w-0">
          <span className="block font-bold leading-tight text-rijksblauw-700 dark:text-rijksblauw-200">
            {t.name}
          </span>
          {kaart.kort && (
            <span className="line-clamp-2 text-[0.9375rem] leading-snug text-slate-600 dark:text-slate-300">
              {kaart.kort}
            </span>
          )}
          <span className="block text-[0.8125rem] font-medium text-slate-500 dark:text-slate-400">
            {framework ? 'Framework' : 'Techniek'}
          </span>
        </span>
        <span className="absolute bottom-3 right-3.5 inline-flex items-center gap-1 text-[0.9375rem] font-semibold text-rijksblauw-500 dark:text-rijksblauw-200">
          {active ? (
            <>
              Gekozen <Check size={16} className="text-rijksoranje" />
            </>
          ) : (
            <>
              Kies
              <ArrowRight
                size={16}
                className="transition-transform group-hover/rij:translate-x-0.5 group-hover/rij:text-rijksoranje"
              />
            </>
          )}
        </span>
      </button>
      {kaart.info && (
        <InfoDot label={`Uitleg over ${t.name}`} text={kaart.info} className="absolute right-1 top-1" />
      )}
    </li>
  );
}
