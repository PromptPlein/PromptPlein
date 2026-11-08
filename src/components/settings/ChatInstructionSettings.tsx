import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import { detectPii } from '@/services/guardrails';
import {
  loadPersonalInstruction,
  MAX_PERSONAL_INSTRUCTION_CHARS,
  savePersonalInstruction,
} from '@/services/personalInstructionService';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/form-section';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/multi-line-text-field';

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const fieldRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(fieldRef, draft, (text) => {
    setDraft(text);
  });

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
    try {
      await savePersonalInstruction(text);
      const clean = text.trim();
      setSaved(clean);
      setDraft(clean);
      notify.success(message);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return null;

  const SUPPORT = 'Geldt in gewone chats, niet in projecten of bij het uitvoeren van een prompt.';

  if (!canEdit) {
    return (
      <nldd-form>
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <nldd-form-section text="Eigen instructie" supporting-text="Log in om de chat vaste wensen mee te geven.">
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button
                  appearance="primary"
                  text="Inloggen"
                  href="/auth/login"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/auth/login', { state: { from: '/instellingen/chat' } });
                  }}
                ></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </nldd-form-section>
        </form>
      </nldd-form>
    );
  }

  return (
    <nldd-form>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (loading) return;
          if (tooLong) {
            notify.error(`Je instructie is te lang. Hooguit ${MAX_PERSONAL_INSTRUCTION_CHARS.toLocaleString('nl-NL')} tekens.`);
            return;
          }
          if (!dirty) {
            notify('Er is niets veranderd om te bewaren.');
            return;
          }
          void store(draft, 'Instructie opgeslagen.');
        }}
      >
        <nldd-form-section text="Eigen instructie" supporting-text={SUPPORT}>
          {loadFailed ? (
            <nldd-inline-dialog
              variant="alert"
              text="Je instructie kon niet worden opgehaald. Probeer het later opnieuw."
            ></nldd-inline-dialog>
          ) : (
            <>
              <nldd-form-field label="Jouw instructie">
                <nldd-multi-line-text-field
                  ref={fieldRef}
                  rows={6}
                  disabled={loading || undefined}
                  maxlength={String(MAX_PERSONAL_INSTRUCTION_CHARS)}
                  placeholder="Bijvoorbeeld: Begin met de kern en geef hoogstens vijf punten."
                ></nldd-multi-line-text-field>
                {draft.length >= MAX_PERSONAL_INSTRUCTION_CHARS * 0.9 && (
                  <nldd-form-field-help-text>
                    {draft.trim().length.toLocaleString('nl-NL')} van{' '}
                    {MAX_PERSONAL_INSTRUCTION_CHARS.toLocaleString('nl-NL')} tekens
                  </nldd-form-field-help-text>
                )}
              </nldd-form-field>

              {findings.length > 0 && (
                <nldd-banner
                  variant="warning"
                  size="sm"
                  text={`Dit lijkt op een persoonsgegeven: ${findings.map((f) => f.label).join(', ')}.`}
                ></nldd-banner>
              )}

              <nldd-form-actions>
                <nldd-button-group>
                  <nldd-button
                    appearance="primary"
                    type="submit"
                    text="Bewaar instructie"
                    loading={saving || undefined}
                    loading-text="Bezig met opslaan"
                  ></nldd-button>
                  {saved && (
                    <nldd-button
                      appearance="critical-transparent"
                      start-icon="trash"
                      text="Verwijder instructie"
                      disabled={saving || undefined}
                      onClick={() => setConfirmDelete(true)}
                    ></nldd-button>
                  )}
                </nldd-button-group>
              </nldd-form-actions>
            </>
          )}
        </nldd-form-section>

        <ConfirmDialog
          open={confirmDelete}
          title="Instructie verwijderen?"
          message="Dit kan niet ongedaan worden gemaakt."
          confirmLabel="Verwijder instructie"
          cancelLabel="Behoud instructie"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void store('', 'Instructie verwijderd.');
          }}
        />
      </form>
    </nldd-form>
  );
}
