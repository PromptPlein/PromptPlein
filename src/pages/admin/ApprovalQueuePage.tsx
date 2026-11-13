import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Inbox, ExternalLink, ChevronRight } from '@/components/common/icons';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { formatDate, visibilityMeta } from '@/lib/utils';
import { listPendingForModeration, decideVisibility } from '@/services/visibilityService';
import { VISIBILITY_STATUS_META } from '@/services/collaborationService';
import { logAdminAction } from '@/services/adminService';
import { useAuth } from '@/context/AuthContext';
import { countPendingOrganizationRequests } from '@/services/organizationRequestService';
import { countPendingFunctionRequests } from '@/services/functionRequestService';
import { countPendingCategoryRequests } from '@/services/categoryRequestService';
import type { Prompt, PromptVisibility } from '@/types';

type PendingRow = PromptVisibility & { prompt: Prompt | null };

/** De andere wachtrijen van een beheerder; ze hebben elk een eigen pagina in Beheer. */
const OTHER_QUEUES = [
  { key: 'afdelingen', label: 'Afdelingen', to: '/admin/onderdeel-aanvragen', count: countPendingOrganizationRequests },
  { key: 'functies', label: 'Functies', to: '/admin/functie-aanvragen', count: countPendingFunctionRequests },
  { key: 'categorieen', label: 'Categorieën', to: '/admin/categorie-aanvragen', count: countPendingCategoryRequests },
] as const;

export default function ApprovalQueuePage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const [other, setOther] = useState<Record<string, number>>({});

  // Een beheerder ziet hier ook wat er in de andere wachtrijen staat: dit is de
  // pagina achter het icoon in de kop, dus hier zoekt hij.
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    Promise.all(OTHER_QUEUES.map((q) => q.count().catch(() => 0))).then((counts) => {
      if (active) setOther(Object.fromEntries(OTHER_QUEUES.map((q, i) => [q.key, counts[i]])));
    });
    return () => {
      active = false;
    };
  }, [isAdmin]);
  const waiting = OTHER_QUEUES.filter((q) => (other[q.key] ?? 0) > 0);

  async function load() {
    setLoading(true);
    try {
      // RLS levert alleen de pending-niveaus die jíj mag beoordelen
      // (moderator: het ministerie van je tak; beheerder: alles).
      setRows(await listPendingForModeration());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleDecision(row: PendingRow, decision: 'approved' | 'rejected') {
    setBusyId(row.id);
    try {
      await decideVisibility(row.id, decision, notes[row.id]);
      await logAdminAction({
        action: decision === 'approved' ? 'approve_visibility' : 'reject_visibility',
        entity_type: 'prompt_visibility',
        entity_id: row.id,
        changes: { prompt_id: row.prompt_id, level: row.level, note: notes[row.id] || null },
      });
      toast.success(decision === 'approved' ? 'Goedgekeurd' : 'Afgewezen');
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Beslissing mislukt');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Goedkeuringen</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {rows.length} deelniveau{rows.length === 1 ? '' : 's'} wacht{rows.length === 1 ? '' : 'en'} op
          jouw beoordeling
        </p>
      </div>

      {waiting.length > 0 && (
        <section aria-labelledby="andere-aanvragen" className="opl-card p-5">
          <h2
            id="andere-aanvragen"
            className="font-semibold text-slate-800 dark:text-slate-100"
          >
            Andere aanvragen
          </h2>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
            {waiting.map((q) => (
              <li key={q.key}>
                <Link
                  to={q.to}
                  className="flex min-h-[2.75rem] items-center justify-between gap-3 py-2 text-sm text-rijksblauw-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-200"
                >
                  <span>
                    {q.label}: {other[q.key]}{' '}
                    {other[q.key] === 1 ? 'aanvraag wacht' : 'aanvragen wachten'}
                  </span>
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <div className="opl-card">
          <div className="skeleton h-40 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="opl-card flex flex-col items-center gap-2 py-12 text-center">
          <Inbox size={32} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {waiting.length > 0 ? 'Geen prompts om te beoordelen.' : 'Geen openstaande aanvragen. Mooi werk!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const p = row.prompt;
            const meta = visibilityMeta(row.level);
            const statusMeta = VISIBILITY_STATUS_META[row.status];
            return (
              <div key={row.id} className="opl-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                        {p?.title ?? 'Onbekende prompt'}
                      </h2>
                      <span className="rounded-full bg-rijksblauw-50 px-2 py-0.5 text-[0.6875rem] font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                        Niveau: {meta?.label ?? row.level}
                      </span>
                      <span className={clsx('opl-badge', statusMeta.classes)}>{statusMeta.label}</span>
                    </div>
                    {p?.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                        {p.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      Aangevraagd {row.created_at ? formatDate(row.created_at) : '—'} · door{' '}
                      {p?.created_by ?? 'onbekend'}
                    </p>
                  </div>
                  {p && (
                    <Link
                      to={`/prompt/${p.id}`}
                      className="inline-flex shrink-0 items-center gap-1 text-sm text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                    >
                      Bekijken <ExternalLink size={14} />
                    </Link>
                  )}
                </div>

                {p?.content && (
                  <pre tabIndex={0} className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {p.content}
                  </pre>
                )}

                <textarea
                  className="opl-input mt-3"
                  rows={2}
                  placeholder="Optionele opmerking…"
                  value={notes[row.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                />

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => handleDecision(row, 'rejected')}
                    disabled={busyId === row.id}
                    className="opl-btn-secondary text-rijksrood"
                  >
                    <X size={16} /> Afwijzen
                  </button>
                  <button
                    onClick={() => handleDecision(row, 'approved')}
                    disabled={busyId === row.id}
                    className="opl-btn-primary bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check size={16} /> Goedkeuren
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
