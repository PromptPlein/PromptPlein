import { useEffect, useState } from 'react';
import { Check, X, Inbox, Building2 } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { formatDate } from '@/lib/utils';
import { orgPathLabel, ORG_PATH_SEPARATOR } from '@/lib/orgTree';
import {
  approveOrganizationRequest,
  listPendingOrganizationRequests,
  rejectOrganizationRequest,
} from '@/services/organizationRequestService';
import { logAdminAction } from '@/services/adminService';
import type { OrganizationRequest } from '@/types';

export default function OrganizationRequestQueuePage() {
  const { user } = useAuth();
  const { organizations, refresh } = useReferenceData();
  const [requests, setRequests] = useState<OrganizationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRequests(await listPendingOrganizationRequests());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function pathOf(req: OrganizationRequest) {
    return [orgPathLabel(req.parent_id, organizations), ...req.names]
      .filter(Boolean)
      .join(ORG_PATH_SEPARATOR);
  }

  async function approve(req: OrganizationRequest) {
    if (!user) return;
    setBusyId(req.id);
    try {
      const org = await approveOrganizationRequest(req.id, notes[req.id]);
      await logAdminAction({
        action: 'approve_organization_request',
        entity_type: 'organization_request',
        entity_id: req.id,
        changes: { path: pathOf(req), created_org_id: org.id, note: notes[req.id] || null },
      });
      toast.success(`“${org.name}” toegevoegd`);
      setRequests((prev) => prev.filter((x) => x.id !== req.id));
      await refresh(); // het nieuwe onderdeel staat meteen in de keuzelijsten
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Goedkeuren mislukt');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(req: OrganizationRequest) {
    if (!user) return;
    setBusyId(req.id);
    try {
      await rejectOrganizationRequest(req.id, user.id, notes[req.id]);
      await logAdminAction({
        action: 'reject_organization_request',
        entity_type: 'organization_request',
        entity_id: req.id,
        changes: { path: pathOf(req), note: notes[req.id] || null },
      });
      toast.success('Aanvraag afgewezen');
      setRequests((prev) => prev.filter((x) => x.id !== req.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Afwijzen mislukt');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Onderdeel-aanvragen
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {requests.length} {requests.length === 1 ? 'aanvraag wacht' : 'aanvragen wachten'} op beoordeling
        </p>
      </div>

      {loading ? (
        <div className="opl-card">
          <div className="skeleton h-40 w-full" />
        </div>
      ) : requests.length === 0 ? (
        <div className="opl-card flex flex-col items-center gap-2 py-12 text-center">
          <Inbox size={32} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Geen openstaande aanvragen.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className="opl-card p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
                  <Building2 size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="break-words font-semibold text-slate-800 dark:text-slate-100">
                    {pathOf(req)}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                    {req.names.length === 1
                      ? 'Eén nieuwe laag'
                      : `${req.names.length} nieuwe lagen, die samen worden aangemaakt`}
                    . De aanvrager komt er bij goedkeuring op zijn profiel te staan.
                  </p>
                  {req.motivation && (
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{req.motivation}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Aangevraagd {formatDate(req.created_at)} · door{' '}
                    {req.requester?.full_name || req.requester?.email || 'onbekend'}
                  </p>
                </div>
              </div>

              <label className="opl-label mt-3" htmlFor={`opmerking-${req.id}`}>
                Opmerking bij je beslissing (optioneel)
              </label>
              <textarea
                id={`opmerking-${req.id}`}
                className="opl-input"
                rows={2}
                value={notes[req.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
              />

              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => reject(req)}
                  disabled={busyId === req.id}
                  className="opl-btn-secondary text-rijksrood"
                >
                  <X size={16} /> Afwijzen
                </button>
                <button
                  onClick={() => approve(req)}
                  disabled={busyId === req.id}
                  className="opl-btn-primary bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check size={16} /> Goedkeuren &amp; toevoegen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
