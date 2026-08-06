import { useEffect, useRef, useState } from 'react';
import { Loader2, PenLine, Sparkles, Timer } from 'lucide-react';
import clsx from 'clsx';
import ModelStatus from './ModelStatus';
import PhaseSteps from './PhaseSteps';

interface OptimizingLoaderProps {
  /** Naam van de gekozen techniek/raamwerk, voor een persoonlijke melding. */
  techniqueName?: string;
  /**
   * De tekst die de AI tot nu toe heeft geschreven. Zodra hier iets in staat,
   * vervangt de meelezende tekst het skelet: de gebruiker ziet de prompt
   * ontstaan in plaats van te wachten op het complete antwoord.
   */
  streamText?: string;
  /** Providers die zijn geprobeerd, in volgorde; de laatste is aan het werk. */
  models?: string[];
  /** De provider die de prompt daadwerkelijk schrijft. */
  winner?: string | null;
  /** 'drafting' = het model leest mee, 'writing' = de tekst loopt. */
  phase?: string;
}

/** Ruwe woordentelling voor de voortgangsregel; exact hoeft dit niet te zijn. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * De stappen van het bouwen. De eerste is meteen af (de aanvraag is de deur uit),
 * de tweede loopt tot het eerste tekstfragment binnen is — dat is de fase waarin
 * het model nadenkt en er nog niets te lezen valt — en de derde loopt zolang de
 * prompt wordt uitgeschreven.
 */
const BUILD_STEPS = ['Antwoorden verstuurd', 'Model denkt na', 'Prompt schrijven'];

/**
 * Mooi laadscherm tijdens het genereren/optimaliseren van de uiteindelijke
 * prompt. Spiegelt de stijl van het voor-invul-laadscherm (geanimeerde
 * accentbalk + pulserend icoon), met de meegelezen tekst zodra die begint te
 * lopen. Gedeeld door de techniek-flow en de eigen-prompt-flow.
 *
 * {@link ModelStatus} laat zien welk model eraan werkt (en of er is teruggevallen
 * op een ander na een storing). Daarnaast telt de voortgangsregel de geschreven
 * woorden mee, zodat ook bij een lange prompt duidelijk blijft dat er beweging
 * in zit.
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

  // Verstreken tijd sinds het laadscherm verscheen. Tijdens de denkfase komt er
  // nog geen tekst binnen; een lopende teller is dan het enige eerlijke bewijs
  // dat er iets gebeurt in plaats van dat het scherm hangt.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

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
              ) : phase === 'writing' ? (
                <>Het model begint te schrijven…</>
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

        {/* Stappenspoor: maakt de denkfase (nog geen tekst) zichtbaar als werk,
            in plaats van als stilstand. */}
        <PhaseSteps steps={BUILD_STEPS} activeIndex={streaming ? 2 : 1} className="mt-4" />

        {models.length > 0 && (
          <ModelStatus models={models} winner={winner} verb="schrijft je prompt" className="mt-4" />
        )}

        {/* Voortgangsregel: tijdens het schrijven telt hij de woorden mee, tijdens
            het nadenken de seconden — er is altijd iets dat beweegt. */}
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
              {words} {words === 1 ? 'woord' : 'woorden'} geschreven · {elapsed}s
            </>
          ) : (
            <>
              <Timer size={12} className="text-rijksblauw-500" />
              {elapsed}s bezig — het model leest je antwoorden en bepaalt de opbouw
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
