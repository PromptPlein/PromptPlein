import { useRef, useState, type FormEvent } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { requestPasswordReset } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from './AuthLayout';

export default function PasswordResetPage() {
  const { configured } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(emailRef, email, setEmail);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!configured) {
      notify.error('Versturen kan nu niet: er is geen backend ingesteld.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
      notify.success('Als dit adres bestaat, is er een herstelmail verstuurd.');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Versturen mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Wachtwoord vergeten"
      subtitle="We sturen je een link om je wachtwoord opnieuw in te stellen."
      footer={<nldd-link href="/auth/login" text="Terug naar inloggen"></nldd-link>}
    >
      {sent ? (
        <nldd-banner variant="success" size="sm" text="Controleer je inbox voor de herstellink."></nldd-banner>
      ) : (
        <nldd-form>
          <form onSubmit={submit}>
            <nldd-form-field label="E-mailadres">
              <nldd-text-field ref={emailRef} type="email" required autocomplete="email" name="email"></nldd-text-field>
            </nldd-form-field>
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button
                  appearance="primary"
                  type="submit"
                  text="Verstuur herstellink"
                  loading={busy || undefined}
                  loading-text="Bezig met versturen"
                ></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      )}
    </AuthLayout>
  );
}
