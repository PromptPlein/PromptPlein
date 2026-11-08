import { ShieldAlert } from '@/components/common/icons';
import Modal from '@/components/common/Modal';
import type { PiiCount } from '@/services/guardrails';

export type PiiFileChoice = 'redact' | 'keep' | 'skip';

/**
 * Vraagt vóór het toevoegen van een bronbestand wat er met gevonden
 * persoonsgegevens moet gebeuren. Vervangen gebeurt in de browser, dus de
 * oorspronkelijke gegevens komen niet in de database en niet bij Mistral.
 */
export default function PiiFileDialog({
  fileName,
  found,
  onChoose,
}: {
  fileName: string;
  found: PiiCount[];
  onChoose: (choice: PiiFileChoice) => void;
}) {
  return (
    <Modal open onClose={() => onChoose('skip')} title="Persoonsgegevens gevonden" size="max-w-lg">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <ShieldAlert size={20} />
        </span>
        <div className="min-w-0 space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>
            In <span className="break-words font-medium text-slate-800 dark:text-slate-100">{fileName}</span>{' '}
            staat mogelijk:
          </p>
          <ul className="space-y-0.5">
            {found.map((f) => (
              <li key={f.label} className="font-medium text-slate-800 dark:text-slate-100">
                {f.label} ({f.count.toLocaleString('nl-NL')})
              </li>
            ))}
          </ul>
          <p>
            Vervang je ze, dan staat er bijvoorbeeld [BSN] of [naam] in de tekst. Dat gebeurt op dit
            apparaat, voordat er iets wordt verstuurd.
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            Een naam zonder aanhef of veldnaam vindt deze controle niet.
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="opl-btn-secondary" onClick={() => onChoose('skip')}>
          Niet toevoegen
        </button>
        <button type="button" className="opl-btn-secondary" onClick={() => onChoose('keep')}>
          Toevoegen zoals het is
        </button>
        <button type="button" className="opl-btn-primary" onClick={() => onChoose('redact')}>
          Vervangen en toevoegen
        </button>
      </div>
    </Modal>
  );
}
