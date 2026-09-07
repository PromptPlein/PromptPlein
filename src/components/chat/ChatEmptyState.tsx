import { ArrowDown, FileText, ShieldCheck } from 'lucide-react';

/**
 * Lege staat van een nieuw gesprek: het merkteken, één vraag en een pijl naar
 * het tekstvak eronder.
 *
 * Hier stonden eerder zes klikbare startsjablonen. Die trokken de aandacht weg
 * van het invoerveld: gebruikers gingen ze lezen en zagen niet meer waar ze
 * moesten typen. Een leeg gesprek wijst nu maar één ding aan, het tekstvak,
 * net als bij de bekende chatdiensten. Voorbeelden en sjablonen staan op de
 * bouwerspagina, niet in de chat.
 */
export default function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-8 text-center">
      {/* Het merkteken van PromptPlein in plaats van een generiek chat-icoon: dit
          is het eerste wat je ziet in een leeg gesprek. Het teken is getekend
          voor een lichte ondergrond: in donkere modus zetten we het daarom op
          een licht tegeltje (zoals een app-icoon) in plaats van op een doorzichtig
          vlak, anders zakken de donkerblauwe tegels weg in de achtergrond. */}
      <img
        src="/promptplein-mark.png"
        alt=""
        aria-hidden="true"
        className="h-16 w-16 rounded-2xl object-contain dark:bg-slate-100 dark:p-1.5 dark:ring-1 dark:ring-white/20"
      />
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Waarmee kan ik je helpen?
        </h2>
        {/* De pijl wijst naar het invoerveld direct hieronder. */}
        <p className="mx-auto mt-2 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Typ je vraag in het vak hieronder
          <ArrowDown size={14} className="shrink-0 text-rijksblauw-500" aria-hidden="true" />
        </p>
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
