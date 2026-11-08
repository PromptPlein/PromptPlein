import { useAuth } from '@/context/AuthContext';
import { greeting } from '@/lib/greeting';
import { firstName } from '@/services/communityService';

/**
 * Lege staat van een nieuw gesprek: het merkteken en één vraag, met het tekstvak
 * er direct onder. ChatPage zet die twee samen in het midden.
 *
 * Hier stonden eerder zes klikbare startsjablonen. Die trokken de aandacht weg
 * van het invoerveld: gebruikers gingen ze lezen en zagen niet meer waar ze
 * moesten typen. Een leeg gesprek wijst nu maar één ding aan, het tekstvak,
 * net als bij de bekende chatdiensten. Voorbeelden en sjablonen staan op de
 * bouwerspagina, niet in de chat.
 *
 * Ook de uitlegregels zijn hier weg. Waar chats bewaard worden staat in de lijst
 * met chats, wat je met bijlagen kunt staat achter het infobolletje bij het
 * invoerveld.
 */
export default function ChatEmptyState() {
  const { profile } = useAuth();
  // firstName geeft "Anoniem" bij een lege naam: dan liever helemaal geen naam.
  const name = profile?.full_name?.trim() ? firstName(profile.full_name) : null;

  return (
    <nldd-container gap="20" horizontal-alignment="center">
      {/* Het merkteken van PromptPlein in plaats van een generiek chat-icoon: dit
          is het eerste wat je ziet in een leeg gesprek. */}
      <nldd-image src="/promptplein-mark.png" decorative width="64" shape="rounded" object-fit="contain" loading="eager"></nldd-image>
      <nldd-container width="fit-content">
        <nldd-title
          heading-level={2}
          size={3}
          overline={greeting(name, new Date().getHours())}
          text="Waarmee kan ik je helpen?"
        ></nldd-title>
      </nldd-container>
    </nldd-container>
  );
}
