import { ImagePlus, Loader2, Trash2 } from '@/components/common/icons';

/** De stijl die uit een voorbeeldbeeld is gelezen. */
export interface Voorbeeld {
  naam: string;
  tekst: string;
  /** Het verkleinde beeld, alleen voor nu; het wordt niet bewaard. */
  beeld?: string;
}

const KNOP =
  'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded border border-rijksblauw-500 bg-white px-3 text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-rijksblauw-200 dark:hover:bg-slate-700';

/**
 * Bij de stijlkeuze Van een voorbeeld: een beeld toevoegen, en de stijl die de
 * AI eruit leest. Die tekst is te bewerken en gaat als vaste beeldstijl mee,
 * net als de instructie van een project. Het beeld zelf gaat alleen mee om de
 * stijl te lezen.
 */
export default function VoorbeeldStijl({
  voorbeeld,
  bezig,
  onKies,
  onTekst,
  onWis,
}: {
  voorbeeld: Voorbeeld | null;
  bezig: boolean;
  /** Opent de bestandskeuze; het invoerveld zelf staat bij de ouder. */
  onKies: () => void;
  onTekst: (tekst: string) => void;
  onWis: () => void;
}) {
  const privacy = (
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
      Het beeld wordt alleen gelezen en nergens bewaard. Voeg geen beeld toe met herkenbare mensen
      of vertrouwelijke gegevens.
    </p>
  );

  if (bezig) {
    return (
      <div className="mt-2.5 flex items-center gap-3">
        {voorbeeld?.beeld && (
          <img src={voorbeeld.beeld} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
        )}
        <p role="status" className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> De stijl van je beeld wordt
          gelezen
        </p>
      </div>
    );
  }

  if (!voorbeeld) {
    return (
      <div className="mt-2.5">
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
          Voeg een beeld toe waarvan je de stijl mooi vindt. De AI neemt de stijl over, niet het
          onderwerp.
        </p>
        <button type="button" onClick={onKies} className={KNOP}>
          <ImagePlus size={15} aria-hidden="true" /> Beeld toevoegen
        </button>
        {privacy}
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-start gap-3">
        {voorbeeld.beeld && (
          <img
            src={voorbeeld.beeld}
            alt="Je voorbeeldbeeld"
            className="h-20 w-20 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <label
            htmlFor="voorbeeld-stijl"
            className="block text-sm font-semibold text-slate-800 dark:text-slate-100"
          >
            De stijl van je voorbeeld
          </label>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pas aan wat niet klopt. Wil je deze stijl vaker gebruiken, zet hem dan in de instructie
            van een project.
          </p>
        </div>
      </div>
      <textarea
        id="voorbeeld-stijl"
        rows={7}
        value={voorbeeld.tekst}
        onChange={(e) => onTekst(e.target.value)}
        className="opl-input mt-2 block w-full resize-y text-[0.9375rem]"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onKies} className={KNOP}>
          <ImagePlus size={15} aria-hidden="true" /> Ander beeld
        </button>
        <button
          type="button"
          onClick={onWis}
          className="inline-flex min-h-10 items-center gap-1.5 rounded px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Trash2 size={15} aria-hidden="true" /> Verwijderen
        </button>
      </div>
      {privacy}
    </div>
  );
}
