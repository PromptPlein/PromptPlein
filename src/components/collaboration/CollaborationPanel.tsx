import { useEffect, useState } from 'react';
import {
  Send,
  Check,
  X,
  MessageSquare,
  History,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import {
  addComment,
  decide,
  deleteComment,
  listComments,
  listVersions,
  submitForApproval,
  PROMPT_STATUS_META,
} from '@/services/collaborationService';
import type { Prompt, PromptComment, PromptVersion } from '@/types';

/**
 * Reacties (comments) zijn uitgeschakeld: prompts zijn alleen te raadplegen en
 * te liken, niet te becommentariëren (dat zou moderatie vragen). Bestaande
 * reacties blijven in de database bewaard. Zet op `true` om de functie weer aan
 * te zetten — dan verschijnt het reactie-blok en worden reacties weer geladen.
 */
const COMMENTS_ENABLED = false;

function authorName(profile?: { full_name?: string | null; email?: string } | null): string {
  return profile?.full_name || profile?.email || 'Gebruiker';
}

export default function CollaborationPanel({
  prompt,
  onUpdated,
  refreshKey,
}: {
  prompt: Prompt;
  onUpdated: (p: Prompt) => void;
  /** Verhoog deze waarde om versies/reacties opnieuw te laden (bijv. na opslaan). */
  refreshKey?: number;
}) {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [comments, setComments] = useState<PromptComment[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [newComment, setNewComment] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [openVersion, setOpenVersion] = useState<string | null>(null);

  const status = prompt.status ?? 'approved';
  const statusMeta = PROMPT_STATUS_META[status];

  const isOwner = !!user && prompt.created_by_user === user.id;
  const canEdit = isAdmin || isOwner;

  async function reload() {
    try {
      const [m, v] = await Promise.all([
        COMMENTS_ENABLED ? listComments(prompt.id) : Promise.resolve([]),
        listVersions(prompt.id),
      ]);
      setComments(m);
      setVersions(v);
    } catch {
      /* niet-blokkerend */
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.id, refreshKey]);

  async function handleSubmit() {
    setBusy(true);
    try {
      onUpdated(await submitForApproval(prompt.id));
      toast.success('Ingediend ter goedkeuring');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Indienen mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(decision: 'approved' | 'rejected') {
    if (!user) return;
    setBusy(true);
    try {
      onUpdated(await decide(prompt.id, decision, user.id, note));
      setNote('');
      toast.success(decision === 'approved' ? 'Goedgekeurd' : 'Afgewezen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Beslissing mislukt');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddComment() {
    if (!user || !newComment.trim()) return;
    setBusy(true);
    try {
      await addComment(prompt.id, user.id, newComment);
      setNewComment('');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reactie plaatsen mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      {/* Status & workflow */}
      <div className="opl-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Status</span>
            <span className={clsx('opl-badge', statusMeta.classes)}>{statusMeta.label}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (status === 'draft' || status === 'rejected') && (
              <button onClick={handleSubmit} disabled={busy} className="opl-btn-primary">
                <Send size={16} /> Indienen ter goedkeuring
              </button>
            )}
            {isAdmin && status === 'submitted' && (
              <>
                <button
                  onClick={() => handleDecision('approved')}
                  disabled={busy}
                  className="opl-btn-primary bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check size={16} /> Goedkeuren
                </button>
                <button
                  onClick={() => handleDecision('rejected')}
                  disabled={busy}
                  className="opl-btn-secondary text-rijksrood"
                >
                  <X size={16} /> Afwijzen
                </button>
              </>
            )}
          </div>
        </div>

        {isAdmin && status === 'submitted' && (
          <textarea
            className="opl-input mt-3"
            rows={2}
            placeholder="Optionele opmerking bij je beslissing…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </div>

      {/* Reacties — uitgeschakeld via COMMENTS_ENABLED (alleen raadplegen + liken). */}
      {COMMENTS_ENABLED && (
      <div className="opl-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <MessageSquare size={18} className="text-rijksblauw-500" /> Reacties ({comments.length})
        </h2>
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{authorName(c.profile)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(c.created_at)}</span>
                  {(isAdmin || c.user_id === user?.id) && (
                    <button
                      onClick={async () => {
                        await deleteComment(c.id);
                        await reload();
                      }}
                      className="text-slate-300 hover:text-rijksrood dark:text-slate-600"
                      aria-label="Reactie verwijderen"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{c.body}</p>
            </li>
          ))}
          {comments.length === 0 && <li className="text-sm text-slate-400 dark:text-slate-500">Nog geen reacties.</li>}
        </ul>
        {isAuthenticated ? (
          <div className="mt-3 flex gap-2">
            <input
              className="opl-input"
              placeholder="Schrijf een reactie…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            />
            <button onClick={handleAddComment} disabled={busy} className="opl-btn-primary shrink-0">
              Plaatsen
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">Log in om te reageren.</p>
        )}
      </div>
      )}

      {/* Versiegeschiedenis */}
      <div className="opl-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <History size={18} className="text-rijksblauw-500" /> Versiegeschiedenis ({versions.length})
        </h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {versions.map((v) => (
            <li key={v.id} className="py-2">
              <button
                onClick={() => setOpenVersion(openVersion === v.id ? null : v.id)}
                className="flex w-full items-center justify-between text-left text-sm"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  v{v.version}
                  <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
                    {formatDate(v.created_at)}
                  </span>
                </span>
                <ChevronDown
                  size={15}
                  className={clsx('text-slate-400 transition-transform dark:text-slate-500', openVersion === v.id && 'rotate-180')}
                />
              </button>
              {v.change_summary && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{v.change_summary}</p>
              )}
              {openVersion === v.id && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{v.title}</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {v.content}
                  </pre>
                </div>
              )}
            </li>
          ))}
          {versions.length === 0 && (
            <li className="py-2 text-sm text-slate-400 dark:text-slate-500">Nog geen versies vastgelegd.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
