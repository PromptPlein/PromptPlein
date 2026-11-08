import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';

export interface SearchableOption {
  id: string;
  label: string;
  /** Optional second line under the label (a description, for instance). */
  hint?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Text of the "no choice" option at the top. Leave out to hide it. */
  clearLabel?: string;
  /** Kept for existing callers: the combo box filters as you type in the field itself. */
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  /**
   * Optional: offer a "'<term>' aanvragen" action at the bottom when the typed
   * term matches no option exactly. Leave out to hide the action.
   */
  onRequestNew?: (term: string) => void;
  requestNewLabel?: (term: string) => string;
  /** Accessible name, for a select that is not inside a labeled nldd-form-field. */
  accessibleLabel?: string;
}

const CLEAR = '__geen__';
const REQUEST = '__aanvragen__';

type ComboElement = HTMLElement & { value?: string; text?: string };

/** A searchable choice: an nldd-combo-box with the options in its menu. */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Maak een keuze…',
  clearLabel,
  searchPlaceholder,
  disabled = false,
  id,
  onRequestNew,
  requestNewLabel = (term) => `“${term}” aanvragen`,
  accessibleLabel,
}: SearchableSelectProps) {
  const ref = useRef<ComboElement>(null);
  const [query, setQuery] = useState('');
  const [resetTick, setResetTick] = useState(0);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const selectedLabel = selected?.label ?? '';
  const term = query.trim();
  const exactMatch = term.length > 0 && options.some((o) => o.label.toLowerCase() === term.toLowerCase());
  const showRequest = Boolean(onRequestNew) && term.length > 0 && !exactMatch && term !== selected?.label;

  // The field shows the label of the current choice, also after a choice that
  // is no option (a request) or one the parent turned down.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.value = value ?? '';
    el.text = selectedLabel;
  }, [value, selectedLabel, resetTick]);

  useNlddEvent<CustomEvent<{ value?: string }>>(ref, 'input', (e) => {
    setQuery(e.detail?.value ?? '');
  });

  useNlddEvent<CustomEvent<{ value?: string }>>(ref, 'change', (e) => {
    const next = e.detail?.value ?? '';
    if (next === REQUEST) {
      onRequestNew?.(term);
      setQuery('');
      setResetTick((t) => t + 1);
      return;
    }
    setQuery('');
    if (next === CLEAR || next === '') onChange(null);
    else if (options.some((o) => o.id === next)) onChange(next);
    else setResetTick((t) => t + 1);
  });

  return (
    <nldd-combo-box
      ref={ref}
      id={id}
      placeholder={placeholder}
      disabled={disabled || undefined}
      accessible-label={accessibleLabel ?? searchPlaceholder}
    >
      <nldd-menu>
        {clearLabel && <nldd-menu-item value={CLEAR} text={clearLabel}></nldd-menu-item>}
        {options.map((o) => (
          <nldd-menu-item key={o.id} value={o.id} text={o.label} details={o.hint} aliases={o.hint}></nldd-menu-item>
        ))}
        {showRequest && (
          <>
            <nldd-menu-divider></nldd-menu-divider>
            <nldd-menu-item value={REQUEST} icon="add" text={requestNewLabel(term)} aliases={term}></nldd-menu-item>
          </>
        )}
      </nldd-menu>
    </nldd-combo-box>
  );
}
