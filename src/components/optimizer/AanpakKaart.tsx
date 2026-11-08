import { useState } from 'react';
import { Sparkles } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import type { Technique } from '@/types';
import { techniekKaart } from '@/lib/techniekDoelen';

export interface AanpakOptie {
  id: string;
  naam: string;
  waarom: string;
}

/**
 * Welke aanpak de AI heeft gekozen en waarom. Op Prompt maken kiest niemand meer
 * zelf een framework, maar de naam blijft zichtbaar: zo zie je waar de velden
 * vandaan komen. "Andere aanpak" toont de alternatieven die de AI al had, voor als
 * de keuze er naast zit. Wisselen vult de velden opnieuw in.
 */
export default function AanpakKaart({
  technique,
  titel = 'De AI heeft je prompt alvast ingevuld',
  reden,
  opties = [],
  onKies,
  disabled,
}: {
  technique: Technique;
  titel?: string;
  /** Waarom deze aanpak past; leeg als hij uit de soortkeuze volgt. */
  reden?: string;
  opties?: AanpakOptie[];
  onKies?: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kaart = techniekKaart(technique);

  return (
    <section
      aria-label="Gekozen aanpak"
      className="animate-fade-in rounded-xl border border-slate-200 bg-white px-4 pb-3 pt-4 shadow-[inset_0_4px_0_0_theme(colors.nadruk.DEFAULT)] dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200"
        >
          <Sparkles size={24} />
        </span>
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-lg font-bold leading-tight text-rijksblauw-700 dark:text-rijksblauw-200">
            {titel}
          </p>
          <p className="flex flex-wrap items-center gap-x-1 text-[0.9375rem] text-slate-600 dark:text-slate-300">
            <span>
              Aanpak: <span className="font-semibold">{technique.name}</span>
              {reden ? `. ${reden}` : ''}
            </span>
            {kaart.info && <InfoDot label={`Uitleg over ${technique.name}`} text={kaart.info} />}
          </p>
        </div>
        {opties.length > 0 && onKies && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="min-h-11 shrink-0 font-semibold text-rijksblauw-500 transition-colors hover:underline dark:text-rijksblauw-200"
          >
            Andere aanpak
          </button>
        )}
      </div>

      {open && onKies && (
        <div className="animate-fade-in mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            Kies je een andere aanpak, dan vult de AI de velden opnieuw in.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-2">
            {opties.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onKies(o.id);
                }}
                className="flex min-h-16 flex-col rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-rijksblauw-700 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-rijksblauw-200 dark:hover:bg-slate-900"
              >
                <span className="font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{o.naam}</span>
                {o.waarom && (
                  <span className="text-[0.9375rem] leading-snug text-slate-600 dark:text-slate-300">
                    {o.waarom}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
