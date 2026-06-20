import { ShieldAlert } from 'lucide-react';
import Modal from '@/components/common/Modal';
import type { GuardrailFinding } from '@/services/guardrails';

interface GuardrailDialogProps {
  findings: GuardrailFinding[];
  piiWarning: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function GuardrailDialog({
  findings,
  piiWarning,
  onConfirm,
  onCancel,
}: GuardrailDialogProps) {
  const pii = findings.filter((f) => f.kind === 'pii');
  const topics = findings.filter((f) => f.kind === 'topic');

  return (
    <Modal open onClose={onCancel} title="Controle vóór genereren" size="max-w-lg">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <ShieldAlert size={20} />
        </span>
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {pii.length > 0 && (
            <div>
              <p>{piiWarning}</p>
              <p className="mt-2">
                Gevonden:{' '}
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {pii.map((f) => f.label).join(', ')}
                </span>
              </p>
            </div>
          )}
          {topics.length > 0 && (
            <p>
              Je prompt bevat mogelijk een verboden onderwerp:{' '}
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {topics.map((f) => f.label).join(', ')}
              </span>
              .
            </p>
          )}
          <p className="text-slate-500 dark:text-slate-400">
            Wil je toch doorgaan met genereren?
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="opl-btn-secondary" onClick={onCancel}>
          Terug, ik pas de prompt aan
        </button>
        <button className="opl-btn bg-amber-600 text-white hover:bg-amber-700" onClick={onConfirm}>
          Ik begrijp het, ga door
        </button>
      </div>
    </Modal>
  );
}
