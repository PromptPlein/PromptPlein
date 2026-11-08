import { useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import {
  deleteAllMemories,
  deleteMemory,
  loadMemories,
  memoryTokens,
  MEMORY_VECTOR_THRESHOLD_TOKENS,
} from '@/services/memoryService';
import type { UserMemory } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-section';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';

/**
 * Het geheugen van de chat: wat de gebruiker liet onthouden met "voortaan",
 * "onthoud dit" of "vanaf nu", als losse regels die hij kan verwijderen.
 *
 * De systeemprompt staat hier bewust niet: wie hem wil zien, vraagt het de chat.
 */
export default function ChatMemorySettings() {
  const { configured, loading: authLoading, isAuthenticated } = useAuth();
  const canUse = !configured || isAuthenticated;
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (authLoading || !canUse) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    loadMemories()
      .then((list) => {
        if (active) setMemories(list);
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
  }, [authLoading, canUse]);

  async function remove(memory: UserMemory) {
    setBusy(memory.id);
    try {
      await deleteMemory(memory.id);
      setMemories((list) => list.filter((m) => m.id !== memory.id));
      notify.success('Verwijderd.');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Verwijderen mislukt');
    } finally {
      setBusy(null);
    }
  }

  async function removeAll() {
    setBusy('all');
    try {
      await deleteAllMemories();
      setMemories([]);
      notify.success('Geheugen gewist.');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Wissen mislukt');
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) return null;

  if (!canUse) return null;

  return (
    <nldd-form>
      <form noValidate onSubmit={(e) => e.preventDefault()}>
        <nldd-form-section
          text="Geheugen"
          supporting-text="Zeg in de chat voortaan, onthoud dit of vanaf nu, dan komt je wens hier. Hij geldt in elke chat en elk project."
        >
          {loadFailed ? (
            <nldd-inline-dialog
              variant="alert"
              text="Je geheugen kon niet worden opgehaald. Probeer het later opnieuw."
            ></nldd-inline-dialog>
          ) : (
            <nldd-list appearance="box-tinted" accessible-label="Onthouden wensen">
              {!loading &&
                memories.map((memory) => (
                  <nldd-list-item key={memory.id}>
                    <nldd-text-cell text={memory.text}></nldd-text-cell>
                    <nldd-list-item-segment
                      button
                      accessible-label={`Verwijder: ${memory.text}`}
                      disabled={busy !== null || undefined}
                      onClick={() => void remove(memory)}
                    >
                      <nldd-icon-cell icon="trash" size="20" color="secondary"></nldd-icon-cell>
                    </nldd-list-item-segment>
                  </nldd-list-item>
                ))}
              <nldd-inline-dialog
                slot="empty"
                variant={loading ? 'loading' : undefined}
                text={loading ? 'Laden' : 'Nog niets onthouden.'}
              ></nldd-inline-dialog>
            </nldd-list>
          )}

          {!loading && memoryTokens(memories) > MEMORY_VECTOR_THRESHOLD_TOKENS && (
            <nldd-text size="sm" color="secondary">
              Je geheugen is groot. Per vraag gaan de wensen mee die erbij passen.
            </nldd-text>
          )}

          {memories.length > 1 && (
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button
                  appearance="critical-transparent"
                  start-icon="trash"
                  text="Verwijder alles"
                  disabled={busy !== null || undefined}
                  onClick={() => setConfirmAll(true)}
                ></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          )}
        </nldd-form-section>

        <ConfirmDialog
          open={confirmAll}
          title="Hele geheugen verwijderen?"
          message="Dit kan niet ongedaan worden gemaakt."
          confirmLabel="Verwijder alles"
          cancelLabel="Behoud geheugen"
          destructive
          onClose={() => setConfirmAll(false)}
          onConfirm={() => {
            setConfirmAll(false);
            void removeAll();
          }}
        />
      </form>
    </nldd-form>
  );
}
