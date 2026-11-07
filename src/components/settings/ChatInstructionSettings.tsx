import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Server } from '@/components/common/icons';
import ConfirmDialog from '@/components/common/ConfirmDialog';
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
 * Eigen instructie voor de chat. Dit is de enige chatinstelling die op de server
 * staat, en daarom is ingelogd zijn een eis. Dat de tekst daar staat, staat
 * zichtbaar boven het veld en niet achter een infobolletje: gesprekken blijven
 * juist op het apparaat, dus de gebruiker mag dat verschil niet missen.
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
  const hintId = useId();

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
          Geef de chat vaste wensen mee, zoals je functie of de vorm van je antwoorden. Daarvoor heb
          je een account nodig, want de instructie wordt op de server opgeslagen.
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
      <h2 id="chat-instructie" className={TITLE_CLASS}>
        Eigen instructie
      </h2>
      <p className="mt-2 text-slate-700 dark:text-slate-200">
        Vaste wensen voor elk antwoord in een gewone chat. De huisregels van PromptPlein blijven
        gelden. In een project telt de projectinstructie en bij het uitvoeren van een prompt de
        prompt zelf.
      </p>

      {configured ? (
        <div
          id={hintId}
          className="mt-4 flex gap-3 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/70 p-3 text-sm text-slate-800 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10 dark:text-slate-100"
        >
          <Server size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-rijksblauw-700 dark:text-rijksblauw-200" />
          <div className="space-y-1">
            <p className="font-semibold">Deze instructie wordt op de server opgeslagen</p>
            <p>
              Hij staat bij je account, zodat hij op elk apparaat werkt. In PromptPlein kun alleen
              jij hem lezen. Hij gaat bij elke vraag mee naar het AI-model, dus zet er geen
              persoonsgegevens in. Je gesprekken blijven gewoon op dit apparaat.
            </p>
          </div>
        </div>
      ) : (
        <p id={hintId} className="mt-4 text-sm text-slate-700 dark:text-slate-200">
          Er is geen server gekoppeld, dus de instructie blijft in deze browser.
        </p>
      )}

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
            aria-describedby={hintId}
            aria-busy={loading}
            disabled={loading}
            value={draft}
            maxLength={MAX_PERSONAL_INSTRUCTION_CHARS}
            placeholder="Bijvoorbeeld: Ik ben beleidsadviseur. Begin elk antwoord met de kern en geef daarna hoogstens vijf punten."
            onChange={(e) => {
              setDraft(e.target.value);
              setStatus('');
            }}
          />
          <p className="mt-1 text-right text-sm text-slate-600 dark:text-slate-300">
            {draft.trim().length.toLocaleString('nl-NL')} van{' '}
            {MAX_PERSONAL_INSTRUCTION_CHARS.toLocaleString('nl-NL')} tekens
          </p>

          {findings.length > 0 && (
            <p
              role="status"
              className="mt-2 flex gap-2 text-sm text-slate-800 dark:text-slate-100"
            >
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-rijksrood dark:text-red-400" />
              <span>
                Dit lijkt op een persoonsgegeven: {findings.map((f) => f.label).join(', ')}. Haal
                het weg voordat je opslaat.
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
        message={
          configured
            ? 'De instructie wordt van de server gewist. Nieuwe vragen gaan daarna zonder jouw wensen naar de chat.'
            : 'De instructie wordt uit deze browser gewist.'
        }
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
