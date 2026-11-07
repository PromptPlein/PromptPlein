import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Wand2,
  type LucideIcon,
} from '@/components/common/icons';
import clsx from 'clsx';
import { MENU_ICON, MENU_ROW } from '@/components/common/MenuSwitchRow';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';

const ITEM = '[role^="menuitem"]:not(:disabled)';
/** Breedte van het menu in rem, plus de afstand tot de knop in px. */
const MENU_WIDTH_REM = 18;
const GAP = 6;

function MenuItem({
  icon: Icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={MENU_ROW}
      disabled={disabled}
      title={hint}
      onClick={onClick}
    >
      <span className={MENU_ICON}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
          {label}
        </span>
        <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{hint}</span>
      </span>
    </button>
  );
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p aria-hidden="true" className="px-2 pb-1 pt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * De plusknop van het tekstvak: één overzicht van alles wat je aan een bericht
 * kunt toevoegen en welke opties er zijn. De balk zelf blijft daardoor rustig en
 * laat alleen zien wat er aanstaat.
 *
 * Het menu hangt aan `document.body`: de chatkaart heeft `overflow-hidden` en een
 * lege chat scrolt van binnen, en daar zou het worden afgeknipt.
 */
export default function ComposerPlusMenu({
  disabled,
  busy,
  canAddFile,
  addFileHint,
  onAddFile,
  onContext,
  onMakePrompt,
  thinking,
  onToggleThinking,
  thinkingUnavailable,
  webSearch,
  onToggleWebSearch,
  onDictate,
}: {
  disabled: boolean;
  /** Er wordt een document gelezen. */
  busy: boolean;
  canAddFile: boolean;
  addFileHint: string;
  onAddFile: () => void;
  onContext: () => void;
  onMakePrompt: () => void;
  thinking: boolean;
  onToggleThinking?: (value: boolean) => void;
  thinkingUnavailable?: string;
  webSearch: boolean;
  onToggleWebSearch?: (value: boolean) => void;
  /** Afwezig als deze browser niet kan opnemen. */
  onDictate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({ left: rect.left, bottom: window.innerHeight - rect.top + GAP });
  }, [open]);

  // De eerste regel krijgt de focus, zodat het menu met de pijltjes werkt.
  useEffect(() => {
    if (open && pos) panelRef.current?.querySelector<HTMLElement>(ITEM)?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    // Denken en Internet vragen eerst om een bevestiging in een eigen venster:
    // die staat buiten het menu en mag het niet sluiten.
    const inDialog = (node: EventTarget | null) =>
      node instanceof Element && Boolean(node.closest('[role="dialog"]'));
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      if (inDialog(target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  /** Een regel die iets start: eerst dicht, zodat de focus daarna vrij is. */
  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (document.querySelector('[role="dialog"]')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      items[moves[e.key]].focus();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/40 disabled:cursor-not-allowed disabled:opacity-40',
          open
            ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100',
        )}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-label="Toevoegen en opties"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Toevoegen en opties"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Plus size={18} className={clsx('transition-transform', open && 'rotate-45')} />
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Toevoegen en opties"
            onKeyDown={onKeyDown}
            style={{ left: pos.left, bottom: pos.bottom, width: `${MENU_WIDTH_REM}rem` }}
            className="fixed z-40 max-h-[70vh] animate-fade-in overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            <MenuGroup label="Toevoegen">
              <MenuItem
                icon={Paperclip}
                label="Bestand"
                hint={addFileHint}
                disabled={!canAddFile}
                onClick={() => choose(onAddFile)}
              />
              <MenuItem
                icon={FolderOpen}
                label="Projecten"
                hint="Project met bronbestanden"
                onClick={() => choose(onContext)}
              />
              <MenuItem
                icon={Wand2}
                label="Context prompt"
                hint="De AI stelt een paar vragen"
                onClick={() => choose(onMakePrompt)}
              />
            </MenuGroup>
            <div className="mx-2 mt-1.5 border-t border-slate-200 dark:border-slate-700" />
            <MenuGroup label="Opties">
              {onToggleThinking && (
                <ThinkingToggle
                  variant="menu"
                  value={thinking}
                  onChange={onToggleThinking}
                  unavailableReason={thinkingUnavailable}
                />
              )}
              {onToggleWebSearch && (
                <WebSearchToggle variant="menu" value={webSearch} onChange={onToggleWebSearch} />
              )}
              {onDictate && (
                <MenuItem
                  icon={Mic}
                  label="Inspreken"
                  hint="Praat in plaats van typen"
                  onClick={() => choose(onDictate)}
                />
              )}
            </MenuGroup>
          </div>,
          document.body,
        )}
    </>
  );
}
