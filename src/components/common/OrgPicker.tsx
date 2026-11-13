import { useId, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { createDepartment } from '@/services/orgService';
import { departmentsUnder, listMinistries, ministryOf } from '@/lib/orgTree';
import SearchableSelect from '@/components/common/SearchableSelect';
import InfoDot from '@/components/common/InfoDot';
import { Plus } from '@/components/common/icons';

/**
 * Eerst het ministerie, dan de afdeling. De waarde is de afdeling als die er is,
 * anders het ministerie: zo hangt een profiel altijd aan de diepste eenheid.
 *
 * Met `allowCreate` voegt een ingelogde gebruiker zelf een afdeling toe, zonder
 * goedkeuring. Dat gaat via een eigen invulblok, ook vanuit de keuzelijst: de
 * afdeling staat daarna voor iedereen in de lijst, dus de naam wordt eerst nog
 * even getoond om na te kijken.
 */
export default function OrgPicker({
  value,
  onChange,
  idPrefix,
  allowCreate = false,
  onCreated,
  disabled = false,
}: {
  value: string | null;
  onChange: (orgId: string | null) => void;
  idPrefix: string;
  allowCreate?: boolean;
  /** Na het toevoegen van een afdeling, bijvoorbeeld om hem meteen op te slaan. */
  onCreated?: (orgId: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { organizations, refresh, loading } = useReferenceData();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const ministry = value ? ministryOf(value, organizations) : null;
  const ministryId = ministry?.id ?? null;
  const departmentId = value && value !== ministryId ? value : null;

  const ministryOptions = useMemo(
    () => listMinistries(organizations).map((o) => ({ id: o.id, label: o.name })),
    [organizations],
  );
  const departments = useMemo(
    () => (ministryId ? departmentsUnder(ministryId, organizations) : []),
    [ministryId, organizations],
  );
  const departmentOptions = useMemo(
    () => departments.map((o) => ({ id: o.id, label: o.name })),
    [departments],
  );

  const trimmed = newName.trim().replace(/\s+/g, ' ');
  const existing = departments.find((d) => d.name.toLowerCase() === trimmed.toLowerCase());

  function openAdd(prefill = '') {
    setNewName(prefill);
    setAdding(true);
    // Na het tekenen van het blok; zonder toetsenbord over de lijst op een telefoon.
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest' });
      if (!window.matchMedia('(pointer: coarse)').matches) inputRef.current?.focus();
    });
  }

  function closeAdd() {
    setAdding(false);
    setNewName('');
  }

  function chooseMinistry(id: string | null) {
    closeAdd();
    onChange(id);
  }

  async function submitAdd() {
    if (!ministryId || creating || trimmed.length < 2) return;
    if (existing) {
      onChange(existing.id);
      closeAdd();
      return;
    }
    setCreating(true);
    try {
      const created = await createDepartment(ministryId, trimmed);
      await refresh();
      onChange(created.id);
      await onCreated?.(created.id);
      closeAdd();
      toast.success(`Afdeling “${created.name}” toegevoegd.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Afdeling toevoegen mislukt.');
    } finally {
      setCreating(false);
    }
  }

  const ministryLabel = ministry?.name ?? 'het ministerie';

  return (
    <div className="space-y-4">
      <div>
        <label className="opl-label" htmlFor={`${idPrefix}-ministerie`}>
          Ministerie
        </label>
        <SearchableSelect
          id={`${idPrefix}-ministerie`}
          options={ministryOptions}
          value={ministryId}
          onChange={chooseMinistry}
          disabled={disabled || loading}
          placeholder={loading ? 'Ministeries laden…' : 'Kies je ministerie'}
          searchPlaceholder="Zoek je ministerie"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor={`${idPrefix}-afdeling`}>
            Afdeling
          </label>
          <InfoDot
            label="Uitleg over de afdeling"
            text={
              allowCreate
                ? "Collega's in dezelfde afdeling zien elkaars prompts met het deelniveau Afdeling."
                : "Collega's in dezelfde afdeling zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Voeg hem na het registreren toe bij je profiel."
            }
          />
        </div>

        {!adding && (
          <SearchableSelect
            id={`${idPrefix}-afdeling`}
            options={departmentOptions}
            value={departmentId}
            onChange={(id) => onChange(id ?? ministryId)}
            disabled={disabled || !ministryId}
            placeholder={!ministryId ? 'Kies eerst een ministerie' : 'Kies je afdeling'}
            clearLabel="Geen afdeling"
            searchPlaceholder={allowCreate ? 'Zoek of typ je afdeling' : 'Zoek je afdeling'}
            emptyLabel="Nog geen afdelingen bij dit ministerie."
            onRequestNew={allowCreate ? (term) => openAdd(term) : undefined}
            requestNewLabel={(term) => `“${term}” toevoegen als afdeling`}
            requestNewHint={`Nieuw onder ${ministryLabel}`}
          />
        )}

        {allowCreate && ministryId && !adding && (
          <button
            type="button"
            onClick={() => openAdd()}
            disabled={disabled}
            className="opl-raak mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-rijksblauw-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-300"
          >
            <Plus size={14} aria-hidden />
            Afdeling staat er niet bij
          </button>
        )}

        {adding && (
          <div
            role="group"
            aria-labelledby={`${idPrefix}-nieuwe-afdeling-kop`}
            className="rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/50 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10"
          >
            <p
              id={`${idPrefix}-nieuwe-afdeling-kop`}
              className="mb-3 text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
              Nieuwe afdeling bij {ministryLabel}
            </p>
            <label className="opl-label" htmlFor={`${idPrefix}-nieuwe-afdeling`}>
              Naam van de afdeling
            </label>
            <input
              ref={inputRef}
              id={`${idPrefix}-nieuwe-afdeling`}
              className="opl-input"
              value={newName}
              maxLength={80}
              autoComplete="off"
              aria-describedby={hintId}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeAdd();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitAdd();
                }
              }}
              placeholder="Bijvoorbeeld Communicatie"
            />
            <p id={hintId} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {existing
                ? `“${existing.name}” bestaat al. Kies hem met de knop hieronder.`
                : "Kijk de naam na: collega's zien en kiezen hem daarna ook."}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="opl-btn-ghost" onClick={closeAdd} disabled={creating}>
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => void submitAdd()}
                className="opl-btn-primary"
                disabled={creating || trimmed.length < 2}
              >
                {creating ? 'Toevoegen…' : existing ? 'Deze kiezen' : 'Afdeling toevoegen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
