import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle } from '@/components/common/icons';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InfoDot from '@/components/common/InfoDot';
import { useAuth } from '@/context/AuthContext';
import { detectPii } from '@/services/guardrails';
import {
  loadPersonalInstruction,
  MAX_PERSONAL_INSTRUCTION_CHARS,
  savePersonalInstruction,
} from '@/services/personalInstructionService';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';

/**
 * Eigen instructie voor de chat. Staat op de server, en daarom is ingelogd zijn
 * een eis. De pagina meldt dat bewust niet: op verzoek van de eigenaar blijft de
 * tekst hier kort.
 */
export default function ChatInstructionSettings() {
  const { configured, loading: authLoading, isAuthenticated } = useAuth();
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fieldId = useId();

  const canEdit = !configured || isAuthenticated;

  useEffect(() => {
    if (authLoading || !canEdit) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    loadPersonalInstruction()
      .then((text) => {
        if (!active) return;
        setSaved(text);
        setDraft(text);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authLoading, canEdit]);

  const findings = useMemo(() => detectPii(draft), [draft]);
  const tooLong = draft.trim().length > MAX_PERSONAL_INSTRUCTION_CHARS;
  const dirty = draft.trim() !== saved;

  async function store(text: string, message: string) {
    setSaving(true);
    setStatus('');
    try {
      await savePersonalInstruction(text);
      const clean = text.trim();
      setSaved(clean);
      setDraft(clean);
      setStatus(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return null;

  if (!canEdit) {
    return (
      <section className={SECTION_CLASS} aria-labelledby="chat-instructie">
        <h2 id="chat-instructie" className={TITLE_CLASS}>
          Eigen instructie
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-200">
          Log in om de chat vaste wensen mee te geven.
        </p>
        <Link
          to="/auth/login"
          state={{ from: '/instellingen/chat' }}
          className="opl-btn-primary mt-4 inline-flex"
        >
          Inloggen
        </Link>
      </section>
    );
  }

  return (
    <section className={SECTION_CLASS} aria-labelledby="chat-instructie">
      <div className="flex items-center gap-1">
        <h2 id="chat-instructie" className={TITLE_CLASS}>
          Eigen instructie
        </h2>
        <InfoDot
          label="Uitleg over de eigen instructie"
          text="Komt bij de huisregels van PromptPlein en geldt in gewone chats, niet in projecten of bij het uitvoeren van een prompt."
        />
      </div>

      {loadFailed ? (
        <p role="alert" className="mt-4 text-slate-800 dark:text-slate-100">
          Je instructie kon niet worden opgehaald. Probeer het later opnieuw.
        </p>
      ) : (
        <div className="mt-4">
          <label className="opl-label" htmlFor={fieldId}>
            Jouw instructie
          </label>
          <textarea
            id={fieldId}
            className="opl-input min-h-[180px] resize-y"
            aria-busy={loading}
            disabled={loading}
            value={draft}
            maxLength={MAX_PERSONAL_INSTRUCTION_CHARS}
            placeholder="Bijvoorbeeld: Begin met de kern en geef hoogstens vijf punten."
            onChange={(e) => {
              setDraft(e.target.value);
              setStatus('');
            }}
          />
          {draft.length >= MAX_PERSONAL_INSTRUCTION_CHARS * 0.9 && (
            <p className="mt-1 text-right text-sm text-slate-600 dark:text-slate-300">
              {draft.trim().length.toLocaleString('nl-NL')} van{' '}
              {MAX_PERSONAL_INSTRUCTION_CHARS.toLocaleString('nl-NL')} tekens
            </p>
          )}

          {findings.length > 0 && (
            <p
              role="status"
              className="mt-2 flex gap-2 text-sm text-slate-800 dark:text-slate-100"
            >
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-rijksrood dark:text-red-400" />
              <span>
                Dit lijkt op een persoonsgegeven: {findings.map((f) => f.label).join(', ')}.
              </span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="opl-btn-primary"
              onClick={() => void store(draft, 'Instructie opgeslagen.')}
              disabled={loading || saving || !dirty || tooLong}
            >
              {saving ? 'Bezig…' : 'Opslaan'}
            </button>
            {saved && (
              <button
                type="button"
                className="opl-btn-ghost text-rijksrood dark:text-red-400"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                Verwijderen
              </button>
            )}
            <p role="status" className="text-sm text-slate-700 dark:text-slate-200">
              {status}
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Instructie verwijderen?"
        message="Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Verwijderen"
        destructive
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void store('', 'Instructie verwijderd.');
        }}
      />
    </section>
  );
}
