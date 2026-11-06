import { useAuth } from '@/context/AuthContext';
import { greeting } from '@/lib/greeting';
import { firstName } from '@/services/communityService';

/**
 * Lege staat van een nieuw gesprek: het merkteken en één vraag, met het tekstvak
 * er direct onder. ChatPage zet die twee samen in het midden van de kaart.
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
  const { profile } = useAuth();
  // firstName geeft "Anoniem" bij een lege naam: dan liever helemaal geen naam.
  const name = profile?.full_name?.trim() ? firstName(profile.full_name) : null;

  return (
    <div className="flex w-full flex-col items-center gap-5 px-6 pb-3 pt-8 text-center">
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
        <span className="block">{greeting(name, new Date().getHours())}</span>
        Waarmee kan ik je helpen?
      </h2>
    </div>
  );
}
