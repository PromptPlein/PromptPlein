import { useEffect, useState } from 'react';
import RequestQueue from '@/components/admin/RequestQueue';
import { notify } from '@/lib/notify';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  approveCategoryRequest,
  listPendingCategoryRequests,
  rejectCategoryRequest,
} from '@/services/categoryRequestService';
import { logAdminAction } from '@/services/adminService';
import type { CategoryRequest } from '@/types';

export default function CategoryRequestQueuePage() {
  const { user } = useAuth();
  const { refresh } = useReferenceData();
  const [requests, setRequests] = useState<CategoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRequests(await listPendingCategoryRequests());
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function approve(req: CategoryRequest) {
    if (!user) return;
    setBusyId(req.id);
    try {
      const category = await approveCategoryRequest(req, user.id, notes[req.id]);
      await logAdminAction({
        action: 'approve_category_request',
        entity_type: 'category_request',
        entity_id: req.id,
        changes: { name: req.name, created_category_id: category.id, note: notes[req.id] || null },
      });
      notify.success(`Categorie “${req.name}” toegevoegd`);
      setRequests((prev) => prev.filter((x) => x.id !== req.id));
      await refresh(); // nieuwe categorie meteen beschikbaar in keuzelijsten
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Goedkeuren mislukt');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(req: CategoryRequest) {
    if (!user) return;
    setBusyId(req.id);
    try {
      await rejectCategoryRequest(req.id, user.id, notes[req.id]);
      await logAdminAction({
        action: 'reject_category_request',
        entity_type: 'category_request',
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
      title="Categorie-aanvragen"
      icon="folder-on-folder"
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
