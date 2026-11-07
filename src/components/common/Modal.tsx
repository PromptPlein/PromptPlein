import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/common/icons';
import useDialogFocus from '@/lib/useDialogFocus';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Maximale breedte-utility, bijv. 'max-w-2xl'. */
  size?: string;
}

export default function Modal({ open, onClose, title, children, size = 'max-w-2xl' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef);

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

  // Op de telefoon een vel dat van onderen opkomt, tot de volle hoogte: de knoppen
  // staan dan onder de duim. Via een portal, zodat de pagina eronder `inert` kan.
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-900/50 focus:outline-none dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex min-h-full items-end justify-center sm:items-start sm:p-8">
        <div
          className={`w-full ${size} animate-fade-in rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:bg-slate-800 sm:mt-6 sm:rounded-2xl sm:pb-0`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800 sm:static sm:px-6 sm:py-4">
            <h2 className="min-w-0 text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{title}</h2>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Sluiten"
            >
              <X size={20} />
            </button>
          </div>
          <div className="px-4 py-5 sm:px-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
