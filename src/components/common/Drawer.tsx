import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/common/icons';
import useDialogFocus from '@/lib/useDialogFocus';

/**
 * Paneel dat van links inschuift, voor wat op een groot scherm als zijbalk naast
 * de inhoud staat. Anders dan `Modal` sluit dit ook met Escape en een aanraking
 * ernaast: er is hier niets in te vullen dat verloren kan gaan.
 */
export default function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] animate-fade-in flex-col bg-white pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pb-[env(safe-area-inset-bottom)] shadow-2xl focus:outline-none dark:bg-slate-800"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <h2 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-label="Sluiten"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
