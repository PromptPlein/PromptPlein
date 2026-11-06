import { useEffect, type ReactNode } from 'react';
import { X } from '@/components/common/icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Maximale breedte-utility, bijv. 'max-w-2xl'. */
  size?: string;
}

export default function Modal({ open, onClose, title, children, size = 'max-w-2xl' }: ModalProps) {
  // Een venster sluit alleen via het kruisje of een eigen knop (Annuleren,
  // Opslaan). Geen klik op de achtergrond en geen Escape: daarmee ging per
  // ongeluk alles verloren wat er al was ingevuld.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:p-8">
        <div className={`mt-6 w-full ${size} animate-fade-in rounded-2xl bg-white dark:bg-slate-800 shadow-2xl`}>
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
            <h2 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Sluiten"
            >
              <X size={20} />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
