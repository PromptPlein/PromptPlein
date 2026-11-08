import { useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Info,
  X,
} from '@/components/common/icons';
import { notify } from '@/lib/notify';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { selfDirectedBuilder } from '@/lib/techniques';
import type { FollowUpQuestion, Technique, TechniqueFamily } from '@/types';
import StackTable from '@/components/common/StackTable';

interface EditorState {
  id?: string;
  name: string;
  description: string;
  /** 'technique' = losse prompttechniek, 'context' = compleet prompt framework. */
  family: TechniqueFamily;
  strength: string;
  /** Eén gebruikssituatie per regel. */
  useCasesText: string;
  template: string;
  /** Vervolgvragen als gestructureerde lijst (per vraag: id, label, placeholder). */
  followUps: FollowUpQuestion[];
  is_active: boolean;
}

const EMPTY: EditorState = {
  name: '',
  description: '',
  family: 'technique',
  strength: '',
  useCasesText: '',
  template: 'Oorspronkelijke opdracht:\n{{PROMPT}}',
  followUps: [],
  is_active: true,
};

function toEditor(t: Technique): EditorState {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    family: t.family ?? 'technique',
    strength: t.strength ?? '',
    useCasesText: (t.use_cases ?? []).join('\n'),
    template: t.template,
    followUps: t.follow_up_questions.map((q) => ({ ...q })),
    is_active: t.is_active !== false,
  };
}

/** Maak een veilige, korte id op basis van een label (voor de template-placeholders). */
function slugifyId(label: string, existing: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'veld';
  let id = base;
  let n = 2;
  while (existing.includes(id)) id = `${base}_${n++}`;
  return id;
}

/** Splitst de textarea naar een opgeschoonde lijst gebruikssituaties. */
function parseUseCases(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Eén sleepbare tabelrij. De grijp-greep links activeert het slepen; de rest
 *  van de rij blijft normaal klikbaar (bewerken, status, verwijderen). */
function SortableRow({
  t,
  index,
  total,
  onMove,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  t: Technique;
  index: number;
  total: number;
  onMove: (t: Technique, dir: -1 | 1) => void;
  onToggleActive: (t: Technique) => void;
  onEdit: (t: Technique) => void;
  onDelete: (t: Technique) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // De gesleepte rij komt visueel bovenop te liggen en wordt licht gemarkeerd.
    ...(isDragging ? { position: 'relative' as const, zIndex: 10 } : {}),
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-slate-50 dark:hover:bg-slate-800 ${
        isDragging ? 'bg-rijksblauw-50 shadow-lg dark:bg-rijksblauw-500/15' : ''
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab touch-none rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Sleep om te sorteren"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{t.name}</p>
            <p className="line-clamp-1 text-xs text-slate-400 dark:text-slate-500">{t.description}</p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <span
          className={`opl-badge ${
            (t.family ?? 'technique') === 'context'
              ? 'bg-rijksblauw-100 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          {(t.family ?? 'technique') === 'context' ? 'Framework' : 'Techniek'}
        </span>
      </td>
      {/* Een eigen bouwer stelt zijn vragen zelf; "0" zou hier ten onrechte als
          onvolledig lezen. */}
      <td className="hidden px-4 py-3 text-slate-600 sm:table-cell dark:text-slate-300">
        {selfDirectedBuilder(t) ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">Eigen bouwer</span>
        ) : (
          t.follow_up_questions.length
        )}
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
            onClick={() => onMove(t, -1)}
            disabled={index === 0}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Omhoog"
          >
            <ArrowUp size={15} />
          </button>
          <button
            onClick={() => onMove(t, 1)}
            disabled={index === total - 1}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Omlaag"
          >
            <ArrowDown size={15} />
          </button>
          <button
            onClick={() => onToggleActive(t)}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
            aria-label="Actief/inactief"
          >
            {t.is_active === false ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button
            onClick={() => onEdit(t)}
            className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
            aria-label="Bewerken"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(t)}
            className="rounded p-1.5 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10"
            aria-label="Verwijderen"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function TechniqueManagerPage() {
  const { refresh } = useReferenceData();
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [toDelete, setToDelete] = useState<Technique | null>(null);

  // Heeft deze techniek een bouwer die zijn eigen vragen stelt (interview, few-shot-
  // fasen, meta)? Dan is er geen vragenlijst te beheren en tonen we uitleg. Wordt
  // afgeleid uit de naam, dus het volgt meteen wat de beheerder intypt.
  const ownBuilder = editor
    ? selfDirectedBuilder({ id: editor.id ?? '', name: editor.name, family: editor.family })
    : undefined;

  async function load() {
    setLoading(true);
    const t = await getTechniques(true); // inclusief inactieve
    setTechniques(t);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // --- Vervolgvragen bewerken (gestructureerd) ---
  function addFollowUp() {
    if (!editor) return;
    const existing = editor.followUps.map((q) => q.id);
    setEditor({
      ...editor,
      followUps: [
        ...editor.followUps,
        { id: slugifyId('', existing), label: '', placeholder: '', why: '' },
      ],
    });
  }
  function updateFollowUp(index: number, patch: Partial<FollowUpQuestion>) {
    if (!editor) return;
    const next = editor.followUps.map((q, i) => {
      if (i !== index) return q;
      const merged = { ...q, ...patch };
      // Als het label verandert en het id nog leeg/auto is, leid een net id af.
      if (patch.label !== undefined && (!q.id || q.id.startsWith('veld'))) {
        const others = editor.followUps.filter((_, j) => j !== index).map((o) => o.id);
        merged.id = slugifyId(patch.label, others);
      }
      return merged;
    });
    setEditor({ ...editor, followUps: next });
  }
  function removeFollowUp(index: number) {
    if (!editor) return;
    setEditor({ ...editor, followUps: editor.followUps.filter((_, i) => i !== index) });
  }
  function moveFollowUp(index: number, dir: -1 | 1) {
    if (!editor) return;
    const swap = index + dir;
    if (swap < 0 || swap >= editor.followUps.length) return;
    const next = [...editor.followUps];
    [next[index], next[swap]] = [next[swap], next[index]];
    setEditor({ ...editor, followUps: next });
  }

  async function handleSave() {
    if (!editor) return;
    if (!editor.name.trim()) {
      notify.error('Naam is verplicht');
      return;
    }
    // Technieken met een eigen bouwer kennen geen vragenlijst: sla er geen op, ook
    // niet als er nog oude vragen in de rij stonden. Anders zou de admin data tonen
    // die de gebruiker nooit te zien krijgt.
    // Lege vragen (zonder label) eruit filteren; placeholder is optioneel.
    const followUps: FollowUpQuestion[] = ownBuilder
      ? []
      : editor.followUps
          .filter((q) => q.label.trim())
          .map((q) => ({
            id: q.id,
            label: q.label.trim(),
            placeholder: q.placeholder?.trim() || undefined,
            why: q.why?.trim() || undefined,
          }));

    const ids = followUps.map((q) => q.id);
    if (new Set(ids).size !== ids.length) {
      notify.error('Elke vraag moet een uniek veld-id hebben.');
      return;
    }

    const payload = {
      name: editor.name.trim(),
      description: editor.description.trim(),
      family: editor.family,
      strength: editor.strength.trim(),
      use_cases: parseUseCases(editor.useCasesText),
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
        notify.success('Techniek bijgewerkt');
      } else {
        const created = await createTechnique({ ...payload, follow_up_questions: followUps });
        await logAdminAction({
          action: 'create_technique',
          entity_type: 'technique',
          entity_id: created.id,
          changes: { name: payload.name },
        });
        notify.success('Techniek aangemaakt');
      }
      setEditor(null);
      await load();
      await refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    }
  }

  async function handleDelete(t: Technique) {
    await deleteTechnique(t.id);
    await logAdminAction({ action: 'delete_technique', entity_type: 'technique', entity_id: t.id });
    notify.success('Techniek verwijderd');
    await load();
    await refresh();
  }

  async function toggleActive(t: Technique) {
    await updateTechnique(t.id, { is_active: t.is_active === false });
    await load();
    await refresh();
  }

  /**
   * Schrijft de nieuwe volgorde weg als opeenvolgende sort_order-waarden (0,1,2,…).
   * Dat is robuuster dan twee waarden omwisselen: gelijke of lege sort_orders —
   * de oorzaak van het haperende sorteren — worden hiermee definitief rechtgetrokken.
   * Alleen de rijen waarvan de positie écht verandert worden bijgewerkt.
   */
  async function persistOrder(ordered: Technique[]) {
    const changed = ordered.filter((t, i) => t.sort_order !== i);
    if (changed.length === 0) return;
    try {
      await Promise.all(
        changed.map((t) => updateTechnique(t.id, { sort_order: ordered.indexOf(t) })),
      );
      await refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Volgorde opslaan mislukt');
      await load(); // herstel naar de server-waarheid bij een fout
    }
  }

  /** Drag-and-drop: verplaats de gesleepte rij naar zijn nieuwe plek en bewaar. */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = techniques.findIndex((t) => t.id === active.id);
    const newIndex = techniques.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(techniques, oldIndex, newIndex);
    setTechniques(reordered); // optimistisch: meteen de nieuwe volgorde tonen
    await persistOrder(reordered);
  }

  /** Pijltjes-knoppen (toetsenbord/fallback): verplaats één positie omhoog/omlaag. */
  async function move(t: Technique, dir: -1 | 1) {
    const idx = techniques.findIndex((x) => x.id === t.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= techniques.length) return;
    const reordered = arrayMove(techniques, idx, swap);
    setTechniques(reordered);
    await persistOrder(reordered);
  }

  const sensors = useSensors(
    // Een kleine drempel voorkomt dat een gewone klik al als sleep wordt gezien.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const preview =
    editor &&
    (() => {
      const sample: Record<string, string> = {};
      editor.followUps
        .filter((q) => q.label.trim())
        .forEach((q) => (sample[q.id] = `[${q.label}]`));
      return fillTemplate(editor.template, '[Jouw oorspronkelijke prompt]', sample);
    })();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Technieken beheren</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {techniques.length} technieken · sleep aan de greep{' '}
            <GripVertical size={13} className="inline align-text-bottom" /> om de volgorde te wijzigen
          </p>
        </div>
        <button className="opl-btn-primary" onClick={() => setEditor({ ...EMPTY })}>
          <Plus size={18} /> Nieuwe techniek
        </button>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-64 w-full" />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <StackTable>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Naam</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Soort</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Vervolgvragen</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                <SortableContext
                  items={techniques.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {techniques.map((t, i) => (
                    <SortableRow
                      key={t.id}
                      t={t}
                      index={i}
                      total={techniques.length}
                      onMove={move}
                      onToggleActive={toggleActive}
                      onEdit={(tech) => setEditor(toEditor(tech))}
                      onDelete={setToDelete}
                    />
                  ))}
                </SortableContext>
              </tbody>
            </table>
            </StackTable>
          </DndContext>
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
              <div>
                <label className="opl-label">Soort</label>
                <select
                  className="opl-input"
                  value={editor.family}
                  onChange={(e) =>
                    setEditor({ ...editor, family: e.target.value as TechniqueFamily })
                  }
                >
                  <option value="technique">Prompttechniek</option>
                  <option value="context">Prompt framework</option>
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={editor.is_active}
                  onChange={(e) => setEditor({ ...editor, is_active: e.target.checked })}
                />
                Actief (zichtbaar in de promptgenerator)
              </label>
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
                Doel van de techniek{' '}
                <span className="font-normal text-slate-400">
                  (helpt de slimme aanbeveling)
                </span>
              </label>
              <textarea
                className="opl-input min-h-[64px] resize-y"
                value={editor.strength}
                placeholder="Waar is deze techniek sterk in? Bijv. complexe afwegingen onderbouwen."
                onChange={(e) => setEditor({ ...editor, strength: e.target.value })}
              />
            </div>

            <div>
              <label className="opl-label">
                Gebruikssituaties <span className="font-normal text-slate-400">(één per regel)</span>
              </label>
              <textarea
                className="opl-input min-h-[80px] resize-y"
                value={editor.useCasesText}
                placeholder={'Een beleidskeuze afwegen\nEen risicoanalyse onderbouwen'}
                onChange={(e) => setEditor({ ...editor, useCasesText: e.target.value })}
              />
            </div>

            {/* Technieken met een eigen bouwer stellen hun vragen zelf: geen
                vragenlijst, maar uitleg over wat de bouwer doet. */}
            {ownBuilder ? (
              <div>
                <label className="opl-label">Vervolgvragen</label>
                <div className="flex items-start gap-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
                  <Info size={16} className="mt-0.5 shrink-0 text-rijksblauw-500" />
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      Deze techniek heeft een eigen bouwer en geen vaste vragen.
                    </p>
                    <p className="mt-1">{ownBuilder}</p>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      Wat je hier wél stuurt: de beschrijving en het doel hierboven, en de template
                      hieronder.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
            <div>
              <label className="opl-label">
                Vervolgvragen{' '}
                <span className="font-normal text-slate-400">
                  (de velden die de gebruiker invult om de template te bouwen)
                </span>
              </label>

              {editor.followUps.length === 0 ? (
                <p className="mb-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
                  Nog geen vragen. Voeg er één toe om de gebruiker te begeleiden.
                </p>
              ) : (
                <div className="space-y-3">
                  {editor.followUps.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <GripVertical size={14} /> Vraag {i + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveFollowUp(i, -1)}
                            disabled={i === 0}
                            className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700"
                            aria-label="Omhoog"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFollowUp(i, 1)}
                            disabled={i === editor.followUps.length - 1}
                            className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700"
                            aria-label="Omlaag"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFollowUp(i)}
                            className="rounded p-1 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10"
                            aria-label="Vraag verwijderen"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <input
                          className="opl-input"
                          value={q.label}
                          placeholder="Vraag aan de gebruiker, bijv. Vanuit welke interne rol/expert?"
                          onChange={(e) => updateFollowUp(i, { label: e.target.value })}
                        />
                        <input
                          className="opl-input"
                          value={q.placeholder ?? ''}
                          placeholder="Placeholder / voorbeeld, bijv. Bijv. een ervaren beleidsmedewerker of een manager"
                          onChange={(e) => updateFollowUp(i, { placeholder: e.target.value })}
                        />
                        <div>
                          <textarea
                            className="opl-input min-h-[64px] resize-y text-sm"
                            value={q.why ?? ''}
                            placeholder="Toelichting: waarom doet deze vraag ertoe en waar moet op worden doorgevraagd?"
                            onChange={(e) => updateFollowUp(i, { why: e.target.value })}
                          />
                          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            Staat als hulptekst onder het veld en stuurt de AI-invulhulp aan.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 dark:text-slate-500">Veld-id:</span>
                          <input
                            className="opl-input h-8 max-w-[200px] font-mono text-xs"
                            value={q.id}
                            placeholder="veld_id"
                            onChange={(e) =>
                              updateFollowUp(i, {
                                id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_'),
                              })
                            }
                          />
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            gebruikt als <code>{`{{${q.id || 'veld_id'}}}`}</code> in de template
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={addFollowUp}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rijksblauw-300 px-3 py-2 text-sm font-medium text-rijksblauw-600 hover:bg-rijksblauw-50 dark:border-rijksblauw-500/40 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/10"
              >
                <Plus size={15} /> Vraag toevoegen
              </button>
            </div>
            )}

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
              <pre tabIndex={0} className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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
