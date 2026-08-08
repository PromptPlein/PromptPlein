import { FileText, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

/** Startervragen in overheidscontext; klikken verstuurt de vraag meteen. */
const STARTERS = [
  'Vat de belangrijkste punten van de bijlage samen in vijf bullets.',
  'Leg in B1-taal uit wat de Wet open overheid betekent voor mijn team.',
  'Help me een nette, korte reactie schrijven op een kritische burgermail.',
  'Welke stappen horen bij een DPIA en waar begin ik?',
];

/** Lege staat van een nieuw gesprek: uitleg + klikbare startervragen. */
export default function ChatEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-6 text-center">
      {/* Het merkteken van PromptPlein in plaats van een generiek chat-icoon: dit
          is het eerste wat je ziet in een leeg gesprek. In donkere modus krijgt
          het een zacht vlak, anders vallen de donkerblauwe tegels weg tegen de
          achtergrond. */}
      <img
        src="/promptplein-mark.png"
        alt=""
        aria-hidden="true"
        className="h-14 w-14 rounded-2xl object-contain dark:bg-white/10 dark:p-1.5 dark:ring-1 dark:ring-white/15"
      />
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Waarmee kan ik je helpen?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Stel een vraag of upload een document (PDF, Word of tekst) om het te laten analyseren.
        </p>
      </div>

      {/* Op kleine schermen tonen we twee suggesties, zodat de chat klein begint
          en pas met het gesprek meegroeit. */}
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {STARTERS.map((starter, i) => (
          <button
            key={starter}
            type="button"
            className={clsx(
              'rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-600 transition-colors hover:border-rijksblauw-300 hover:bg-rijksblauw-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rijksblauw-500/40 dark:hover:bg-rijksblauw-500/10',
              i >= 2 && 'hidden sm:block',
            )}
            onClick={() => onPick(starter)}
          >
            {starter}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={12} className="shrink-0" />
          Chats worden alleen op dit apparaat bewaard en verdwijnen bij uitloggen.
        </span>
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <FileText size={12} className="shrink-0" />
          Bijlagen blijven de hele chat beschikbaar als bronmateriaal.
        </span>
      </div>
    </div>
  );
}
