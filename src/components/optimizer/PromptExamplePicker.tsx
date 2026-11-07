import { useState } from 'react';
import { ChevronDown, Lightbulb, Wand2 } from '@/components/common/icons';
import clsx from 'clsx';
import HoverPreview from '@/components/common/HoverPreview';
import { PROMPT_CATEGORIES } from '@/data/promptCategories';
import { PROMPT_EXAMPLES, type PromptExample } from '@/data/promptExamples';

/**
 * Voorbeeldprompts kiezen als startpunt voor het contextveld van een framework.
 *
 * Eén smalle regel boven het veld: wie een voorbeeld zoekt ziet hem meteen, wie
 * zelf typt heeft er geen last van. Hij klapt uit naar de hele lijst.
 *
 * Het kaartje toont de prompt zelf niet (dan wordt de lijst onleesbaar lang):
 * wie hem vooraf wil lezen, houdt de muis erboven, en verder staat hij na het
 * kiezen gewoon in het contextveld, waar hij toch aangepast moet worden.
 */
export default function PromptExamplePicker({
  onPick,
}: {
  /** De gekozen prompt; de aanroeper zet hem in zijn eigen invoerveld. */
  onPick: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Titel van het laatst gekozen voorbeeld, zodat de balk na het kiezen laat
  // zien wat er in het veld staat. Puur informatief: de gebruiker bewerkt de
  // tekst daarna zelf, dus dit is geen selectie die iets stuurt.
  const [picked, setPicked] = useState<string | null>(null);

  function pick(ex: PromptExample) {
    setPicked(ex.title);
    setOpen(false);
    onPick(ex.prompt);
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="techniek-voorbeelden"
        title={`${PROMPT_EXAMPLES.length} prompts uit het rijkswerk. Je past ze daarna aan naar je eigen dossier.`}
        className="inline-flex min-h-8 items-center gap-1.5 text-sm font-medium text-rijksblauw-500 transition-colors hover:underline dark:text-rijksblauw-200"
      >
        <Lightbulb size={16} className="shrink-0 text-rijksoranje" />
        {picked ? `Voorbeeld gekozen: ${picked}` : 'Begin met een voorbeeld'}
        <ChevronDown
          size={14}
          className={clsx('shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          id="techniek-voorbeelden"
          className="animate-fade-in mt-1 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
        >
          {/* Vaste hoogte met eigen schuifbalk: de lijst is bewust lang (er is
              veel verschillend werk), maar mag de rest van het invulblok niet
              wegdrukken. */}
          <div className="opl-scroll-slim max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {PROMPT_EXAMPLES.map((ex) => {
              const category = PROMPT_CATEGORIES[ex.category];
              return (
                <HoverPreview key={ex.title} label="Voorbeeldprompt" text={ex.prompt}>
                  <button
                    type="button"
                    onClick={() => pick(ex)}
                    className="group flex w-full items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-colors hover:border-rijksblauw-300 hover:bg-rijksblauw-50/60 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rijksblauw-500/40 dark:hover:bg-rijksblauw-500/10"
                  >
                    <span className="min-w-0">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rijksblauw-600 dark:text-rijksblauw-300">
                        <category.icon size={12} className="shrink-0" />
                        {category.label}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {ex.title}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {ex.subtitle}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-rijksblauw-600 transition-colors group-hover:bg-rijksblauw-100 dark:text-rijksblauw-300 dark:group-hover:bg-rijksblauw-500/20">
                      <Wand2 size={13} /> Gebruik
                    </span>
                  </button>
                </HoverPreview>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
