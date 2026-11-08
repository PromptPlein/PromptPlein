import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2 } from '@/components/common/icons';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InfoDot from '@/components/common/InfoDot';
import { useAuth } from '@/context/AuthContext';
import {
  deleteAllMemories,
  deleteMemory,
  loadMemories,
  memoryTokens,
  MEMORY_VECTOR_THRESHOLD_TOKENS,
} from '@/services/memoryService';
import type { UserMemory } from '@/types';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';

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
  const [status, setStatus] = useState('');
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
    setStatus('');
    try {
      await deleteMemory(memory.id);
      setMemories((list) => list.filter((m) => m.id !== memory.id));
      setStatus('Verwijderd.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verwijderen mislukt');
    } finally {
      setBusy(null);
    }
  }

  async function removeAll() {
    setBusy('all');
    setStatus('');
    try {
      await deleteAllMemories();
      setMemories([]);
      setStatus('Geheugen gewist.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Wissen mislukt');
    } finally {
      setBusy(null);
    }
  }

  if (authLoading) return null;

  return (
    <>
      {canUse && (
        <section className={SECTION_CLASS} aria-labelledby="chat-geheugen">
          <div className="flex items-center gap-1">
            <h2 id="chat-geheugen" className={TITLE_CLASS}>
              Geheugen
            </h2>
            <InfoDot
              label="Uitleg over het geheugen"
              text="Zeg in de chat voortaan, onthoud dit of vanaf nu, dan komt je wens hier. Je wensen gaan voor op de regels van PromptPlein, in elke chat en elk project. Niet bij het uitvoeren van een prompt."
            />
          </div>

          {loadFailed ? (
            <p role="alert" className="mt-4 text-slate-800 dark:text-slate-100">
              Je geheugen kon niet worden opgehaald. Probeer het later opnieuw.
            </p>
          ) : loading ? (
            <p className="mt-4 text-slate-600 dark:text-slate-300" aria-busy="true">
              Laden…
            </p>
          ) : memories.length === 0 ? (
            <p className="mt-4 text-slate-700 dark:text-slate-200">Nog niets onthouden.</p>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {memories.map((memory) => (
                  <li
                    key={memory.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
                  >
                    <span className="min-w-0 flex-1 break-words text-slate-800 dark:text-slate-100">
                      {memory.text}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksrood dark:hover:bg-slate-700"
                      onClick={() => void remove(memory)}
                      disabled={busy !== null}
                      aria-label={`Verwijder: ${memory.text}`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {memoryTokens(memories) > MEMORY_VECTOR_THRESHOLD_TOKENS && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Je geheugen is groot. Per vraag gaan de wensen mee die erbij passen.
                </p>
              )}
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {memories.length > 1 && (
              <button
                type="button"
                className="opl-btn-ghost text-rijksrood dark:text-red-400"
                onClick={() => setConfirmAll(true)}
                disabled={busy !== null}
              >
                Alles verwijderen
              </button>
            )}
            <p role="status" className="text-sm text-slate-700 dark:text-slate-200">
              {status}
            </p>
          </div>

          <ConfirmDialog
            open={confirmAll}
            title="Hele geheugen verwijderen?"
            message="Dit kan niet ongedaan worden gemaakt."
            confirmLabel="Verwijderen"
            destructive
            onClose={() => setConfirmAll(false)}
            onConfirm={() => {
              setConfirmAll(false);
              void removeAll();
            }}
          />
        </section>
      )}
    </>
  );
}
