import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { updatePassword, verifyRecoveryToken } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from './AuthLayout';

const MIN_LENGTH = 8;

/**
 * Stelt een nieuw wachtwoord in. De herstelmail uit Brevo (edge function
 * auth-email) linkt hierheen met `?token_hash=…&type=recovery`; die token wordt
 * pas bij Opslaan ingewisseld, zodat een mailscanner die de link opent hem niet
 * opmaakt. Oudere links komen binnen met een sessie in de hash, die supabase-js
 * zelf oppakt (detectSessionInUrl).
 */
export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { configured, loading, isAuthenticated } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [expired, setExpired] = useState(false);

  const tokenHash = searchParams.get('type') === 'recovery' ? searchParams.get('token_hash') : null;

  // Geef supabase-js even de tijd om een sessie uit de URL-hash te verwerken.
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrace(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const ready = isAuthenticated || Boolean(tokenHash);
  const noToken =
    expired || (configured && !loading && !grace && !isAuthenticated && !tokenHash);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_LENGTH) {
      toast.error(`Gebruik minstens ${MIN_LENGTH} tekens.`);
      return;
    }
    if (password !== confirm) {
      toast.error('De wachtwoorden komen niet overeen.');
      return;
    }
    setBusy(true);
    try {
      if (tokenHash && !verified) {
        try {
          await verifyRecoveryToken(tokenHash);
          setVerified(true);
        } catch {
          setExpired(true);
          return;
        }
      }
      await updatePassword(password);
      toast.success('Wachtwoord opgeslagen. Je bent ingelogd.');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Nieuw wachtwoord instellen"
      subtitle="Kies een nieuw wachtwoord voor je account."
      footer={
        <Link to="/auth/login" className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300">
          Terug naar inloggen
        </Link>
      }
    >
      {noToken ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {expired
              ? 'Deze link is verlopen of al gebruikt. Vraag een nieuwe herstelmail aan en gebruik de nieuwste link.'
              : 'Geen geldige herstellink gevonden. Vraag een nieuwe herstelmail aan en open de link opnieuw.'}
          </p>
          <Link to="/auth/wachtwoord-vergeten" className="opl-btn-primary w-full">
            Nieuwe herstellink aanvragen
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              autoFocus
              required
              className="opl-input pr-10"
              placeholder="Nieuw wachtwoord"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={show ? 'Verberg wachtwoord' : 'Toon wachtwoord'}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <input
            type={show ? 'text' : 'password'}
            required
            className="opl-input"
            placeholder="Herhaal nieuw wachtwoord"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">Minstens {MIN_LENGTH} tekens.</p>
          <button type="submit" className="opl-btn-primary w-full" disabled={busy || !ready}>
            {busy ? 'Bezig…' : ready ? 'Wachtwoord opslaan' : 'Herstellink controleren…'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
