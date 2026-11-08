import { useEffect, useRef, useState } from 'react';
import ModelStatus from './ModelStatus';
import PhaseSteps from './PhaseSteps';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/box';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/progress-bar';
import '@nldd/design-system/text';

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
  /**
   * 'searching' = er wordt eerst op internet gezocht,
   * 'drafting' = het model leest mee, 'thinking' = het redeneert eerst (de
   * denkstand staat aan), 'writing' = de tekst loopt, 'reviewing' = de tweede
   * ronde waarin het model zijn eerste versie controleert (bij denken of zoeken).
   */
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
  const streamRef = useRef<HTMLElement & { view?: { scrollDOM?: HTMLElement } }>(null);
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
  // nldd-code-viewer 0.18.0 has no "follow the end" option; its scroller is the
  // CodeMirror view it exposes as `view.scrollDOM`.
  useEffect(() => {
    const scroller = streamRef.current?.view?.scrollDOM;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [streamText]);

  return (
    <nldd-box>
      <nldd-container padding="20" sm-padding="16" gap="16">
        {/* Onbepaalde voortgangsbalk bovenaan */}
        <nldd-progress-bar
          size="sm"
          value-display="none"
          indeterminate
          accessible-label="Prompt bouwen"
        ></nldd-progress-bar>
        <nldd-container layout="row" gap="12" vertical-alignment="center">
          <nldd-icon icon="sparkles" size="40" color="accent" box></nldd-icon>
          <nldd-container gap="2">
            <nldd-container layout="row" gap="8" vertical-alignment="center">
              <nldd-text weight="bold">We bouwen je prompt</nldd-text>
              <nldd-activity-indicator size="16" timing="instant"></nldd-activity-indicator>
            </nldd-container>
            <nldd-text size="sm" color="secondary">
              {phase === 'reviewing' ? (
                <>Tweede ronde: het model controleert zijn eerste versie en verbetert die…</>
              ) : streaming ? (
                <>Je prompt wordt nu geschreven</>
              ) : phase === 'searching' ? (
                <>We zoeken eerst op internet naar actuele informatie over je opdracht…</>
              ) : phase === 'writing' ? (
                <>Het model begint te schrijven…</>
              ) : phase === 'thinking' ? (
                <>Het model denkt eerst na over je opdracht, dat duurt even…</>
              ) : (
                <>
                  We verwerken je antwoorden tot een rijke, direct bruikbare prompt
                  {techniqueName ? (
                    <>
                      {' '}volgens <strong>{techniqueName}</strong>
                    </>
                  ) : null}
                  …
                </>
              )}
            </nldd-text>
          </nldd-container>
        </nldd-container>

        {/* Stappenspoor: maakt de denkfase (nog geen tekst) zichtbaar als werk,
            in plaats van als stilstand. */}
        <PhaseSteps steps={BUILD_STEPS} activeIndex={streaming ? 2 : 1} />

        {models.length > 0 && <ModelStatus models={models} winner={winner} verb="schrijft je prompt" />}

        <nldd-container gap="8">
          {/* Voortgangsregel: tijdens het schrijven telt hij de woorden mee, tijdens
              het nadenken de seconden: er is altijd iets dat beweegt. */}
          <nldd-container layout="row" gap="6" vertical-alignment="center" aria-live="polite">
            <nldd-icon icon={streaming ? 'pencil' : 'timer'} size="16" color={streaming ? 'oranje' : 'accent'}></nldd-icon>
            <nldd-text size="xs" weight="medium" color="secondary">
              {streaming
                ? `${words} ${words === 1 ? 'woord' : 'woorden'} geschreven · ${elapsed}s`
                : `${elapsed}s bezig · ${
                    phase === 'searching'
                      ? 'bronnen op internet opzoeken'
                      : phase === 'reviewing'
                        ? 'het model leest zijn eerste versie na'
                        : 'het model leest je antwoorden en bepaalt de opbouw'
                  }`}
            </nldd-text>
          </nldd-container>

          {streaming ? (
            /* Meelezen: de tekst zoals de AI hem op dit moment schrijft. */
            <nldd-code-viewer ref={streamRef} wrap no-copy max-height="18rem" aria-busy="true">
              {streamText}
            </nldd-code-viewer>
          ) : (
            <nldd-container min-height="10rem">
              <nldd-activity-indicator timing="instant" text="De prompt wordt opgebouwd" show-text></nldd-activity-indicator>
            </nldd-container>
          )}
        </nldd-container>
      </nldd-container>
    </nldd-box>
  );
}
