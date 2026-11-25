import { useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2 } from '@/components/common/icons';
import Modal from '@/components/common/Modal';
import { useAuth } from '@/context/AuthContext';
import { accountOverview, deleteOwnAccount, type AccountOverview } from '@/services/accountService';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';
const DANGER_CLASS = 'opl-btn bg-rijksrood text-white hover:bg-red-700 disabled:opacity-50';

function aantal(n: number, een: string, meer: string): string {
  return n === 1 ? `1 ${een}` : `${n.toLocaleString('nl-NL')} ${meer}`;
}

/**
 * Het eigen account verwijderen, met alles wat erbij hoort. De gebruiker typt
 * zijn e-mailadres over: verwijderen is niet terug te draaien.
 */
export default function AccountSettings() {
  const { configured, loading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldId = useId();

  useEffect(() => {
    if (!open) return;
    let active = true;
    accountOverview()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open]);

  if (authLoading) return null;

  if (!configured) {
    return (
      <section className={SECTION_CLASS} aria-labelledby="account-verwijderen">
        <h2 id="account-verwijderen" className={TITLE_CLASS}>
          Account
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-200">
          Deze versie draait zonder server en heeft geen accounts.
        </p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className={SECTION_CLASS} aria-labelledby="account-verwijderen">
        <h2 id="account-verwijderen" className={TITLE_CLASS}>
          Account
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-200">Log in om je account te beheren.</p>
        <Link
          to="/auth/login"
          state={{ from: '/instellingen/profiel' }}
          className="opl-btn-primary mt-4 inline-flex"
        >
          Inloggen
        </Link>
      </section>
    );
  }

  const email = (user?.email ?? '').trim().toLowerCase();
  const matches = email !== '' && typed.trim().toLowerCase() === email;

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError('');
  }

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteOwnAccount(typed.trim());
      toast.success('Je account is verwijderd.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Je account is niet verwijderd.');
      setBusy(false);
    }
  }

  return (
    <section className={SECTION_CLASS} aria-labelledby="account-verwijderen">
      <h2 id="account-verwijderen" className={TITLE_CLASS}>
        Account verwijderen
      </h2>
      <p className="mt-2 text-slate-700 dark:text-slate-200">
        Je account en alles wat je in PromptPlein hebt gemaakt, verdwijnt voorgoed.
      </p>
      <button type="button" className={`${DANGER_CLASS} mt-4 inline-flex items-center gap-2`} onClick={() => setOpen(true)}>
        <Trash2 size={18} aria-hidden="true" />
        Account verwijderen
      </button>

      <Modal open={open} onClose={close} title="Account verwijderen" size="max-w-md">
        <div className="space-y-4 text-slate-700 dark:text-slate-200">
          <p>Dit is niet terug te draaien. Weg gaan:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {overview ? aantal(overview.prompts, 'prompt', 'prompts') : 'Je prompts'}, ook als je ze met
              anderen hebt gedeeld
            </li>
            <li>
              {overview ? aantal(overview.projects, 'chatproject', 'chatprojecten') : 'Je chatprojecten'} met
              hun bronbestanden
            </li>
            <li>Je profiel, je eigen instructie en wat de chat over je heeft onthouden</li>
            <li>Je adres op de maillijst van PromptPlein</li>
          </ul>
          <p>
            Je chats staan in deze browser en niet bij je account. Die verwijder je in de chat zelf.
          </p>

          <div>
            <label className="opl-label" htmlFor={fieldId}>
              Typ je e-mailadres om te bevestigen
            </label>
            <input
              id={fieldId}
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              className="opl-input"
              value={typed}
              disabled={busy}
              onChange={(e) => {
                setTyped(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void remove();
              }}
            />
          </div>

          {error && (
            <p role="alert" className="font-medium text-rijksrood dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" className="opl-btn-secondary" onClick={close} disabled={busy}>
            Annuleren
          </button>
          <button
            type="button"
            className={DANGER_CLASS}
            disabled={!matches || busy}
            aria-busy={busy}
            onClick={() => void remove()}
          >
            {busy ? 'Bezig met verwijderen…' : 'Definitief verwijderen'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
