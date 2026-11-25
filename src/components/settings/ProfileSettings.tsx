import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { updateOwnProfile } from '@/services/authService';
import { APP_ROLE_LABELS } from '@/services/orgService';

/**
 * De eigen gegevens: e-mailadres, rol en naam. Staat bij Instellingen, Profiel.
 * Afdeling en functie staan sinds 25-11-2026 niet meer in beeld; wat er op het
 * profiel staat blijft ongemoeid, voor de stand op branch stand-25-11-2026.
 */
export default function ProfileSettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [saving, setSaving] = useState(false);

  // Alleen bij een ander profiel overnemen: het ververst het profiel en mag de rest
  // van wat je aan het invullen bent niet wissen.
  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateOwnProfile(user.id, {
        full_name: fullName.trim() || null,
      });
      await refreshProfile();
      toast.success('Profiel opgeslagen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <section className="opl-card space-y-4 p-5 sm:p-6" aria-labelledby="profiel-gegevens">
      <h2
        id="profiel-gegevens"
        className="text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200"
      >
        Gegevens
      </h2>
      <div>
        <label className="opl-label" htmlFor="profile-email">
          E-mailadres
        </label>
        <input
          id="profile-email"
          className="opl-input bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400"
          value={user?.email ?? ''}
          disabled
        />
      </div>

      <div>
        <label className="opl-label" htmlFor="profile-role">
          Rol
        </label>
        <input
          id="profile-role"
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

      <div className="flex justify-end">
        <button className="opl-btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>
    </section>
  );
}
