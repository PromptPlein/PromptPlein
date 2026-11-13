import { useId, useRef, useState } from 'react';
import SearchableSelect from '@/components/common/SearchableSelect';
import InfoDot from '@/components/common/InfoDot';
import { Plus } from '@/components/common/icons';
import type { FunctionRequest, Role } from '@/types';

/**
 * Je functie kiezen, of een ontbrekende functie aanvragen. Anders dan een
 * afdeling keurt een beheerder een functie eerst goed; tot die tijd staat de
 * aanvraag eronder als "wacht op goedkeuring". Zelfde vorm als de afdelingskeuze:
 * een knop onder de lijst en een eigen invulblok, ook vanuit de keuzelijst.
 */
export default function FunctionPicker({
  idPrefix,
  roles,
  value,
  onChange,
  pending,
  onRequest,
}: {
  idPrefix: string;
  roles: Role[];
  value: string | null;
  onChange: (roleId: string | null) => void;
  /** De eigen aanvragen die nog wachten. */
  pending: FunctionRequest[];
  /** Dient de aanvraag in; true als dat gelukt is, zodat het blok sluit. */
  onRequest: (name: string, motivation: string) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [motivation, setMotivation] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const existing = roles.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  const alreadyPending = pending.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());

  function openAdd(prefill = '') {
    setName(prefill);
    setMotivation('');
    setAdding(true);
    // Na het tekenen van het blok; zonder toetsenbord over de lijst op een telefoon.
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest' });
      if (!window.matchMedia('(pointer: coarse)').matches) inputRef.current?.focus();
    });
  }

  function closeAdd() {
    setAdding(false);
    setName('');
    setMotivation('');
  }

  async function submit() {
    if (sending || trimmed.length < 2 || alreadyPending) return;
    if (existing) {
      onChange(existing.id);
      closeAdd();
      return;
    }
    setSending(true);
    try {
      if (await onRequest(trimmed, motivation.trim())) closeAdd();
    } finally {
      setSending(false);
    }
  }

  let hint = 'Een beheerder keurt de functie goed. Je krijgt daarover een mail.';
  if (existing) hint = `“${existing.name}” bestaat al. Kies hem met de knop hieronder.`;
  else if (alreadyPending) hint = `Je hebt “${alreadyPending.name}” al aangevraagd.`;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <label className="opl-label mb-0" htmlFor={`${idPrefix}-functie`}>
          Mijn functie
        </label>
        <InfoDot
          label="Uitleg over je functie"
          text="Zo vinden collega's met dezelfde functie elkaars prompts makkelijker terug."
        />
      </div>

      {!adding && (
        <SearchableSelect
          id={`${idPrefix}-functie`}
          options={roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))}
          value={value}
          onChange={onChange}
          placeholder="Kies je functie"
          clearLabel="Geen functie"
          searchPlaceholder="Zoek of typ je functie"
          onRequestNew={(term) => openAdd(term)}
          requestNewLabel={(term) => `“${term}” aanvragen als functie`}
          requestNewHint="Een beheerder keurt hem goed"
        />
      )}

      {!adding && (
        <button
          type="button"
          onClick={() => openAdd()}
          className="opl-raak mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-rijksblauw-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-300"
        >
          <Plus size={14} aria-hidden />
          Mijn functie staat er niet bij
        </button>
      )}

      {adding && (
        <div
          role="group"
          aria-labelledby={`${idPrefix}-nieuwe-functie-kop`}
          className="rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/50 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10"
        >
          <p
            id={`${idPrefix}-nieuwe-functie-kop`}
            className="mb-3 text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            Nieuwe functie aanvragen
          </p>
          <label className="opl-label" htmlFor={`${idPrefix}-nieuwe-functie`}>
            Naam van de functie
          </label>
          <input
            ref={inputRef}
            id={`${idPrefix}-nieuwe-functie`}
            className="opl-input"
            value={name}
            maxLength={80}
            autoComplete="off"
            aria-describedby={hintId}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeAdd();
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Bijvoorbeeld Beleidsadviseur"
          />
          <p id={hintId} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </p>

          {!existing && (
            <>
              <label className="opl-label mt-3" htmlFor={`${idPrefix}-functie-toelichting`}>
                Toelichting voor de beheerder (mag leeg)
              </label>
              <textarea
                id={`${idPrefix}-functie-toelichting`}
                className="opl-input min-h-[4.5rem]"
                value={motivation}
                maxLength={500}
                onChange={(e) => setMotivation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeAdd();
                }}
                placeholder="Wat doe je in deze functie?"
              />
            </>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="opl-btn-ghost" onClick={closeAdd} disabled={sending}>
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="opl-btn-primary"
              disabled={sending || trimmed.length < 2 || Boolean(alreadyPending)}
            >
              {sending ? 'Versturen…' : existing ? 'Deze kiezen' : 'Functie aanvragen'}
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {pending.map((r) => (
            <li key={r.id}>
              <span className="font-medium">{r.name}</span>: wacht op goedkeuring
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
