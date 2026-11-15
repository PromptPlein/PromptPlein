import clsx from 'clsx';
import { Loader2, Plus, Sparkles, Undo2 } from '@/components/common/icons';
import { wordDiff } from '@/lib/wordDiff';

/** Eén optie onder een veld: een kort label op de knop, de tekst gaat naar de AI. */
export interface FieldOption {
  label: string;
  tekst: string;
}

/** Het voorstel bij een aangeklikte optie; `value` is null zolang de AI werkt. */
export interface ChoiceProposal {
  option: FieldOption;
  value: string | null;
}

/**
 * De opties onder een veld van een beeldprompt, als één kaart: de labels, en na
 * een klik het voorstel van de AI met wat erbij komt en wat eruit gaat. Pas
 * Overnemen verandert het veld; daarna zet Herstel de oude tekst terug.
 */
export default function FieldChoices({
  name,
  opties,
  value,
  proposal,
  picked,
  busy,
  onPick,
  onAccept,
  onReject,
  onUndo,
}: {
  name: string;
  opties: FieldOption[];
  /** De tekst die nu in het veld staat; daartegen wordt het voorstel vergeleken. */
  value: string;
  proposal: ChoiceProposal | null;
  /** De tekst van de optie die het laatst is overgenomen. */
  picked?: string;
  /** De AI werkt aan een voorstel, in dit veld of een ander. */
  busy: boolean;
  onPick: (option: FieldOption) => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo?: () => void;
}) {
  if (opties.length === 0) return null;
  const actief = proposal?.option.tekst ?? picked;
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Sparkles size={14} aria-hidden="true" className="shrink-0 text-rijksblauw-500 dark:text-rijksblauw-200" />
        Kies uit deze opties (optioneel)
      </p>
      <div role="group" aria-label={`Opties voor ${name}`} className="mt-2 flex flex-wrap gap-1.5">
        {opties.map((option) => {
          const on = actief === option.tekst;
          return (
            <button
              key={option.tekst}
              type="button"
              aria-pressed={on}
              title={option.tekst}
              disabled={busy && !on}
              onClick={() => onPick(option)}
              className={clsx(
                'inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border px-3 py-1 text-left text-sm leading-snug transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:cursor-wait disabled:opacity-50',
                on
                  ? 'border-rijksblauw-700 bg-rijksblauw-700 text-white dark:border-rijksblauw-500 dark:bg-rijksblauw-500'
                  : 'border-rijksblauw-300 bg-white text-rijksblauw-800 hover:bg-rijksblauw-50 dark:border-rijksblauw-500/50 dark:bg-slate-800 dark:text-rijksblauw-100 dark:hover:bg-slate-700',
              )}
            >
              <Plus size={13} aria-hidden="true" className="shrink-0" />
              {option.label}
            </button>
          );
        })}
      </div>

      <div role="status">
        {proposal && proposal.value === null && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> De AI past je tekst aan
          </p>
        )}
        {!proposal && picked && onUndo && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-slate-600 dark:text-slate-300">
            Optie overgenomen.
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex min-h-9 items-center gap-1 rounded font-semibold text-rijksblauw-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200"
            >
              <Undo2 size={14} aria-hidden="true" /> Herstel
            </button>
          </p>
        )}
      </div>

      {proposal && proposal.value !== null && (
        <div className="mt-3 rounded-md border border-rijksblauw-200 bg-white p-3 dark:border-rijksblauw-500/40 dark:bg-slate-800">
          <p className="text-xs font-semibold text-rijksblauw-800 dark:text-rijksblauw-100">Zo wordt je tekst</p>
          <p className="mt-1 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-slate-800 dark:text-slate-100">
            {wordDiff(value, proposal.value).map((part, i) =>
              part.type === 'same' ? (
                <span key={i}>{part.text}</span>
              ) : part.type === 'ins' ? (
                <ins
                  key={i}
                  className="rounded bg-emerald-50 px-0.5 text-emerald-900 no-underline dark:bg-emerald-500/15 dark:text-emerald-100"
                >
                  <span className="sr-only">toegevoegd: </span>
                  {part.text}
                </ins>
              ) : (
                <del
                  key={i}
                  className="rounded bg-red-50 px-0.5 text-red-800 line-through dark:bg-red-500/15 dark:text-red-200"
                >
                  <span className="sr-only">verwijderd: </span>
                  {part.text}
                </del>
              ),
            )}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onAccept} className="opl-btn-primary">
              Overnemen
            </button>
            <button
              type="button"
              onClick={onReject}
              className="inline-flex min-h-10 items-center rounded px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Niet doen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
