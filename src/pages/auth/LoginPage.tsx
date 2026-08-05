import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from './AuthLayout';

export default function LoginPage() {
  const { signIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;
  const redirectTo = from ?? '/';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      toast.success('Welkom terug!');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Inloggen mislukt.');
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
          {/* Geef het oorspronkelijke doel (from) door: wie eerst registreert
              en dan terugkomt om in te loggen, landt alsnog waar hij heen wilde. */}
          <Link
            to="/auth/registreren"
            state={from ? { from } : undefined}
            className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
          >
            Registreren
          </Link>
        </>
      }
    >
      {!configured && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          Geen Supabase-backend geconfigureerd. Authenticatie is uitgeschakeld.
        </p>
      )}
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
        <input
          type="password"
          required
          className="opl-input"
          placeholder="Wachtwoord"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="opl-btn-primary w-full" disabled={busy || !configured}>
          {busy ? 'Bezig…' : 'Inloggen'}
        </button>
      </form>
      <div className="mt-3 text-right">
        <Link
          to="/auth/wachtwoord-vergeten"
          className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Wachtwoord vergeten?
        </Link>
      </div>
    </AuthLayout>
  );
}
