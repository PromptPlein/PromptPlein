import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { requestPasswordReset } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from './AuthLayout';

export default function PasswordResetPage() {
  const { configured } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
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
      footer={
        <Link to="/auth/login" className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300">
          Terug naar inloggen
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
          Controleer je inbox voor de herstellink.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            autoFocus
            required
            className="opl-input"
            placeholder="E-mailadres"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="opl-btn-primary w-full" disabled={busy || !configured}>
            {busy ? 'Bezig…' : 'Herstellink versturen'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
