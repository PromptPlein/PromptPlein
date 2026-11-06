import {
  Blocks,
  Bot,
  CodeXml,
  FileText,
  LayoutDashboard,
  Route,
  type LucideIcon,
} from '@/components/common/icons';
import type { PromptKind } from '@/lib/techniques';

/**
 * De keuzes van "Wat wil je maken?": de soorttegels in de bouwer en de knoppen
 * onder het invoerveld op de startpagina. De volgorde komt uit PROMPT_KINDS. `placeholderOff` hoort bij de schakelaar uit (bestaande
 * code), want daar beschrijf je een verschil en geen nieuw hulpmiddel.
 */
export const KIND_OPTIONS: Record<
  PromptKind,
  { label: string; icon: LucideIcon; hint: string; placeholder: string; placeholderOff?: string }
> = {
  text: {
    label: 'Tekst',
    icon: FileText,
    hint: 'Een brief, nota, verslag of samenvatting.',
    placeholder:
      'Bijv. zet mijn ruwe vergaderaantekeningen om in een verslag met besluiten, actiepunten en open vragen.',
  },
  code: {
    label: 'Code',
    icon: CodeXml,
    hint: 'Vibecoden: een tool, script of pagina laten bouwen, of bestaande code laten aanpassen.',
    placeholder:
      'Bijv. een webpagina die een Excel-export uit het zaaksysteem inleest en per afdeling de open zaken telt.',
    placeholderOff:
      'Bijv. de export in ons rapportagescherm negeert het actieve filter; alleen de gefilterde rijen moeten mee.',
  },
  dashboard: {
    label: 'Dashboard',
    icon: LayoutDashboard,
    hint: 'Cijfers, grafieken en filters op één scherm.',
    placeholder:
      'Bijv. een overzicht van de doorlooptijden van Woo-verzoeken per directie, met een filter op kwartaal.',
  },
  agent: {
    label: 'Agent',
    icon: Bot,
    hint: 'Een AI die zelfstandig een taak in stappen uitvoert.',
    placeholder:
      'Bijv. een agent die binnenkomende Woo-verzoeken leest, per onderwerp sorteert en een ontvangstbevestiging klaarzet.',
  },
  skill: {
    label: 'Skill',
    icon: Blocks,
    hint: 'Een vaste werkwijze die een AI-assistent elke keer opnieuw toepast. Je bouwt hem verder in de Skill Creator.',
    placeholder:
      'Bijv. geef feedback op conceptbrieven aan burgers, elke keer volgens de schrijfwijzer van ons ministerie.',
  },
  template: {
    label: 'Routekaart',
    icon: Route,
    hint: 'Een geanimeerde routekaart in rijksstijl: waar je vandaan komt, waar je nu staat en waar je naartoe wilt. Jij geeft de inhoud; de vormgeving is elke keer hetzelfde.',
    placeholder:
      'Bijv. een routekaart van ons opleidingstraject: vijf bijeenkomsten vanaf 3 maart, met per bijeenkomst het thema, het huiswerk en wat het oplevert. We staan nu bij de tweede.',
  },
};
