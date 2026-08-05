import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  // Kwam de gebruiker via RequireAuth (bijv. met een chat-handoff klaar in
  // sessionStorage)? Geef het oorspronkelijke doel dan door aan de loginpagina,
  // zodat registreren-in-plaats-van-inloggen de round-trip niet breekt.
  const from = (useLocation().state as { from?: string } | null)?.from;
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
      toast.error('Kies je ministerie.');
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
      navigate('/auth/login', { replace: true, state: from ? { from } : undefined });
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
          <Link
            to="/auth/login"
            state={from ? { from } : undefined}
            className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
          >
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

        {/* Ministerie — verplicht. Eén zoekveld waarmee de gebruiker het
            ministerie kiest waar hij/zij voor werkt. */}
        <div>
          <label className="opl-label" htmlFor="signup-org">
            Ministerie
          </label>
          <SearchableSelect
            id="signup-org"
            options={orgOptions}
            value={organizationId}
            onChange={setOrganizationId}
            disabled={orgsLoading || !configured}
            placeholder={orgsLoading ? 'Ministeries laden…' : 'Kies het ministerie waar je nu voor werkt'}
            searchPlaceholder="Zoek jouw ministerie…"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Kies het ministerie waar je nu voor werkt.
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
