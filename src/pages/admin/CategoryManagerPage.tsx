import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Upload } from '@/components/common/icons';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '@/services/repository';
import { logAdminAction } from '@/services/adminService';
import type { Category } from '@/types';
import StackTable from '@/components/common/StackTable';

interface Editor {
  id?: string;
  name: string;
  description: string;
  icon: string;
}

const ICON_OPTIONS = [
  'FileText',
  'Megaphone',
  'Scale',
  'BarChart3',
  'Mail',
  'Users',
  'Search',
  'Folder',
];

export default function CategoryManagerPage() {
  const { refresh } = useReferenceData();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState('');

  async function load() {
    setLoading(true);
    setCategories(await getCategories());
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
    const payload = {
      name: editor.name.trim(),
      description: editor.description.trim(),
      icon: editor.icon,
    };
    if (editor.id) {
      await updateCategory(editor.id, payload);
      await logAdminAction({ action: 'update_category', entity_type: 'category', entity_id: editor.id, changes: payload });
      toast.success('Categorie bijgewerkt');
    } else {
      const created = await createCategory(payload);
      await logAdminAction({ action: 'create_category', entity_type: 'category', entity_id: created.id, changes: payload });
      toast.success('Categorie toegevoegd');
    }
    setEditor(null);
    await load();
    await refresh();
  }

  async function remove(c: Category) {
    await deleteCategory(c.id);
    await logAdminAction({ action: 'delete_category', entity_type: 'category', entity_id: c.id });
    toast.success('Categorie verwijderd');
    await load();
    await refresh();
  }

  async function move(c: Category, dir: -1 | 1) {
    const idx = categories.findIndex((x) => x.id === c.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= categories.length) return;
    await Promise.all([
      updateCategory(categories[idx].id, { sort_order: categories[swap].sort_order ?? swap }),
      updateCategory(categories[swap].id, { sort_order: categories[idx].sort_order ?? idx }),
    ]);
    await load();
    await refresh();
  }

  async function importCsv() {
    const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const [name, description, icon] = line.split(',').map((s) => s?.trim());
      if (!name || name.toLowerCase() === 'name') continue;
      await createCategory({ name, description: description ?? '', icon: icon || 'Folder' });
      count++;
    }
    await logAdminAction({ action: 'bulk_import_categories', entity_type: 'category', changes: { count } });
    toast.success(`${count} categorieën geïmporteerd`);
    setCsv('');
    setCsvOpen(false);
    await load();
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Categorieën beheren</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{categories.length} categorieën</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="opl-btn-secondary" onClick={() => setCsvOpen(true)}>
            <Upload size={16} /> CSV import
          </button>
          <button
            className="opl-btn-primary"
            onClick={() => setEditor({ name: '', description: '', icon: 'Folder' })}
          >
            <Plus size={18} /> Nieuwe categorie
          </button>
        </div>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : (
          <StackTable>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Beschrijving</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Icoon</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {categories.map((c, i) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell dark:text-slate-400">{c.description}</td>
                  <td className="hidden px-4 py-3 text-slate-400 sm:table-cell dark:text-slate-500">
                    <code className="text-xs">{c.icon}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => move(c, -1)} disabled={i === 0} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Omhoog">
                        <ArrowUp size={15} />
                      </button>
                      <button onClick={() => move(c, 1)} disabled={i === categories.length - 1} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800" aria-label="Omlaag">
                        <ArrowDown size={15} />
                      </button>
                      <button onClick={() => setEditor({ id: c.id, name: c.name, description: c.description ?? '', icon: c.icon ?? 'Folder' })} className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15" aria-label="Bewerken">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setToDelete(c)} className="rounded p-1.5 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10" aria-label="Verwijderen">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </StackTable>
        )}
      </div>

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? 'Categorie bewerken' : 'Nieuwe categorie'} size="max-w-md">
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
            <div>
              <label className="opl-label">Icoon</label>
              <select className="opl-input" value={editor.icon} onChange={(e) => setEditor({ ...editor, icon: e.target.value })}>
                {ICON_OPTIONS.map((ic) => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button className="opl-btn-secondary" onClick={() => setEditor(null)}>Annuleren</button>
              <button className="opl-btn-primary" onClick={save}>Opslaan</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="CSV-import (categorieën)" size="max-w-lg">
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Eén categorie per regel, formaat: <code>naam,beschrijving,icoon</code></p>
        <textarea className="opl-input min-h-[160px] resize-y font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'Subsidies,Aanvragen en regelingen,FileText\nKlachten,Klachtafhandeling,Mail'} />
        <div className="mt-4 flex justify-end gap-3">
          <button className="opl-btn-secondary" onClick={() => setCsvOpen(false)}>Annuleren</button>
          <button className="opl-btn-primary" onClick={importCsv} disabled={!csv.trim()}>Importeren</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Categorie verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen?`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
