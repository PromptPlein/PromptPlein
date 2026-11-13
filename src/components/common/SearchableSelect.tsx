import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from '@/components/common/icons';

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
  /** Tweede regel onder de toevoegactie, bijv. waar het nieuwe item komt. */
  requestNewHint?: string;
  /** Tekst als er nog helemaal niets te kiezen is. */
  emptyLabel?: string;
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
  requestNewHint,
  emptyLabel = 'Nog leeg. Typ een naam om hem toe te voegen.',
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

  function requestNew() {
    const term = query.trim();
    if (!onRequestNew || !term) return;
    onRequestNew(term);
    setOpen(false);
  }

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
                // Enter kiest de enige treffer, of voegt toe als er niets is.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered.length === 1) choose(filtered[0].id);
                  else if (filtered.length === 0 && !exactMatch) requestNew();
                  return;
                }
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
            {clearLabel && !query.trim() && (
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

            {filtered.length === 0 && query.trim() && (
              <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                Niets gevonden voor “{query.trim()}”.
              </li>
            )}

            {filtered.length === 0 && !query.trim() && (
              <li className="px-3 py-3 text-center text-sm text-slate-500 dark:text-slate-400">
                {onRequestNew ? emptyLabel : 'Geen resultaten'}
              </li>
            )}

            {onRequestNew && query.trim() && !exactMatch && (
              <li className="px-2 pb-1 pt-1">
                <button
                  type="button"
                  onClick={requestNew}
                  className="flex w-full items-center gap-3 rounded border border-dashed border-rijksblauw-300 bg-rijksblauw-50/60 px-3 py-2.5 text-left hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10 dark:hover:bg-rijksblauw-500/20"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rijksblauw-600 text-white dark:bg-rijksblauw-400 dark:text-slate-900"
                  >
                    <Plus size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                      {requestNewLabel(query.trim())}
                    </span>
                    {requestNewHint && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {requestNewHint}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
