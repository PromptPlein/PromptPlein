import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  createTechnique,
  deleteTechnique,
  getTechniques,
  updateTechnique,
} from '@/services/repository';
import { logAdminAction } from '@/services/adminService';
import { fillTemplate } from '@/services/optimizeService';
import type { FollowUpQuestion, Technique } from '@/types';

interface EditorState {
  id?: string;
  name: string;
  description: string;
  template: string;
  followUpsJson: string;
  is_active: boolean;
}

const EMPTY: EditorState = {
  name: '',
  description: '',
  template: 'Oorspronkelijke opdracht:\n{{PROMPT}}',
  followUpsJson: '[]',
  is_active: true,
};

function toEditor(t: Technique): EditorState {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    template: t.template,
    followUpsJson: JSON.stringify(t.follow_up_questions, null, 2),
    is_active: t.is_active !== false,
  };
}

export default function TechniqueManagerPage() {
  const { refresh } = useReferenceData();
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Technique | null>(null);

  async function load() {
    setLoading(true);
    const t = await getTechniques(true); // inclusief inactieve
    setTechniques(t);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function parseFollowUps(json: string): FollowUpQuestion[] {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error('Vervolgvragen moeten een JSON-array zijn');
    for (const q of parsed) {
      if (typeof q.id !== 'string' || typeof q.label !== 'string') {
        throw new Error('Elke vraag heeft minimaal een "id" en "label" (strings)');
      }
    }
    return parsed as FollowUpQuestion[];
  }

  async function handleSave() {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast.error('Naam is verplicht');
      return;
    }
    let followUps: FollowUpQuestion[];
    try {
      followUps = parseFollowUps(editor.followUpsJson);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Ongeldige JSON');
      return;
    }

    const payload = {
      name: editor.name.trim(),
      description: editor.description.trim(),
      template: editor.template,
      follow_up_questions: followUps,
      is_active: editor.is_active,
    };

    try {
      if (editor.id) {
        await updateTechnique(editor.id, payload);
        await logAdminAction({
          action: 'update_technique',
          entity_type: 'technique',
          entity_id: editor.id,
          changes: { name: payload.name },
        });
        toast.success('Techniek bijgewerkt');
      } else {
        const created = await createTechnique({ ...payload, follow_up_questions: followUps });
        await logAdminAction({
          action: 'create_technique',
          entity_type: 'technique',
          entity_id: created.id,
          changes: { name: payload.name },
        });
        toast.success('Techniek aangemaakt');
      }
      setEditor(null);
      await load();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    }
  }

  async function handleDelete(t: Technique) {
    await deleteTechnique(t.id);
    await logAdminAction({ action: 'delete_technique', entity_type: 'technique', entity_id: t.id });
    toast.success('Techniek verwijderd');
    await load();
    await refresh();
  }

  async function toggleActive(t: Technique) {
    await updateTechnique(t.id, { is_active: t.is_active === false });
    await load();
    await refresh();
  }

  async function move(t: Technique, dir: -1 | 1) {
    const sorted = [...techniques];
    const idx = sorted.findIndex((x) => x.id === t.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swap];
    await Promise.all([
      updateTechnique(a.id, { sort_order: b.sort_order ?? swap }),
      updateTechnique(b.id, { sort_order: a.sort_order ?? idx }),
    ]);
    await load();
    await refresh();
  }

  const preview =
    editor && (() => {
      try {
        const followUps = parseFollowUps(editor.followUpsJson);
        const sample: Record<string, string> = {};
        followUps.forEach((q) => (sample[q.id] = `[${q.label}]`));
        return fillTemplate(editor.template, '[Jouw oorspronkelijke prompt]', sample);
      } catch {
        return 'Kan geen preview maken — controleer de JSON van de vervolgvragen.';
      }
    })();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Technieken beheren</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{techniques.length} technieken</p>
        </div>
        <button className="opl-btn-primary" onClick={() => setEditor({ ...EMPTY })}>
          <Plus size={18} /> Nieuwe techniek
        </button>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-64 w-full" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Vervolgvragen</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {techniques.map((t, i) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
                    <p className="line-clamp-1 text-xs text-slate-400 dark:text-slate-500">{t.description}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell dark:text-slate-300">
                    {t.follow_up_questions.length}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`opl-badge ${
                        t.is_active === false
                          ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      }`}
                    >
                      {t.is_active === false ? 'Inactief' : 'Actief'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => move(t, -1)}
                        disabled={i === 0}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800"
                        aria-label="Omhoog"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        onClick={() => move(t, 1)}
                        disabled={i === techniques.length - 1}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800"
                        aria-label="Omlaag"
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
                        aria-label="Actief/inactief"
                      >
                        {t.is_active === false ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button
                        onClick={() => setEditor(toEditor(t))}
                        className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
                        aria-label="Bewerken"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setToDelete(t)}
                        className="rounded p-1.5 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10"
                        aria-label="Verwijderen"
                      >
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

      {/* Editor modal */}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Techniek bewerken' : 'Nieuwe techniek'}
        size="max-w-3xl"
      >
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="opl-label">Naam</label>
                <input
                  className="opl-input"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={editor.is_active}
                    onChange={(e) => setEditor({ ...editor, is_active: e.target.checked })}
                  />
                  Actief (zichtbaar in de optimizer)
                </label>
              </div>
            </div>

            <div>
              <label className="opl-label">Beschrijving</label>
              <input
                className="opl-input"
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
              />
            </div>

            <div>
              <label className="opl-label">
                Vervolgvragen (JSON-array van {`{ id, label, placeholder? }`})
              </label>
              <textarea
                className="opl-input min-h-[120px] resize-y font-mono text-xs"
                value={editor.followUpsJson}
                onChange={(e) => setEditor({ ...editor, followUpsJson: e.target.value })}
                spellCheck={false}
              />
              {jsonError && <p className="mt-1 text-xs text-rijksrood">{jsonError}</p>}
            </div>

            <div>
              <label className="opl-label">
                Template (gebruik <code className="text-rijksblauw-500 dark:text-rijksblauw-300">{'{{PROMPT}}'}</code> en{' '}
                <code className="text-rijksblauw-500 dark:text-rijksblauw-300">{'{{vraag_id}}'}</code>)
              </label>
              <textarea
                className="opl-input min-h-[160px] resize-y font-mono text-xs"
                value={editor.template}
                onChange={(e) => setEditor({ ...editor, template: e.target.value })}
                spellCheck={false}
              />
            </div>

            <div>
              <label className="opl-label">Preview gegenereerde output</label>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {preview}
              </pre>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button className="opl-btn-secondary" onClick={() => setEditor(null)}>
                Annuleren
              </button>
              <button className="opl-btn-primary" onClick={handleSave}>
                Opslaan
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Techniek verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && handleDelete(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
