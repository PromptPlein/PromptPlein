import { useEffect, useState } from 'react';
import { Brain, Check, Globe, Loader2, Search, Timer } from '@/components/common/icons';
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
    <div className="animate-fade-in overflow-hidden rounded-2xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800">
      {/* Bovenrand: onbepaald zolang er nog geen veld binnen is, daarna de echte
          voortgang over het aantal ingevulde velden. */}
      <div className="h-1 w-full overflow-hidden bg-rijksblauw-100 dark:bg-rijksblauw-500/20">
        {doneCount > 0 ? (
          <div
            className="h-full bg-rijksblauw-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(pct, 8)}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-loading-bar bg-rijksblauw-500" />
        )}
      </div>

      <div className="p-5 sm:p-6">
        {!plain && (
          <>
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rijksblauw-400/30" />
            <Search size={18} className="relative" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
              We vullen de velden alvast voor
              <Loader2 size={15} className="animate-spin text-rijksblauw-500" />
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              We ontleden {source} en verdelen de inhoud over de velden van{' '}
              <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                {techniqueName}
              </span>
              …
            </p>
          </div>
        </div>

        {/* Stappenspoor: welke fase loopt er nu. */}
        <PhaseSteps steps={STEPS.map((s) => s.label)} activeIndex={stepIndex} className="mt-4" />
          </>
        )}

        {/* Zoeken en denken in beeld: wat er gebeurt en dat het tijd kost. */}
        {(webSearch || thinking) && (
          <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
            {webSearch && (
              <div>
                <p className="flex items-center gap-1.5 font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                  <Globe size={13} className={phase === 'searching' ? 'animate-pulse' : ''} />
                  {sources === undefined
                    ? 'Internet raadplegen: we zoeken feiten bij je opdracht…'
                    : sources.length > 0
                      ? `Internet geraadpleegd: ${sources.length} ${sources.length === 1 ? 'bron' : 'bronnen'} gevonden`
                      : 'Internet geraadpleegd: geen bruikbare bronnen gevonden'}
                </p>
                {queries.length > 0 && (
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    Gezocht op: {queries.map((q) => `"${q}"`).join(' en ')}
                  </p>
                )}
                {sources && sources.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {sources.map((src) => (
                      <li key={src.url} className="truncate">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                          title={src.url}
                        >
                          {src.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {thinking && (
              <p className="flex items-center gap-1.5 font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                <Brain size={13} className={phase === 'thinking' ? 'animate-pulse' : ''} />
                Denken staat aan: het model redeneert eerst over je opdracht, daarom duurt dit langer.
              </p>
            )}
            <p className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Timer size={13} /> {elapsed}s bezig
            </p>
          </div>
        )}

        {models.length > 0 && (
          <ModelStatus
            models={models}
            winner={winner}
            verb="vult je velden in"
            className="mt-4"
          />
        )}

        {/* Teller over de velden: de meest concrete voortgang die we hebben. */}
        {fields.length > 0 && (
          <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400" aria-live="polite">
            {doneCount} van {fields.length} velden ingevuld
          </p>
        )}

        {/* De velden zelf: skelet zolang ze nog komen, echte tekst zodra ze
            binnen zijn. Zo ziet de gebruiker het werk ontstaan. */}
        <div className="mt-2 space-y-4">
          {rows.map((row) => {
            const value = byId.get(row.id);
            return (
              <div key={row.id} className="space-y-1.5">
                {row.label ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {value && <Check size={12} className="text-emerald-500" />}
                    {row.label}
                  </p>
                ) : (
                  <div className="skeleton h-3.5 w-1/3 rounded" />
                )}
                {value ? (
                  <p className="animate-fade-in line-clamp-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-sm leading-relaxed text-slate-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-slate-200">
                    {value.value}
                  </p>
                ) : (
                  <div className="skeleton h-16 w-full rounded-lg" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
