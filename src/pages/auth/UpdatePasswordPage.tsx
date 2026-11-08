import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { updatePassword } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from './AuthLayout';

const MIN_LENGTH = 8;

/**
 * Stelt een nieuw wachtwoord in op basis van het recovery-token in de URL.
 * supabase-js leest dat token automatisch uit de hash (detectSessionInUrl),
 * waardoor er tijdelijk een sessie ontstaat waarmee updateUser() mag.
 */
export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const { configured, loading, isAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLElement & { value?: string }>(null);
  const confirmRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(passwordRef, password, setPassword);
  useNlddValue(confirmRef, confirm, setConfirm);

  // Geef supabase-js even de tijd om het recovery-token uit de URL te verwerken.
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const ready = isAuthenticated;
  const noToken = configured && !loading && !grace && !isAuthenticated;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!ready) {
      notify.error('De herstellink wordt nog gecontroleerd. Probeer het zo opnieuw.');
      return;
    }
    if (password.length < MIN_LENGTH) {
      notify.error(`Gebruik minstens ${MIN_LENGTH} tekens.`);
      return;
    }
    if (password !== confirm) {
      notify.error('De wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      notify.success('Wachtwoord bijgewerkt. Je kunt nu inloggen.');
      navigate('/auth/login', { replace: true });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Bijwerken mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Nieuw wachtwoord instellen"
      subtitle="Kies een nieuw wachtwoord voor je account."
      footer={<nldd-link href="/auth/login" text="Terug naar inloggen"></nldd-link>}
    >
      {noToken ? (
        <>
          <nldd-banner
            variant="warning"
            size="sm"
            text="Geen geldige herstellink gevonden. Vraag een nieuwe herstelmail aan en open de link opnieuw."
          ></nldd-banner>
          <nldd-spacer size="16"></nldd-spacer>
          <nldd-button
            appearance="primary"
            href="/auth/wachtwoord-vergeten"
            text="Nieuwe herstellink aanvragen"
          ></nldd-button>
        </>
      ) : (
        <nldd-form>
          <form onSubmit={submit}>
            <nldd-form-field label="Nieuw wachtwoord">
              <nldd-password-field
                ref={passwordRef}
                required
                autocomplete="new-password"
                name="password"
                minlength={String(MIN_LENGTH)}
              ></nldd-password-field>
              <nldd-form-field-help-text>Minstens {MIN_LENGTH} tekens.</nldd-form-field-help-text>
            </nldd-form-field>
            <nldd-form-field label="Herhaal nieuw wachtwoord">
              <nldd-password-field ref={confirmRef} required autocomplete="new-password" name="confirm"></nldd-password-field>
            </nldd-form-field>
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button
                  appearance="primary"
                  type="submit"
                  text="Bewaar wachtwoord"
                  loading={busy || !ready || undefined}
                  loading-text={busy ? 'Bezig met opslaan' : 'Herstellink controleren'}
                ></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      )}
    </AuthLayout>
  );
}
