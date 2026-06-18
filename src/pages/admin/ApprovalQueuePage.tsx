import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Inbox, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import { decide, listSubmittedPrompts } from '@/services/collaborationService';
import { logAdminAction } from '@/services/adminService';
import type { Prompt } from '@/types';

export default function ApprovalQueuePage() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setPrompts(await listSubmittedPrompts());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleDecision(p: Prompt, decision: 'approved' | 'rejected') {
    if (!user) return;
    setBusyId(p.id);
    try {
      await decide(p.id, decision, user.id, notes[p.id]);
      await logAdminAction({
        action: decision === 'approved' ? 'approve_prompt' : 'reject_prompt',
        entity_type: 'prompt',
        entity_id: p.id,
        changes: { note: notes[p.id] || null },
      });
      toast.success(decision === 'approved' ? 'Goedgekeurd' : 'Afgewezen');
      setPrompts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Beslissing mislukt');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-rijksblauw-700">Goedkeuringen</h1>
        <p className="text-sm text-slate-500">{prompts.length} prompts wachten op beoordeling</p>
      </div>

      {loading ? (
        <div className="opl-card">
          <div className="skeleton h-40 w-full" />
        </div>
      ) : prompts.length === 0 ? (
        <div className="opl-card flex flex-col items-center gap-2 py-12 text-center">
          <Inbox size={32} className="text-slate-300" />
          <p className="text-sm text-slate-500">Geen openstaande aanvragen. Mooi werk!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {prompts.map((p) => (
            <div key={p.id} className="opl-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800">{p.title}</h2>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Ingediend {p.submitted_at ? formatDate(p.submitted_at) : '—'} · door{' '}
                    {p.created_by}
                  </p>
                </div>
                <Link
                  to={`/prompt/${p.id}`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm text-rijksblauw-600 hover:underline"
                >
                  Bekijken <ExternalLink size={14} />
                </Link>
              </div>

              <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                {p.content}
              </pre>

              <textarea
                className="opl-input mt-3"
                rows={2}
                placeholder="Optionele opmerking…"
                value={notes[p.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
              />

              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => handleDecision(p, 'rejected')}
                  disabled={busyId === p.id}
                  className="opl-btn-secondary text-rijksrood"
                >
                  <X size={16} /> Afwijzen
                </button>
                <button
                  onClick={() => handleDecision(p, 'approved')}
                  disabled={busyId === p.id}
                  className="opl-btn-primary bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check size={16} /> Goedkeuren
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
