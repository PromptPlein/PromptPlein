import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
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
  const nameRef = useRef<HTMLElement & { value?: string }>(null);
  const emailRef = useRef<HTMLElement & { value?: string }>(null);
  const passwordRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(nameRef, fullName, setFullName);
  useNlddValue(emailRef, email, setEmail);
  useNlddValue(passwordRef, password, setPassword);

  const orgOptions = useMemo(
    () => buildOrgOptions(organizations).map(orgOptionToSearchable),
    [organizations],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!configured) {
      notify.error('Registreren kan nu niet: er is geen backend ingesteld.');
      return;
    }
    if (password.length < 8) {
      notify.error('Kies een wachtwoord van minimaal 8 tekens.');
      return;
    }
    if (!organizationId) {
      notify.error('Kies je ministerie.');
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
      notify.success('Account aangemaakt. Controleer je e-mail om te bevestigen.');
      navigate('/auth/login', { replace: true, state: from ? { from } : undefined });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Registreren mislukt.');
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
          {/* Pass the original destination on, so the round trip through
              signup still lands where the user was going. */}
          <nldd-link
            href="/auth/login"
            text="Inloggen"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigate('/auth/login', { state: from ? { from } : undefined });
            }}
          ></nldd-link>
        </>
      }
    >
      {!configured && (
        <>
          <nldd-banner variant="warning" size="sm" text="Geen Supabase-backend geconfigureerd. Registratie is uitgeschakeld."></nldd-banner>
          <nldd-spacer size="16"></nldd-spacer>
        </>
      )}
      <nldd-form>
        <form onSubmit={submit}>
          <nldd-form-field label="Volledige naam" optional>
            <nldd-text-field ref={nameRef} autocomplete="name" name="name"></nldd-text-field>
          </nldd-form-field>
          <nldd-form-field label="E-mailadres">
            <nldd-text-field ref={emailRef} type="email" required autocomplete="email" name="email"></nldd-text-field>
          </nldd-form-field>
          <nldd-form-field label="Wachtwoord">
            <nldd-password-field
              ref={passwordRef}
              required
              minlength="8"
              autocomplete="new-password"
              name="password"
            ></nldd-password-field>
            <nldd-form-field-help-text>Minimaal 8 tekens.</nldd-form-field-help-text>
          </nldd-form-field>
          <nldd-form-field label="Ministerie">
            <SearchableSelect
              id="signup-org"
              options={orgOptions}
              value={organizationId}
              onChange={setOrganizationId}
              disabled={orgsLoading || !configured}
              placeholder={orgsLoading ? 'Ministeries laden…' : 'Kies het ministerie waar je nu voor werkt'}
              searchPlaceholder="Zoek jouw ministerie…"
            />
            <nldd-form-field-help-text>Kies het ministerie waar je nu voor werkt.</nldd-form-field-help-text>
          </nldd-form-field>
          <nldd-form-actions>
            <nldd-button-group>
              <nldd-button
                appearance="primary"
                type="submit"
                text="Maak account aan"
                loading={busy || undefined}
                loading-text="Bezig met registreren"
              ></nldd-button>
            </nldd-button-group>
          </nldd-form-actions>
        </form>
      </nldd-form>
    </AuthLayout>
  );
}
