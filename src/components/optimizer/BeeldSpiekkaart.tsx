import {
  Ban,
  ImagePlus,
  Frame,
  MapPin,
  Palette,
  RectangleHorizontal,
  Sun,
  Target,
  Type,
  User,
  type LucideIcon,
} from '@/components/common/icons';

/**
 * De bouwstenen van een goede beeldprompt, in de volgorde die de promptgids van
 * OpenAI aanraadt: eerst waar het beeld voor is, dan scène en onderwerp, dan de
 * details en als laatste de beperkingen. Dezelfde onderdelen zijn de velden van
 * de beeldprompt (migratie 0062), dus wat je hier bedenkt, kun je straks kwijt.
 */
const BOUWSTENEN: { naam: string; vraag: string; icon: LucideIcon }[] = [
  { naam: 'Doel', vraag: 'Waar komt het beeld te staan?', icon: Target },
  { naam: 'Onderwerp', vraag: 'Wie of wat staat centraal?', icon: User },
  { naam: 'Omgeving', vraag: 'Waar speelt het zich af?', icon: MapPin },
  { naam: 'Stijl', vraag: 'Foto, illustratie of 3D? Welke kleuren?', icon: Palette },
  { naam: 'Kader', vraag: 'Dichtbij of wijd? Waar blijft ruimte vrij?', icon: Frame },
  { naam: 'Licht en sfeer', vraag: 'Zacht, fel, avond? Welk gevoel?', icon: Sun },
  { naam: 'Tekst in beeld', vraag: 'Welke woorden precies, of geen?', icon: Type },
  { naam: 'Niet in beeld', vraag: 'Wat mag er nooit in staan?', icon: Ban },
  { naam: 'Formaat', vraag: 'Vierkant, liggend of staand?', icon: RectangleHorizontal },
];

/**
 * Spiekkaart bij Afbeelding: wie een beeld wil, denkt aan het onderwerp en
 * vergeet de rest. De kaart staat er vóór het typen, zodat de wens meteen meer
 * zegt; wat de gebruiker openlaat, stelt de AI daarna per veld voor.
 */
export default function BeeldSpiekkaart({ onVoorbeeld }: { onVoorbeeld?: () => void }) {
  return (
    <section
      aria-labelledby="beeld-spiekkaart-titel"
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
    >
      <h3
        id="beeld-spiekkaart-titel"
        className="text-[0.9375rem] font-semibold text-slate-900 dark:text-slate-100"
      >
        Waar denk je aan?
      </h3>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        Hoe meer je hiervan noemt, hoe dichter het beeld bij wat je voor ogen hebt. Wat je openlaat,
        vult de AI in als voorstel.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BOUWSTENEN.map(({ naam, vraag, icon: Icon }) => (
          <li
            key={naam}
            className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/40"
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-rijksblauw-500 dark:text-rijksblauw-200"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                {naam}
              </span>
              <span className="block text-sm text-slate-600 dark:text-slate-300">{vraag}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Heb je een beeld dat je mooi vindt? Voeg het toe, dan gaat je nieuwe beeld erop lijken.
        </p>
        {onVoorbeeld && (
          <button
            type="button"
            onClick={onVoorbeeld}
            className="opl-raak inline-flex items-center gap-1.5 text-sm font-semibold text-rijksblauw-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200"
          >
            <ImagePlus size={15} aria-hidden="true" /> Voorbeeld toevoegen
          </button>
        )}
      </div>
    </section>
  );
}
