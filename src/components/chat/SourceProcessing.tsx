import clsx from 'clsx';
import { AlertTriangle, Check, Loader2, RefreshCw } from '@/components/common/icons';
import type { ProjectPrepareStatus } from '@/services/chatProjectService';

const nl = (n: number) => n.toLocaleString('nl-NL');

type StepState = 'wait' | 'busy' | 'done';

/**
 * Hoe ver het verwerken van de bronbestanden is, in twee stappen: doorzoekbaar
 * maken (de vectoren) en lezen voor de promptbouwer (de analyse).
 *
 * De balken hebben geen live-regio: een schermlezer zou dan elke tik voorlezen.
 * Alleen het begin en het einde gaan via de verborgen `role="status"`.
 */
export default function SourceProcessing({
  status,
  onRetry,
}: {
  status: ProjectPrepareStatus | null;
  onRetry: () => void;
}) {
  const phase = status?.phase ?? 'index';
  const busy = phase === 'index' || phase === 'read';

  const indexState: StepState = phase === 'index' ? 'busy' : 'done';
  const readState: StepState =
    phase === 'index' ? 'wait' : phase === 'read' ? 'busy' : phase === 'done' ? 'done' : 'wait';

  const indexTotal = status?.indexTotal ?? 0;
  const indexDone = status?.indexDone ?? 0;
  const readTotal = status?.readTotal ?? 0;
  const readDone = status?.readDone ?? 0;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-2">
        {phase === 'done' ? (
          <Check size={16} className="shrink-0 text-rijksgroen" aria-hidden />
        ) : phase === 'failed' ? (
          <AlertTriangle size={16} className="shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        ) : (
          <Loader2 size={16} className="shrink-0 animate-spin text-rijksblauw-500 dark:text-rijksblauw-300" aria-hidden />
        )}
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {phase === 'done'
            ? 'Bronnen verwerkt'
            : phase === 'failed'
              ? 'Lezen lukte niet'
              : 'Bronnen verwerken'}
        </p>
      </div>

      <span role="status" className="sr-only">
        {phase === 'done'
          ? 'Bronnen verwerkt'
          : phase === 'failed'
            ? 'Lezen van de bronnen lukte niet'
            : 'Bronnen worden verwerkt'}
      </span>

      <ol className="mt-2.5 space-y-2.5">
        <Step
          label="Doorzoekbaar maken"
          state={indexState}
          done={indexDone}
          total={indexTotal}
          unit="stukken"
        />
        <Step
          label="Lezen voor de promptbouwer"
          state={phase === 'failed' ? 'wait' : readState}
          done={readDone}
          total={readTotal}
          unit={readTotal === 1 ? 'stap' : 'stappen'}
        />
      </ol>

      {busy && (
        <p className="mt-2.5 text-[0.8125rem] text-slate-600 dark:text-slate-300">
          Je kunt opslaan en dit venster sluiten. Het verwerken gaat door zolang PromptPlein open
          staat.
        </p>
      )}
      {phase === 'done' && (
        <p className="mt-2.5 text-[0.8125rem] text-slate-600 dark:text-slate-300">
          De promptbouwer gebruikt je bronnen meteen.
        </p>
      )}
      {phase === 'failed' && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[0.8125rem] text-slate-600 dark:text-slate-300">
            De promptbouwer probeert het opnieuw als je het project gebruikt.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="opl-raak inline-flex items-center gap-1.5 rounded text-[0.8125rem] font-semibold text-rijksblauw-700 underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200"
          >
            <RefreshCw size={13} aria-hidden /> Opnieuw proberen
          </button>
        </div>
      )}
    </div>
  );
}

function Step({
  label,
  state,
  done,
  total,
  unit,
}: {
  label: string;
  state: StepState;
  done: number;
  total: number;
  unit: string;
}) {
  // Geen totaal bekend (alles stond al klaar, of tellen lukte niet): dan een volle
  // balk zodra de stap af is en een lopende balk zolang hij bezig is.
  const known = total > 0;
  const pct = state === 'done' ? 100 : known ? Math.round((done / total) * 100) : 0;
  const count =
    state === 'wait'
      ? 'Wacht'
      : known && state === 'busy'
        ? `${nl(done)} van ${nl(total)} ${unit}`
        : state === 'done'
          ? 'Klaar'
          : 'Bezig';

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span
          className={clsx(
            'font-medium',
            state === 'wait' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200',
          )}
        >
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{count}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state === 'busy' && !known ? undefined : pct}
        aria-valuetext={count}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
            state === 'done' ? 'bg-rijksgroen' : 'bg-rijksblauw-500 dark:bg-rijksblauw-300',
            state === 'busy' && !known && 'w-1/3 animate-pulse',
          )}
          style={state === 'busy' && !known ? undefined : { width: `${pct}%` }}
        />
      </div>
    </li>
  );
}
