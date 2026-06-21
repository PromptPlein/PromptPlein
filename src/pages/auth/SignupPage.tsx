import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { buildOrgOptions, orgOptionToSearchable } from '@/lib/orgTree';
import SearchableSelect from '@/components/common/SearchableSelect';
import AuthLayout from './AuthLayout';

export default function SignupPage() {
  const { signUp, configured } = useAuth();
  const { organizations, loading: orgsLoading } = useReferenceData();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // De gekozen organisatie/afdeling: kies de diepste eenheid, dan ben je
  // automatisch verbonden met alle lagen daarboven (ministerie, dienst …).
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const orgOptions = useMemo(
    () => buildOrgOptions(organizations).map(orgOptionToSearchable),
    [organizations],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      toast.error('Kies een wachtwoord van minimaal 8 tekens.');
      return;
    }
    if (!organizationId) {
      toast.error('Kies je organisatie of afdeling.');
      return;
    }
    setBusy(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
        organizationId,
      });
      toast.success('Account aangemaakt. Controleer je e-mail om te bevestigen.');
      navigate('/auth/login', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registreren mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Registreren"
      subtitle="Maak een account aan om prompts te delen en samen te werken."
      footer={
        <>
          Al een account?{' '}
          <Link to="/auth/login" className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300">
            Inloggen
          </Link>
        </>
      }
    >
      {!configured && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          Geen Supabase-backend geconfigureerd. Registratie is uitgeschakeld.
        </p>
      )}
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          autoFocus
          className="opl-input"
          placeholder="Volledige naam"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <input
          type="email"
          required
          className="opl-input"
          placeholder="E-mailadres"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={8}
          className="opl-input"
          placeholder="Wachtwoord (min. 8 tekens)"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Organisatie/afdeling — verplicht. Eén zoekveld: kies je afdeling en je
            bent automatisch verbonden met alle lagen erboven. */}
        <div>
          <label className="opl-label" htmlFor="signup-org">
            Organisatie of afdeling
          </label>
          <SearchableSelect
            id="signup-org"
            options={orgOptions}
            value={organizationId}
            onChange={setOrganizationId}
            disabled={orgsLoading || !configured}
            placeholder={orgsLoading ? 'Organisaties laden…' : 'Zoek je afdeling, dienst of ministerie'}
            searchPlaceholder="Zoek bijv. op je afdeling of dienst (zoals “DUO”)…"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Kies de eenheid waar je werkt. Je wordt automatisch gekoppeld aan het ministerie en de
            tussenliggende lagen.
          </p>
        </div>

        <button
          type="submit"
          className="opl-btn-primary w-full"
          disabled={busy || !configured || !organizationId}
        >
          {busy ? 'Bezig…' : 'Account aanmaken'}
        </button>
      </form>
    </AuthLayout>
  );
}
