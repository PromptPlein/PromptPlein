import { ArrowDown } from '@/components/common/icons';

/**
 * Lege staat van een nieuw gesprek: het merkteken, één vraag en een pijl naar
 * het tekstvak eronder.
 *
 * Hier stonden eerder zes klikbare startsjablonen. Die trokken de aandacht weg
 * van het invoerveld: gebruikers gingen ze lezen en zagen niet meer waar ze
 * moesten typen. Een leeg gesprek wijst nu maar één ding aan, het tekstvak,
 * net als bij de bekende chatdiensten. Voorbeelden en sjablonen staan op de
 * bouwerspagina, niet in de chat.
 *
 * Ook de uitlegregels zijn hier weg. Waar chats bewaard worden staat onder de
 * kaart, wat je met bijlagen kunt staat achter het infobolletje bij het
 * invoerveld.
 */
export default function ChatEmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 py-8 text-center">
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
      <h2 className="text-2xl font-bold text-rijksblauw-700 dark:text-slate-100">
        Waarmee kan ik je helpen?
      </h2>
      {/* De pijl wijst naar het invoerveld direct hieronder; het veld zegt zelf
          al wat je er doet. */}
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200"
      >
        <ArrowDown size={20} />
      </span>
    </div>
  );
}
