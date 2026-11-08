import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { useNlddValue } from '@/lib/nldd';
import AuthLayout from './AuthLayout';

export default function LoginPage() {
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLElement & { value?: string }>(null);
  const passwordRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(emailRef, email, setEmail);
  useNlddValue(passwordRef, password, setPassword);

  const from = (location.state as { from?: string } | null)?.from;
  const redirectTo = from ?? '/';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!configured) {
      notify.error('Inloggen kan nu niet: er is geen backend ingesteld.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      notify.success('Welkom terug!');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Inloggen mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Inloggen"
      subtitle="Log in met je overheids-e-mailadres."
      footer={
        <>
          Nog geen account?{' '}
          {/* Pass the original destination on: whoever signs up first and
              then comes back to log in still lands where they were going. */}
          <nldd-link
            href="/auth/registreren"
            text="Registreren"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigate('/auth/registreren', { state: from ? { from } : undefined });
            }}
          ></nldd-link>
        </>
      }
    >
      {!configured && (
        <>
          <nldd-banner variant="warning" size="sm" text="Geen Supabase-backend geconfigureerd. Authenticatie is uitgeschakeld."></nldd-banner>
          <nldd-spacer size="16"></nldd-spacer>
        </>
      )}
      <nldd-form>
        <form onSubmit={submit}>
          <nldd-form-field label="E-mailadres">
            <nldd-text-field ref={emailRef} type="email" required autocomplete="email" name="email"></nldd-text-field>
          </nldd-form-field>
          <nldd-form-field label="Wachtwoord">
            <nldd-password-field ref={passwordRef} required autocomplete="current-password" name="password"></nldd-password-field>
            <nldd-form-field-help-text>
              <nldd-link href="/auth/wachtwoord-vergeten" size="sm" text="Wachtwoord vergeten?"></nldd-link>
            </nldd-form-field-help-text>
          </nldd-form-field>
          <nldd-form-actions>
            <nldd-button-group>
              <nldd-button
                appearance="primary"
                type="submit"
                text="Log in"
                loading={busy || undefined}
                loading-text="Bezig met inloggen"
              ></nldd-button>
            </nldd-button-group>
          </nldd-form-actions>
        </form>
      </nldd-form>
    </AuthLayout>
  );
}
