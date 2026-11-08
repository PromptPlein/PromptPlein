import { useEffect, useState } from 'react';
import RequestQueue from '@/components/admin/RequestQueue';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  approveFunctionRequest,
  listPendingFunctionRequests,
  rejectFunctionRequest,
} from '@/services/functionRequestService';
import { logAdminAction } from '@/services/adminService';
import type { FunctionRequest } from '@/types';

export default function FunctionRequestQueuePage() {
  const { user } = useAuth();
  const { refresh } = useReferenceData();
  const [requests, setRequests] = useState<FunctionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRequests(await listPendingFunctionRequests());
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function approve(req: FunctionRequest) {
    if (!user) return;
    setBusyId(req.id);
    try {
      const role = await approveFunctionRequest(req, user.id, notes[req.id]);
      await logAdminAction({
        action: 'approve_function_request',
        entity_type: 'function_request',
        entity_id: req.id,
        changes: { name: req.name, created_role_id: role.id, note: notes[req.id] || null },
      });
      notify.success(`Functie “${req.name}” toegevoegd`);
      setRequests((prev) => prev.filter((x) => x.id !== req.id));
      await refresh(); // nieuwe functie meteen beschikbaar in keuzelijsten
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Goedkeuren mislukt');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(req: FunctionRequest) {
    if (!user) return;
    setBusyId(req.id);
    try {
      await rejectFunctionRequest(req.id, user.id, notes[req.id]);
      await logAdminAction({
        action: 'reject_function_request',
        entity_type: 'function_request',
        entity_id: req.id,
        changes: { name: req.name, note: notes[req.id] || null },
      });
      notify.success('Aanvraag afgewezen');
      setRequests((prev) => prev.filter((x) => x.id !== req.id));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Afwijzen mislukt');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RequestQueue
      title="Functie-aanvragen"
      icon="business-suitcase"
      requests={requests}
      loading={loading}
      notes={notes}
      onNote={(id, note) => setNotes((n) => ({ ...n, [id]: note }))}
      busyId={busyId}
      onApprove={approve}
      onReject={reject}
    />
  );
}
