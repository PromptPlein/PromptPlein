import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { createRole, deleteRole, getRoles, updateRole } from '@/services/repository';
import { logAdminAction } from '@/services/adminService';
import type { Role } from '@/types';

interface Editor {
  id?: string;
  name: string;
  description: string;
}

export default function RoleManagerPage() {
  const { refresh } = useReferenceData();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');

  async function load() {
    setLoading(true);
    setRoles(await getRoles());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editor?.name.trim()) {
      toast.error('Naam is verplicht');
      return;
    }
    const payload = { name: editor.name.trim(), description: editor.description.trim() };
    if (editor.id) {
      await updateRole(editor.id, payload);
      await logAdminAction({ action: 'update_role', entity_type: 'role', entity_id: editor.id, changes: payload });
      toast.success('Rol bijgewerkt');
    } else {
      const created = await createRole(payload);
      await logAdminAction({ action: 'create_role', entity_type: 'role', entity_id: created.id, changes: payload });
      toast.success('Rol toegevoegd');
    }
    setEditor(null);
    await load();
    await refresh();
  }

  async function remove(r: Role) {
    await deleteRole(r.id);
    await logAdminAction({ action: 'delete_role', entity_type: 'role', entity_id: r.id });
    toast.success('Rol verwijderd');
    await load();
    await refresh();
  }

  async function move(r: Role, dir: -1 | 1) {
    const idx = roles.findIndex((x) => x.id === r.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= roles.length) return;
    await Promise.all([
      updateRole(roles[idx].id, { sort_order: roles[swap].sort_order ?? swap }),
      updateRole(roles[swap].id, { sort_order: roles[idx].sort_order ?? idx }),
    ]);
    await load();
    await refresh();
  }

  async function importCsv() {
    const lines = csv
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const [name, description] = line.split(',').map((s) => s?.trim());
      if (!name || name.toLowerCase() === 'name') continue;
      await createRole({ name, description: description ?? '' });
      count++;
    }
    await logAdminAction({ action: 'bulk_import_roles', entity_type: 'role', changes: { count } });
    toast.success(`${count} rollen geïmporteerd`);
    setCsv('');
    setCsvOpen(false);
    await load();
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Rollen beheren</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{roles.length} rollen</p>
        </div>
        <div className="flex gap-2">
          <button className="opl-btn-secondary" onClick={() => setCsvOpen(true)}>
            <Upload size={16} /> CSV import
          </button>
          <button className="opl-btn-primary" onClick={() => setEditor({ name: '', description: '' })}>
            <Plus size={18} /> Nieuwe rol
          </button>
        </div>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Beschrijving</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {roles.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{r.name}</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell dark:text-slate-400">{r.description}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => move(r, -1)} disabled={i === 0} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Omhoog">
                        <ArrowUp size={15} />
                      </button>
                      <button onClick={() => move(r, 1)} disabled={i === roles.length - 1} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Omlaag">
                        <ArrowDown size={15} />
                      </button>
                      <button onClick={() => setEditor({ id: r.id, name: r.name, description: r.description ?? '' })} className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15" aria-label="Bewerken">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setToDelete(r)} className="rounded p-1.5 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10" aria-label="Verwijderen">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? 'Rol bewerken' : 'Nieuwe rol'} size="max-w-md">
        {editor && (
          <div className="space-y-4">
            <div>
              <label className="opl-label">Naam</label>
              <input className="opl-input" value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="opl-label">Beschrijving</label>
              <input className="opl-input" value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3">
              <button className="opl-btn-secondary" onClick={() => setEditor(null)}>Annuleren</button>
              <button className="opl-btn-primary" onClick={save}>Opslaan</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="CSV-import (rollen)" size="max-w-lg">
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Eén rol per regel, formaat: <code>naam,beschrijving</code></p>
        <textarea className="opl-input min-h-[160px] resize-y font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'Inkoopadviseur,Adviseert over aanbestedingen\nHR-adviseur,Personeelszaken'} />
        <div className="mt-4 flex justify-end gap-3">
          <button className="opl-btn-secondary" onClick={() => setCsvOpen(false)}>Annuleren</button>
          <button className="opl-btn-primary" onClick={importCsv} disabled={!csv.trim()}>Importeren</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Rol verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen?`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
