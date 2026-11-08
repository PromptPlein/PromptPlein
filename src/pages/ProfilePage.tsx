import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { updateOwnProfile } from '@/services/authService';
import { APP_ROLE_LABELS } from '@/services/orgService';
import { requestFunction } from '@/services/functionRequestService';
import { buildOrgOptions, orgOptionToSearchable } from '@/lib/orgTree';
import SearchableSelect from '@/components/common/SearchableSelect';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { roles, organizations } = useReferenceData();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [orgId, setOrgId] = useState<string | null>(profile?.organization_id ?? null);
  const [functionId, setFunctionId] = useState<string | null>(profile?.function_id ?? null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(nameRef, fullName, setFullName);

  // Zelfde pad-gebaseerde keuzelijst als bij registratie: kies je afdeling/dienst
  // en je bent automatisch gekoppeld aan het ministerie erboven.
  const orgOptions = useMemo(
    () => buildOrgOptions(organizations).map(orgOptionToSearchable),
    [organizations],
  );

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setOrgId(profile?.organization_id ?? null);
    setFunctionId(profile?.function_id ?? null);
  }, [profile]);

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    try {
      await updateOwnProfile(user.id, {
        full_name: fullName.trim() || null,
        organization_id: orgId || null,
        function_id: functionId,
      });
      await refreshProfile();
      notify.success('Profiel opgeslagen');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <nldd-simple-section>
      <nldd-title
        slot="header"
        heading-level={1}
        size={2}
        text="Mijn profiel"
        supporting-text="Beheer je gegevens en organisatie."
      ></nldd-title>
      <nldd-container max-width="42rem">
          <nldd-text size="sm" color="secondary">
            {user?.email ?? ''}
            {profile ? ` · ${APP_ROLE_LABELS[profile.role]}` : ''}. Rollen worden door een beheerder toegekend.
          </nldd-text>
          <nldd-spacer size="24"></nldd-spacer>
          <nldd-form>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >

              <nldd-form-field label="Volledige naam">
                <nldd-text-field ref={nameRef} placeholder="Voor- en achternaam" autocomplete="name"></nldd-text-field>
              </nldd-form-field>

              <nldd-form-field label="Organisatie of afdeling">
                <SearchableSelect
                  id="profile-org"
                  options={orgOptions}
                  value={orgId}
                  onChange={setOrgId}
                  placeholder="Zoek je afdeling, dienst of ministerie"
                  clearLabel="Geen organisatie"
                  searchPlaceholder="Zoek bijv. op je afdeling of dienst (zoals “DUO”)…"
                />
                <nldd-form-field-help-text>
                  Kies de eenheid waar je werkt; je wordt automatisch gekoppeld aan het ministerie en de
                  tussenliggende lagen.
                </nldd-form-field-help-text>
              </nldd-form-field>

              <nldd-form-field label="Mijn functie">
                <SearchableSelect
                  id="profile-function"
                  options={roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))}
                  value={functionId}
                  onChange={setFunctionId}
                  placeholder="Kies je functie…"
                  clearLabel="Geen functie"
                  searchPlaceholder="Zoek je functie…"
                  onRequestNew={async (term) => {
                    if (!user) return;
                    try {
                      await requestFunction({ name: term, requestedBy: user.id });
                      notify.success(`Aanvraag voor “${term}” verstuurd; een beheerder beoordeelt hem.`);
                    } catch (err) {
                      notify.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
                    }
                  }}
                  requestNewLabel={(term) => `“${term}” als nieuwe functie aanvragen`}
                />
                <nldd-form-field-help-text>
                  Zo vinden collega&apos;s met dezelfde functie elkaars prompts makkelijker terug.
                </nldd-form-field-help-text>
              </nldd-form-field>

              <nldd-form-actions>
                <nldd-button-group>
                  <nldd-button
                    appearance="primary"
                    type="submit"
                    text="Bewaar"
                    loading={saving || undefined}
                    loading-text="Bezig met opslaan"
                  ></nldd-button>
                </nldd-button-group>
              </nldd-form-actions>
            </form>
          </nldd-form>
      </nldd-container>
    </nldd-simple-section>
  );
}
