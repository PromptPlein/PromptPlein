import { FileText, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { PROMPT_CATEGORIES, type PromptCategoryId } from '@/data/promptCategories';

/**
 * Startsjablonen in overheidscontext. Klikken verstuurt niets: de tekst komt in
 * het invoerveld te staan, met de invulplekken tussen [vierkante haken] nog
 * open. De gebruiker vult zijn eigen situatie in en verstuurt zelf.
 *
 * De zes dekken bewust verschillende soorten werk: beleid (samenvatten),
 * communicatie (B1), dienstverlening (burgerbericht), bestuur (raads- en
 * Kamervragen), overleg (verslag) en privacy (DPIA). Elk sjabloon eindigt met
 * een concrete opdracht over vorm en lengte — een klein model levert daar
 * merkbaar bruikbaarder werk op dan bij een losse vraag.
 *
 * De categorie (en daarmee het icoon) komt uit dezelfde lijst als de
 * voorbeeldprompts in de optimizer: hetzelfde soort werk ziet er in de hele app
 * hetzelfde uit.
 */
const STARTERS: {
  category: PromptCategoryId;
  title: string;
  hint: string;
  template: string;
}[] = [
  {
    category: 'samenvatten',
    title: 'Vat een document samen',
    hint: 'Rapport, nota of raadsstuk terug naar de kern',
    template: `Vat het bijgevoegde document voor mij samen.

Waar het over gaat: [onderwerp]
Voor wie is de samenvatting: [bijvoorbeeld mijn teamleider, de wethouder, het projectteam]
Waar ik vooral op let: [bijvoorbeeld besluiten, risico's, kosten, planning]

Geef eerst vijf bullets met de kern en daarna één korte alinea over wat dit voor ons betekent. Gebruik alleen wat er in het document staat.`,
  },
  {
    category: 'begrijpelijk',
    title: 'Herschrijf naar begrijpelijke taal',
    hint: 'Een brief of webtekst op taalniveau B1',
    template: `Herschrijf de tekst hieronder naar begrijpelijk Nederlands op taalniveau B1.

Tekst:
[plak hier je brief of webtekst]

Voor wie is de tekst: [bijvoorbeeld inwoners die een besluit over hun aanvraag krijgen]

Gebruik korte zinnen en actieve taal, vermijd jargon en leg vaktermen uit als ze echt nodig zijn. De juridische strekking moet gelijk blijven. Zet onder de tekst welke woorden je hebt vervangen.`,
  },
  {
    category: 'burgercontact',
    title: 'Reageer op een burgerbericht',
    hint: 'Concept-antwoord op een mail, klacht of melding',
    template: `Help me een reactie te schrijven op het bericht hieronder.

Bericht:
[plak hier de mail, klacht of melding]

Wat er speelt: [korte toelichting op de situatie]
Wat ik met de reactie wil bereiken: [bijvoorbeeld uitleggen waarom het besluit zo is, excuses maken, gegevens opvragen]

Schrijf één versie van maximaal 200 woorden: rustig, begripvol en zakelijk. Beloof niets wat ik niet heb toegezegd en noem geen termijnen die ik niet heb genoemd.`,
  },
  {
    category: 'bestuurlijk',
    title: 'Beantwoord vragen van raad of Kamer',
    hint: 'Feitelijk concept, met de open punten gemarkeerd',
    template: `Maak een concept-antwoord op de vragen hieronder.

Van wie komen de vragen: [bijvoorbeeld een raadslid, de Tweede Kamer, een bestuurder]
Vragen:
[plak hier de vragen]

Wat ik zeker weet: [feiten, cijfers, eerdere besluiten]
Wat ik nog moet uitzoeken: [open punten]

Beantwoord elke vraag apart, kort en feitelijk. Verzin geen cijfers, data of bronnen: zet bij alles wat ontbreekt "nog uitzoeken".`,
  },
  {
    category: 'overleg',
    title: 'Maak een verslag met actiepunten',
    hint: 'Van losse aantekeningen naar besluiten en acties',
    template: `Maak van mijn aantekeningen een kort verslag.

Overleg: [naam van het overleg en de datum]
Aanwezig: [namen of rollen]
Aantekeningen:
[plak hier je aantekeningen]

Geef drie kopjes: besluiten, actiepunten (met wie en wanneer) en open punten. Houd het feitelijk en zet twijfelgevallen onder "nog navragen".`,
  },
  {
    category: 'privacy',
    title: 'Denk mee over privacy en AVG',
    hint: 'Voorbereiding op een DPIA of het delen van gegevens',
    template: `Help me de privacykant van dit plan scherp te krijgen.

Wat we willen gaan doen: [korte beschrijving van het proces, het systeem of de gegevensdeling]
Welke persoonsgegevens: [bijvoorbeeld NAW-gegevens, BSN, inkomen]
Van wie: [bijvoorbeeld aanvragers van bijzondere bijstand]
Doel en grondslag: [als je die al hebt]

Geef: de vragen die ik voor een DPIA moet beantwoorden, de risico's die je ziet en wat ik aan de privacy officer moet voorleggen. Dit is hulp bij het voorbereiden, geen juridisch advies.`,
  },
];

/** Lege staat van een nieuw gesprek: uitleg + klikbare startsjablonen. */
export default function ChatEmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-6 text-center">
      {/* Het merkteken van PromptPlein in plaats van een generiek chat-icoon: dit
          is het eerste wat je ziet in een leeg gesprek. Het teken is getekend
          voor een lichte ondergrond: in donkere modus zetten we het daarom op
          een licht tegeltje (zoals een app-icoon) in plaats van op een doorzichtig
          vlak — anders zakken de donkerblauwe tegels weg in de achtergrond. */}
      <img
        src="/promptplein-mark.png"
        alt=""
        aria-hidden="true"
        className="h-14 w-14 rounded-2xl object-contain dark:bg-slate-100 dark:p-1.5 dark:ring-1 dark:ring-white/20"
      />
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Waarmee kan ik je helpen?
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Stel een vraag of kies een voorbeeld
        </p>
      </div>

      <div className="w-full max-w-2xl">
        {/* Op kleine schermen tonen we drie sjablonen, zodat de chat klein begint
            en pas met het gesprek meegroeit. */}
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTERS.map((starter, i) => {
            const category = PROMPT_CATEGORIES[starter.category];
            return (
            <button
              key={starter.title}
              type="button"
              className={clsx(
                'flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-rijksblauw-300 hover:bg-rijksblauw-50 dark:border-slate-700 dark:hover:border-rijksblauw-500/40 dark:hover:bg-rijksblauw-500/10',
                i >= 3 && 'hidden sm:flex',
              )}
              onClick={() => onPick(starter.template)}
              title={`${category.label}: zet dit sjabloon in het tekstvak`}
            >
              <category.icon size={15} className="mt-0.5 shrink-0 text-rijksblauw-500" />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">
                  {starter.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {starter.hint}
                </span>
              </span>
            </button>
            );
          })}
        </div>
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
