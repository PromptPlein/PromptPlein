import { Check, Sparkles, X } from 'lucide-react';

interface ExpandProposalProps {
  /** Het door de AI verbeterde voorstel voor dit veld. */
  proposed: string;
  /** Korte punten die benoemen wat de AI verbeterde (kan leeg zijn). */
  improvements: string[];
  /** Neem het voorstel over (vervangt de veldwaarde). */
  onAccept: () => void;
  /** Verwerp het voorstel (veld blijft ongewijzigd). */
  onReject: () => void;
}

/**
 * Toont het AI-voorstel voor een veld als schone, leesbare tekst (geen diff-kleuren),
 * met eronder een kort lijstje "Wat is verbeterd". Zo ziet de gebruiker meteen het
 * nette resultaat plus waaróm het beter is, en neemt die het over of verwerpt het.
 */
export default function ExpandProposal({ proposed, improvements, onAccept, onReject }: ExpandProposalProps) {
  return (
    <div className="animate-fade-in mt-2 overflow-hidden rounded-xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800">
      <div className="flex items-center gap-2 border-b border-rijksblauw-100 bg-rijksblauw-50/60 px-3 py-2 dark:border-rijksblauw-500/20 dark:bg-rijksblauw-500/10">
        <Sparkles size={14} className="text-rijksblauw-500" />
        <span className="text-xs font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
          AI-voorstel
        </span>
      </div>

      {/* De nette voorgestelde tekst — gewoon leesbaar, zonder markeringen. */}
      <p className="whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        {proposed}
      </p>

      {improvements.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/30">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Wat is verbeterd
          </p>
          <ul className="space-y-1">
            {improvements.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-slate-700">
        <button
          type="button"
          onClick={onReject}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X size={13} /> Verwerpen
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex items-center gap-1 rounded-md bg-rijksblauw-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rijksblauw-700"
        >
          <Check size={13} /> Overnemen
        </button>
      </div>
    </div>
  );
}
