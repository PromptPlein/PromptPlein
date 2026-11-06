import type { ReactNode } from 'react';
import { AlertTriangle } from '@/components/common/icons';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Eén zin, of meerdere alinea's als ReactNode. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rood: de handeling is niet terug te draaien (verwijderen). */
  destructive?: boolean;
  /**
   * Oranje: de handeling is wél terug te draaien, maar de gebruiker moet eerst
   * iets weten voordat hij hem aanzet (privacy, kwaliteit).
   */
  warning?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Bevestigen',
  cancelLabel = 'Annuleren',
  destructive = false,
  warning = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="max-w-md">
      <div className="flex gap-3">
        {destructive && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10 text-rijksrood">
            <AlertTriangle size={20} />
          </span>
        )}
        {warning && !destructive && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <AlertTriangle size={20} />
          </span>
        )}
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="opl-btn-secondary" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          className={destructive ? 'opl-btn bg-rijksrood text-white hover:bg-red-700' : 'opl-btn-primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
