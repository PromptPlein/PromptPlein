import { useEffect, useState } from 'react';
import { Check, FolderPlus, ImagePlus, Loader2, Pencil, Trash2 } from '@/components/common/icons';

/** Wat de AI in een voorbeeldbeeld zag: wat erop staat en hoe het gemaakt is. */
export interface Voorbeeld {
  naam: string;
  tekst: string;
  /** Het verkleinde beeld, alleen voor nu; het wordt niet bewaard. */
  beeld?: string;
}

const KNOP =
  'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded border border-rijksblauw-500 bg-white px-3 text-sm font-semibold text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-rijksblauw-200 dark:hover:bg-slate-700';

/**
 * Bij de stijlkeuze Van een voorbeeld: een beeld toevoegen, en de beschrijving
 * die de AI ervan maakt (figuren, opbouw, emotie, techniek, kleuren, licht).
 * Die tekst gaat mee bij invullen en schrijven, zodat het nieuwe beeld op het
 * voorbeeld lijkt. Het beeld zelf gaat alleen mee om het te beschrijven.
 *
 * De beschrijving staat er als gewone tekst en niet als invoerveld: het is een
 * analyse. Stond hij open, dan typten mensen er hun eigen wens in in plaats van
 * in het tekstvak eronder. Aanpassen kan wel, na een klik op Aanpassen. Keuze
 * van de eigenaar.
 */
export default function VoorbeeldStijl({
  voorbeeld,
  bezig,
  onKies,
  onTekst,
  onWis,
  onBewaar,
}: {
  voorbeeld: Voorbeeld | null;
  bezig: boolean;
  /** Opent de bestandskeuze; het invoerveld zelf staat bij de ouder. */
  onKies: () => void;
  onTekst: (tekst: string) => void;
  onWis: () => void;
  /** Bewaar de stijl als project, zodat elk volgend beeld hem krijgt. */
  onBewaar?: () => void;
}) {
  // Een nieuw beeld begint weer als analyse om te lezen.
  const [bewerken, setBewerken] = useState(false);
  useEffect(() => {
    setBewerken(false);
  }, [voorbeeld?.beeld]);

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
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> De AI bekijkt je beeld. Dat
          duurt zo'n 20 seconden.
        </p>
      </div>
    );
  }

  if (!voorbeeld) {
    return (
      <div className="mt-2.5">
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
          Voeg een beeld toe dat je mooi vindt. De AI beschrijft wat erop staat en hoe het gemaakt is,
          en je nieuwe beeld gaat daarop lijken.
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
          {bewerken ? (
            <label
              htmlFor="voorbeeld-stijl"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              Wat de AI in je voorbeeld ziet
            </label>
          ) : (
            <p
              id="voorbeeld-stijl-kop"
              className="text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              Wat de AI in je voorbeeld ziet
            </p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Wat je wilt maken, schrijf je in het tekstvak hieronder. Dat gaat voor.
          </p>
        </div>
      </div>
      {bewerken ? (
        <textarea
          id="voorbeeld-stijl"
          rows={9}
          value={voorbeeld.tekst}
          onChange={(e) => onTekst(e.target.value)}
          className="opl-input mt-2 block w-full resize-y text-[0.9375rem]"
        />
      ) : (
        <div
          id="voorbeeld-stijl"
          className="mt-2 max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[0.9375rem] leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
          tabIndex={0}
          role="region"
          aria-labelledby="voorbeeld-stijl-kop"
        >
          {voorbeeld.tekst.split('\n').map((regel, i) => {
            const m = regel.match(/^-\s*([^:]{1,40}):\s*(.*)$/);
            if (m) {
              return (
                <p key={i} className="mt-1.5 first:mt-0">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{m[1]}:</span>{' '}
                  {m[2]}
                </p>
              );
            }
            return regel.trim() ? (
              <p key={i} className="mt-1.5 font-semibold text-slate-800 first:mt-0 dark:text-slate-100">
                {regel}
              </p>
            ) : null;
          })}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBewerken((b) => !b)}
          className={KNOP}
          aria-controls="voorbeeld-stijl"
        >
          {bewerken ? (
            <>
              <Check size={15} aria-hidden="true" /> Klaar met aanpassen
            </>
          ) : (
            <>
              <Pencil size={15} aria-hidden="true" /> Aanpassen
            </>
          )}
        </button>
        {onBewaar && (
          <button
            type="button"
            onClick={onBewaar}
            className={KNOP}
            disabled={!voorbeeld.tekst.trim()}
          >
            <FolderPlus size={15} aria-hidden="true" /> Bewaar als vaste stijl
          </button>
        )}
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
