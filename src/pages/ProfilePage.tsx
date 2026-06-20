import { useEffect, useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { updateOwnProfile } from '@/services/authService';
import { listOrganizations, APP_ROLE_LABELS } from '@/services/orgService';
import { requestFunction } from '@/services/functionRequestService';
import SearchableSelect from '@/components/common/SearchableSelect';
import type { Organization } from '@/types';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { roles } = useReferenceData();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [orgId, setOrgId] = useState<string>(profile?.organization_id ?? '');
  const [functionId, setFunctionId] = useState<string | null>(profile?.function_id ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listOrganizations().then(setOrgs).catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setOrgId(profile?.organization_id ?? '');
    setFunctionId(profile?.function_id ?? null);
  }, [profile]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateOwnProfile(user.id, {
        full_name: fullName.trim() || null,
        organization_id: orgId || null,
        function_id: functionId,
      });
      await refreshProfile();
      toast.success('Profiel opgeslagen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
          <UserCircle2 size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Mijn profiel</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Beheer je gegevens en organisatie.</p>
        </div>
      </div>

      <div className="opl-card space-y-4 p-5">
        <div>
          <label className="opl-label">E-mailadres</label>
          <input className="opl-input bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400" value={user?.email ?? ''} disabled />
        </div>

        <div>
          <label className="opl-label">Rol</label>
          <input
            className="opl-input bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
            value={profile ? APP_ROLE_LABELS[profile.role] : ''}
            disabled
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Rollen worden door een beheerder toegekend.
          </p>
        </div>

        <div>
          <label className="opl-label">Volledige naam</label>
          <input
            className="opl-input"
            placeholder="Voor- en achternaam"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label className="opl-label">Organisatie</label>
          <select className="opl-input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">— Geen organisatie —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="opl-label" htmlFor="profile-function">Mijn functie</label>
          <SearchableSelect
            id="profile-function"
            options={roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))}
            value={functionId}
            onChange={setFunctionId}
            placeholder="Kies je functie…"
            clearLabel="— Geen functie —"
            searchPlaceholder="Zoek je functie…"
            onRequestNew={async (term) => {
              if (!user) return;
              try {
                await requestFunction({ name: term, requestedBy: user.id });
                toast.success(`Aanvraag voor “${term}” verstuurd — een beheerder beoordeelt hem.`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
              }
            }}
            requestNewLabel={(term) => `“${term}” als nieuwe functie aanvragen`}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Zo vinden collega&apos;s met dezelfde functie elkaars prompts makkelijker terug.
          </p>
        </div>

        <div className="flex justify-end">
          <button className="opl-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}
