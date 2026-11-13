import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { createDepartment } from '@/services/orgService';
import { departmentsUnder, listMinistries, ministryOf } from '@/lib/orgTree';
import SearchableSelect from '@/components/common/SearchableSelect';
import InfoDot from '@/components/common/InfoDot';

/**
 * Eerst het ministerie, dan de afdeling. De waarde is de afdeling als die er is,
 * anders het ministerie: zo hangt een profiel altijd aan de diepste eenheid.
 *
 * Met `allowCreate` voegt een ingelogde gebruiker zelf een afdeling toe, zonder
 * goedkeuring. Die verschijnt meteen voor iedereen in de lijst.
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
  const [creating, setCreating] = useState(false);

  const ministryId = value ? (ministryOf(value, organizations)?.id ?? null) : null;
  const departmentId = value && value !== ministryId ? value : null;

  const ministryOptions = useMemo(
    () => listMinistries(organizations).map((o) => ({ id: o.id, label: o.name })),
    [organizations],
  );
  const departmentOptions = useMemo(
    () =>
      ministryId
        ? departmentsUnder(ministryId, organizations).map((o) => ({ id: o.id, label: o.name }))
        : [],
    [ministryId, organizations],
  );

  async function addDepartment(name: string) {
    if (!ministryId || creating) return;
    setCreating(true);
    try {
      const created = await createDepartment(ministryId, name);
      await refresh();
      onChange(created.id);
      await onCreated?.(created.id);
      toast.success(`Afdeling “${created.name}” toegevoegd.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Afdeling toevoegen mislukt.');
    } finally {
      setCreating(false);
    }
  }

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
          onChange={onChange}
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
                ? "Collega's in dezelfde afdeling zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Typ de naam en voeg hem toe."
                : "Collega's in dezelfde afdeling zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Voeg hem na het registreren toe bij je profiel."
            }
          />
        </div>
        <SearchableSelect
          id={`${idPrefix}-afdeling`}
          options={departmentOptions}
          value={departmentId}
          onChange={(id) => onChange(id ?? ministryId)}
          disabled={disabled || !ministryId || creating}
          placeholder={
            !ministryId ? 'Kies eerst een ministerie' : creating ? 'Toevoegen…' : 'Kies je afdeling'
          }
          clearLabel="Geen afdeling"
          searchPlaceholder={allowCreate ? 'Zoek of typ je afdeling' : 'Zoek je afdeling'}
          onRequestNew={allowCreate ? (term) => void addDepartment(term) : undefined}
          requestNewLabel={(term) => `“${term}” als afdeling toevoegen`}
        />
      </div>
    </div>
  );
}
