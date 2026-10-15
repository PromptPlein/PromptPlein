import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Maximale breedte-utility, bijv. 'max-w-2xl'. */
  size?: string;
}

export default function Modal({ open, onClose, title, children, size = 'max-w-2xl' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 dark:bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Het klikvlak dat sluit is een eigen laag binnen het scrollvak. Een klik
          op de schuifbalk raakt het scrollvak zelf en sluit het venster dus niet. */}
      <div
        className="flex min-h-full items-start justify-center p-4 sm:p-8"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
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
