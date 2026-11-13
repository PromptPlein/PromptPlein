import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from '@/components/common/icons';

export interface SearchableOption {
  id: string;
  label: string;
  /** Optionele tweede regel onder het label (bijv. een beschrijving). */
  hint?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Tekst voor de "geen keuze"-optie bovenaan. Laat weg om die te verbergen. */
  clearLabel?: string;
  /** Tekst in het zoekveld. */
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  /**
   * Optioneel: toon onderaan een "➕ '<term>' aanvragen"-actie wanneer de
   * zoekterm geen exacte match heeft. Wordt in Fase C gebruikt voor het
   * aanvragen van een nieuwe functie. Laat weg om de actie te verbergen.
   */
  onRequestNew?: (term: string) => void;
  requestNewLabel?: (term: string) => string;
}

/**
 * Lichtgewicht zoekbare keuzelijst in de huisstijl (opl-classes), zonder
 * externe afhankelijkheden. Toont een knop met de huidige keuze; bij openen
 * verschijnt een zoekveld met een gefilterde lijst. Sluit bij klik buiten of Esc.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Maak een keuze…',
  clearLabel,
  searchPlaceholder = 'Zoeken…',
  disabled = false,
  id,
  onRequestNew,
  requestNewLabel = (term) => `“${term}” aanvragen`,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  // Of de zoekterm exact overeenkomt met een bestaande optie — bepaalt of we
  // de "aanvragen"-actie tonen.
  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q.length > 0 && options.some((o) => o.label.toLowerCase() === q);
  }, [options, query]);

  // Sluit bij klik buiten de component.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [open]);

  // Focus het zoekveld zodra de lijst opent en wis de vorige zoekterm.
  useEffect(() => {
    if (open) {
      setQuery('');
      // Op een aanraakscherm zou het toetsenbord nu meteen over de lijst schuiven.
      // Zoeken blijft er, maar pas als iemand erop tikt.
      if (window.matchMedia('(pointer: coarse)').matches) return;
      // Wacht één frame zodat het input-element gemonteerd is.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function choose(optId: string | null) {
    onChange(optId);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="opl-input flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'text-slate-400 dark:text-slate-500'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="relative border-b border-slate-100 p-2 dark:border-slate-700">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={inputRef}
              className="opl-input pl-8 pr-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                setOpen(false);
                rootRef.current?.querySelector('button')?.focus();
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Zoekterm wissen"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Een gewone lijst met knoppen: dat leest en bedient elke schermlezer goed. */}
          <ul className="max-h-60 overflow-auto overscroll-contain py-1">
            {clearLabel && (
              <li>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  aria-current={value === null ? 'true' : undefined}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/60"
                >
                  {clearLabel}
                  {value === null && <Check size={15} className="text-rijksblauw-500" aria-hidden />}
                </button>
              </li>
            )}

            {filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => choose(o.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                  aria-current={o.id === value ? 'true' : undefined}
                >
                  <span>
                    {o.label}
                    {o.hint && (
                      <span className="block text-xs text-slate-400 dark:text-slate-500">{o.hint}</span>
                    )}
                  </span>
                  {o.id === value && <Check size={15} className="shrink-0 text-rijksblauw-500" aria-hidden />}
                </button>
              </li>
            ))}

            {filtered.length === 0 && !onRequestNew && (
              <li className="px-3 py-3 text-center text-sm text-slate-400 dark:text-slate-500">
                Geen resultaten
              </li>
            )}

            {filtered.length === 0 && onRequestNew && !query.trim() && (
              <li className="px-3 py-3 text-center text-sm text-slate-500 dark:text-slate-400">
                Nog leeg. Typ een naam om hem toe te voegen.
              </li>
            )}

            {onRequestNew && query.trim() && !exactMatch && (
              <li className="border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    onRequestNew(query.trim());
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-rijksblauw-600 hover:bg-rijksblauw-50 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/10"
                >
                  + {requestNewLabel(query.trim())}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
