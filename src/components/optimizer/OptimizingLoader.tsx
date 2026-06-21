import { Loader2, Sparkles } from 'lucide-react';

interface OptimizingLoaderProps {
  /** Naam van de gekozen techniek/raamwerk, voor een persoonlijke melding. */
  techniqueName?: string;
}

/**
 * Mooi laadscherm tijdens het genereren/optimaliseren van de uiteindelijke
 * prompt. Spiegelt de stijl van het voor-invul-laadscherm (geanimeerde
 * accentbalk + pulserend icoon), maar met een tekst-skelet dat de opbouw van de
 * prompt suggereert. Gedeeld door de techniek-flow en de eigen-prompt-flow.
 */
export default function OptimizingLoader({ techniqueName }: OptimizingLoaderProps) {
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
            </p>
          </div>
        </div>

        {/* Skelet dat een opgebouwde prompt-tekst suggereert. */}
        <div className="mt-5 space-y-2.5">
          <div className="skeleton h-3.5 w-1/4 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-11/12 rounded" />
          <div className="skeleton h-3 w-4/5 rounded" />
          <div className="mt-4 skeleton h-3.5 w-1/3 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      </div>
    </div>
  );
}
