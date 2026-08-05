import { useEffect, useRef } from 'react';
import { Check, Loader2, PenLine, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import ModelRace from './ModelRace';

interface OptimizingLoaderProps {
  /** Naam van de gekozen techniek/raamwerk, voor een persoonlijke melding. */
  techniqueName?: string;
  /**
   * De tekst die de AI tot nu toe heeft geschreven. Zodra hier iets in staat,
   * vervangt de meelezende tekst het skelet: de gebruiker ziet de prompt
   * ontstaan in plaats van te wachten op het complete antwoord.
   */
  streamText?: string;
  /** Provider-ids die tegelijk aan de prompt begonnen zijn (de race). */
  models?: string[];
  /** De provider die de race won en de prompt schrijft. */
  winner?: string | null;
  /** 'drafting' = beide modellen zijn begonnen, 'writing' = de winnaar schrijft. */
  phase?: string;
}

/** Ruwe woordentelling voor de voortgangsregel; exact hoeft dit niet te zijn. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Mooi laadscherm tijdens het genereren/optimaliseren van de uiteindelijke
 * prompt. Spiegelt de stijl van het voor-invul-laadscherm (geanimeerde
 * accentbalk + pulserend icoon), met de meegelezen tekst zodra die begint te
 * lopen. Gedeeld door de techniek-flow en de eigen-prompt-flow.
 *
 * Twee modellen beginnen tegelijk aan de prompt; {@link ModelRace} maakt dat
 * zichtbaar, inclusief wie er wint. Daarnaast telt de voortgangsregel de
 * geschreven woorden mee, zodat ook bij een lange prompt duidelijk blijft dat
 * er beweging in zit.
 */
export default function OptimizingLoader({
  techniqueName,
  streamText,
  models = [],
  winner,
  phase,
}: OptimizingLoaderProps) {
  const streaming = Boolean(streamText?.trim());
  const streamRef = useRef<HTMLDivElement>(null);
  const words = countWords(streamText ?? '');

  // Meeschuiven met de tekst die binnenkomt, zodat de laatst geschreven regel in
  // beeld blijft zonder dat de pagina zelf verspringt.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  return (
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800">
      {/* Geanimeerde accentbalk bovenaan */}
      <div className="h-1 w-full overflow-hidden bg-rijksblauw-100 dark:bg-rijksblauw-500/20">
        <div className="h-full w-1/3 animate-loading-bar bg-gradient-to-r from-rijksblauw-400 via-rijksoranje to-rijksblauw-600" />
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rijksblauw-400/30" />
            <Sparkles size={18} className="relative" />
          </span>
          <div>
            <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              We bouwen je prompt
              <Loader2 size={15} className="animate-spin text-rijksblauw-500" />
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {streaming ? (
                <>Je prompt wordt nu geschreven — je leest live mee</>
              ) : phase === 'drafting' && models.length > 1 ? (
                <>Twee modellen beginnen tegelijk aan je prompt; de snelste schrijft hem uit…</>
              ) : (
                <>
                  We verwerken je antwoorden tot een rijke, direct bruikbare prompt
                  {techniqueName ? (
                    <>
                      {' '}volgens{' '}
                      <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                        {techniqueName}
                      </span>
                    </>
                  ) : null}
                  …
                </>
              )}
            </p>
          </div>
        </div>

        {models.length > 0 && (
          <ModelRace models={models} winner={winner} verb="schrijft je prompt" className="mt-4" />
        )}

        {/* Voortgangsregel: bij een lange prompt is de woordenteller het bewijs
            dat er nog steeds tekst bij komt. */}
        <p
          className={clsx(
            'mt-4 flex items-center gap-1.5 text-xs font-medium',
            streaming
              ? 'text-slate-500 dark:text-slate-400'
              : 'text-slate-400 dark:text-slate-500',
          )}
          aria-live="polite"
        >
          {streaming ? (
            <>
              <PenLine size={12} className="text-rijksoranje" />
              {words} {words === 1 ? 'woord' : 'woorden'} geschreven
            </>
          ) : (
            <>
              <Check size={12} className="text-emerald-500" />
              Je antwoorden zijn verstuurd
            </>
          )}
        </p>

        {streaming ? (
          /* Meelezen: de tekst zoals de AI hem op dit moment schrijft. */
          <div
            ref={streamRef}
            aria-live="polite"
            aria-busy="true"
            className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-900/50 dark:text-slate-200"
          >
            {streamText}
            {/* Knipperende cursor op de plek waar de tekst verder groeit. */}
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-rijksblauw-500 align-text-bottom" />
          </div>
        ) : (
          /* Skelet dat een opgebouwde prompt-tekst suggereert. */
          <div className="mt-2 space-y-2.5">
            <div className="skeleton h-3.5 w-1/4 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-11/12 rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
            <div className="mt-4 skeleton h-3.5 w-1/3 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-3/4 rounded" />
          </div>
        )}
      </div>
    </div>
  );
}
