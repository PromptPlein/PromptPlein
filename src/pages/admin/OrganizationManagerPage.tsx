import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listOrganizations,
  ORG_TYPE_LABELS,
  type OrganizationInput,
} from '@/services/orgService';
import { logAdminAction } from '@/services/adminService';
import type { Organization, OrganizationType } from '@/types';

const TYPES: OrganizationType[] = ['ministry', 'department', 'agency'];

interface Editor extends OrganizationInput {
  id?: string;
}

const EMPTY: Editor = {
  name: '',
  code: '',
  description: '',
  parent_id: '',
  organization_type: 'ministry',
  contact_email: '',
  is_active: true,
};

export default function OrganizationManagerPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toDelete, setToDelete] = useState<Organization | null>(null);

  const orgName = useMemo(() => {
    const map = new Map(orgs.map((o) => [o.id, o.name]));
    return (id?: string | null) => (id ? map.get(id) ?? '—' : '—');
  }, [orgs]);

  async function load() {
    setLoading(true);
    try {
      setOrgs(await listOrganizations(true));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast.error('Naam is verplicht');
      return;
    }
    const payload: OrganizationInput = {
      name: editor.name.trim(),
      code: editor.code?.trim() || null,
      description: editor.description?.trim() || null,
      parent_id: editor.parent_id || null,
      organization_type: editor.organization_type,
      contact_email: editor.contact_email?.trim() || null,
      is_active: editor.is_active ?? true,
    };
    try {
      if (editor.id) {
        await updateOrganization(editor.id, payload);
        await logAdminAction({
          action: 'update_organization',
          entity_type: 'organization',
          entity_id: editor.id,
          changes: { ...payload },
        });
        toast.success('Organisatie bijgewerkt');
      } else {
        const created = await createOrganization(payload);
        await logAdminAction({
          action: 'create_organization',
          entity_type: 'organization',
          entity_id: created.id,
          changes: { ...payload },
        });
        toast.success('Organisatie toegevoegd');
      }
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    }
  }

  async function remove(o: Organization) {
    try {
      await deleteOrganization(o.id);
      await logAdminAction({
        action: 'delete_organization',
        entity_type: 'organization',
        entity_id: o.id,
      });
      toast.success('Organisatie verwijderd');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verwijderen mislukt');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Organisaties beheren</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{orgs.length} organisaties</p>
        </div>
        <button className="opl-btn-primary" onClick={() => setEditor({ ...EMPTY })}>
          <Plus size={18} /> Nieuwe organisatie
        </button>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Type</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Bovenliggend</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{o.name}</div>
                    {o.code && <div className="text-xs text-slate-400 dark:text-slate-500">{o.code}</div>}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell dark:text-slate-400">
                    {ORG_TYPE_LABELS[o.organization_type]}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell dark:text-slate-400">
                    {orgName(o.parent_id)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        o.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                      )}
                    >
                      {o.is_active ? 'Actief' : 'Inactief'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() =>
                          setEditor({
                            id: o.id,
                            name: o.name,
                            code: o.code ?? '',
                            description: o.description ?? '',
                            parent_id: o.parent_id ?? '',
                            organization_type: o.organization_type,
                            contact_email: o.contact_email ?? '',
                            is_active: o.is_active,
                          })
                        }
                        className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
                        aria-label="Bewerken"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setToDelete(o)}
                        className="rounded p-1.5 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10"
                        aria-label="Verwijderen"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    Nog geen organisaties.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Organisatie bewerken' : 'Nieuwe organisatie'}
        size="max-w-lg"
      >
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="opl-label">Naam</label>
                <input
                  className="opl-input"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div>
                <label className="opl-label">Code</label>
                <input
                  className="opl-input"
                  placeholder="bijv. BZK"
                  value={editor.code ?? ''}
                  onChange={(e) => setEditor({ ...editor, code: e.target.value })}
                />
              </div>
              <div>
                <label className="opl-label">Type</label>
                <select
                  className="opl-input"
                  value={editor.organization_type}
                  onChange={(e) =>
                    setEditor({ ...editor, organization_type: e.target.value as OrganizationType })
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ORG_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="opl-label">Bovenliggende organisatie</label>
                <select
                  className="opl-input"
                  value={editor.parent_id ?? ''}
                  onChange={(e) => setEditor({ ...editor, parent_id: e.target.value })}
                >
                  <option value="">— Geen (top-niveau) —</option>
                  {orgs
                    .filter((o) => o.id !== editor.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="opl-label">Contact-e-mail</label>
                <input
                  className="opl-input"
                  type="email"
                  value={editor.contact_email ?? ''}
                  onChange={(e) => setEditor({ ...editor, contact_email: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="opl-label">Beschrijving</label>
                <input
                  className="opl-input"
                  value={editor.description ?? ''}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={editor.is_active ?? true}
                onChange={(e) => setEditor({ ...editor, is_active: e.target.checked })}
              />
              Actief
            </label>
            <div className="flex justify-end gap-3">
              <button className="opl-btn-secondary" onClick={() => setEditor(null)}>
                Annuleren
              </button>
              <button className="opl-btn-primary" onClick={save}>
                Opslaan
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Organisatie verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen? Gekoppelde gebruikers verliezen hun organisatie.`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
