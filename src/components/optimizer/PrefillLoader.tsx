import { useEffect, useState } from 'react';
import ModelStatus from './ModelStatus';
import PhaseSteps from './PhaseSteps';
import type { PrefillPhase } from '@/services/optimizeService';
import type { PrefilledField } from '@/types';

interface PrefillLoaderProps {
  /** Alleen de velden: de kop en de stappen staan al in MakeProgress. */
  plain?: boolean;
  /** Naam van het raamwerk waarvan de velden worden ingevuld. */
  techniqueName?: string;
  /** Waar de inhoud vandaan komt, bijv. "je prompt" of "het gesprek". */
  source?: string;
  /** De velden van het raamwerk, in volgorde; leeg = generieke skeletten. */
  fields?: { id: string; label: string }[];
  /** Velden die al binnen zijn (komen één voor één uit de stream). */
  filled?: PrefilledField[];
  /** Providers die zijn geprobeerd, in volgorde; de laatste is aan het werk. */
  models?: string[];
  /** De provider die de velden daadwerkelijk levert. */
  winner?: string | null;
  /** Waar het invullen op dit moment mee bezig is. */
  phase?: PrefillPhase;
  /** Denken staat aan: een eigen stap, en de melding dat het langer duurt. */
  thinking?: boolean;
  /** Zoeken staat aan: eerst een stap "Internet raadplegen". */
  webSearch?: boolean;
  /** De gevonden bronnen, zodra het zoeken klaar is. */
  sources?: { title: string; url: string }[];
  /** De zoekvragen waarmee is gezocht. */
  queries?: string[];
}

/**
 * De stappen die de gebruiker in het laadscherm ziet aflopen. Zoeken en denken
 * krijgen een eigen stap als ze aanstaan, zodat zichtbaar is dat ze echt
 * gebeuren en waar de extra tijd heen gaat.
 */
function stepsFor(webSearch: boolean, thinking: boolean): { phase: PrefillPhase; label: string }[] {
  return [
    ...(webSearch ? [{ phase: 'searching' as const, label: 'Internet raadplegen' }] : []),
    { phase: 'reading', label: 'Tekst lezen' },
    ...(thinking ? [{ phase: 'thinking' as const, label: 'Nadenken' }] : []),
    { phase: 'matching', label: 'Inhoud koppelen' },
    { phase: 'filling', label: 'Velden schrijven' },
  ];
}

/**
 * Laadscherm terwijl de AI de velden van een raamwerk voor-invult. Gedeeld door
 * de eigen-prompt-flow, de doel-dialoog en de plan-bouwer.
 *
 * Het toont niet alleen dát er iets gebeurt, maar wát: welk model eraan werkt,
 * welke stap loopt, en — het duidelijkst — de velden die één
 * voor één vollopen. De server stuurt elk veld door zodra het af is, dus het
 * skelet van een veld wordt vervangen door de echte tekst terwijl de rest nog
 * loopt. Een voortgangsbalk op het aantal ingevulde velden maakt het af: die
 * loopt echt, in tegenstelling tot een onbepaalde spinner.
 */
export default function PrefillLoader({
  plain = false,
  techniqueName,
  source = 'je prompt',
  fields = [],
  filled = [],
  models = [],
  winner,
  phase = 'reading',
  thinking = false,
  webSearch = false,
  sources,
  queries = [],
}: PrefillLoaderProps) {
  const STEPS = stepsFor(webSearch, thinking);
  // Seconden sinds de start: denken en zoeken kosten tijd, en dat mag je zien.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const byId = new Map(filled.map((f) => [f.id, f]));
  // Zonder veldenlijst (oudere aanroeper) tonen we drie neutrale plaatshouders.
  const rows = fields.length > 0 ? fields : [0, 1, 2].map((i) => ({ id: `_${i}`, label: '' }));
  const doneCount = fields.length > 0 ? fields.filter((f) => byId.has(f.id)).length : 0;
  const pct = fields.length > 0 ? Math.round((doneCount / fields.length) * 100) : 0;
  const stepIndex = STEPS.findIndex((s) => s.phase === phase);

  return (
    <nldd-box>
      <nldd-container padding="20" sm-padding="16" gap="16">
        {/* Bovenrand: onbepaald zolang er nog geen veld binnen is, daarna de echte
            voortgang over het aantal ingevulde velden. */}
        <nldd-progress-bar
          size="sm"
          value-display="none"
          accessible-label="Velden invullen"
          indeterminate={doneCount === 0 || undefined}
          value={doneCount > 0 ? String(Math.max(pct, 8)) : undefined}
        ></nldd-progress-bar>
        {!plain && (
          <>
            <nldd-container layout="row" gap="12" vertical-alignment="center">
              <nldd-icon icon="search" size="40" color="accent" box></nldd-icon>
              <nldd-container gap="2">
                <nldd-container layout="row" gap="8" vertical-alignment="center">
                  <nldd-text weight="bold">We vullen de velden alvast voor</nldd-text>
                  <nldd-activity-indicator size="16" timing="instant"></nldd-activity-indicator>
                </nldd-container>
                <nldd-text size="sm" color="secondary">
                  We ontleden {source} en verdelen de inhoud over de velden van <strong>{techniqueName}</strong>…
                </nldd-text>
              </nldd-container>
            </nldd-container>

            {/* Stappenspoor: welke fase loopt er nu. */}
            <PhaseSteps steps={STEPS.map((s) => s.label)} activeIndex={stepIndex} />
          </>
        )}

        {/* Zoeken en denken in beeld: wat er gebeurt en dat het tijd kost. */}
        {(webSearch || thinking) && (
          <nldd-box>
            <nldd-container padding="12" gap="8">
              {webSearch && (
                <nldd-container gap="4">
                  <nldd-container layout="row" gap="6" vertical-alignment="center">
                    <nldd-icon icon="globe" size="16" color="accent"></nldd-icon>
                    <nldd-text size="xs" weight="medium" color="accent">
                      {sources === undefined
                        ? 'Internet raadplegen: we zoeken feiten bij je opdracht…'
                        : sources.length > 0
                          ? `Internet geraadpleegd: ${sources.length} ${sources.length === 1 ? 'bron' : 'bronnen'} gevonden`
                          : 'Internet geraadpleegd: geen bruikbare bronnen gevonden'}
                    </nldd-text>
                  </nldd-container>
                  {queries.length > 0 && (
                    <nldd-text size="xs" color="secondary">
                      Gezocht op: {queries.map((q) => `"${q}"`).join(' en ')}
                    </nldd-text>
                  )}
                  {sources && sources.length > 0 && (
                    <nldd-container gap="2">
                      {sources.map((src) => (
                        <nldd-link key={src.url} href={src.url} target="_blank" size="xs" text={src.title}></nldd-link>
                      ))}
                    </nldd-container>
                  )}
                </nldd-container>
              )}
              {thinking && (
                <nldd-container layout="row" gap="6" vertical-alignment="center">
                  <nldd-icon icon="brain" size="16" color="accent"></nldd-icon>
                  <nldd-text size="xs" weight="medium" color="accent">
                    Denken staat aan: het model redeneert eerst over je opdracht, daarom duurt dit langer.
                  </nldd-text>
                </nldd-container>
              )}
              <nldd-container layout="row" gap="6" vertical-alignment="center">
                <nldd-icon icon="timer" size="16" color="secondary-content"></nldd-icon>
                <nldd-text size="xs" color="secondary">{elapsed}s bezig</nldd-text>
              </nldd-container>
            </nldd-container>
          </nldd-box>
        )}

        {models.length > 0 && <ModelStatus models={models} winner={winner} verb="vult je velden in" />}

        {/* Teller over de velden: de meest concrete voortgang die we hebben. */}
        {fields.length > 0 && (
          <nldd-text size="xs" weight="medium" color="secondary" aria-live="polite">
            {doneCount} van {fields.length} velden ingevuld
          </nldd-text>
        )}

        {/* De velden zelf: een wachtregel zolang ze nog komen, echte tekst zodra
            ze binnen zijn. Zo ziet de gebruiker het werk ontstaan. */}
        <nldd-container gap="16">
          {rows.map((row) => {
            const value = byId.get(row.id);
            return (
              <nldd-container key={row.id} gap="6">
                {row.label && (
                  <nldd-container layout="row" gap="6" vertical-alignment="center">
                    {value && <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>}
                    <nldd-text size="xs" weight="bold">{row.label}</nldd-text>
                  </nldd-container>
                )}
                {value ? (
                  <nldd-box background="base">
                    <nldd-container padding="12">
                      <nldd-text size="sm">{value.value}</nldd-text>
                    </nldd-container>
                  </nldd-box>
                ) : (
                  <nldd-container layout="row" gap="8" vertical-alignment="center">
                    <nldd-activity-indicator size="16" timing="instant"></nldd-activity-indicator>
                    <nldd-text size="xs" color="secondary">Wordt ingevuld…</nldd-text>
                  </nldd-container>
                )}
              </nldd-container>
            );
          })}
        </nldd-container>
      </nldd-container>
    </nldd-box>
  );
}
