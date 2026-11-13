import { useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent } from '@/lib/nldd';
import AdminSheet from '@/components/admin/AdminSheet';
import { BoundMultiLine, BoundTextField } from '@/components/admin/AdminFields';
import MenuAction from '@/components/common/MenuAction';
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
import '@nldd/design-system/badge';
import '@nldd/design-system/banner';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/drag-handle-cell';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/form-section';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/menu';
import '@nldd/design-system/segmented-control';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/switch-field';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

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

/** Moves one item of a list from one index to another. */
function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// The handle needs `reorderable-only` for nldd-list to start a drag from it; the
// generated JSX types of 0.18.0 list that attribute on nldd-list-item only.
const REORDER_ONLY = { 'reorderable-only': true } as Record<string, unknown>;

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

  /** Drag and drop: the list reports where a row was dropped; store that order. */
  async function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const reordered = arrayMove(techniques, fromIndex, toIndex);
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

  const preview =
    editor &&
    (() => {
      const sample: Record<string, string> = {};
      editor.followUps
        .filter((q) => q.label.trim())
        .forEach((q) => (sample[q.id] = `[${q.label}]`));
      return fillTemplate(editor.template, '[Jouw oorspronkelijke prompt]', sample);
    })();

  // The sheet stays mounted; while it closes it keeps showing the last editor.
  const lastEditor = useRef<EditorState>(EMPTY);
  if (editor) lastEditor.current = editor;
  const ed = editor ?? lastEditor.current;
  const edit = (patch: Partial<EditorState>) => setEditor({ ...ed, ...patch });

  const listRef = useRef<HTMLElement>(null);
  const familyRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ fromIndex: number; toIndex: number }>>(listRef, 'nldd-reorder', (e) => {
    void handleReorder(e.detail.fromIndex, e.detail.toIndex);
  });
  useNlddEvent<CustomEvent<{ value: string }>>(familyRef, 'change', (e) => {
    if (e.detail?.value) edit({ family: e.detail.value as TechniqueFamily });
  });
  useNlddEvent<CustomEvent<{ checked: boolean }>>(activeRef, 'change', (e) => {
    edit({ is_active: !!e.detail?.checked });
  });

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-container layout="stack" gap="16">
        <nldd-title
          heading-level={1}
          size={3}
          text="Technieken beheren"
          supporting-text={`${techniques.length} technieken. Wijzig de volgorde met de greep of via het menu.`}
        ></nldd-title>
        <nldd-button-group>
          <nldd-button
            appearance="primary"
            start-icon="plus"
            text="Nieuwe techniek"
            onClick={() => setEditor({ ...EMPTY })}
          ></nldd-button>
        </nldd-button-group>
      </nldd-container>

      {/* The list stays mounted so its reorder listener is bound from the start. */}
      <nldd-list ref={listRef} appearance="box-tinted" reorderable accessible-label="Technieken">
        {techniques.map((t) => {
          const framework = (t.family ?? 'technique') === 'context';
          const inactive = t.is_active === false;
          const tag = (
            <nldd-tag
              size="sm"
              color={framework ? 'lintblauw' : 'neutral'}
              text={framework ? 'Framework' : 'Techniek'}
            ></nldd-tag>
          );
          return (
            <nldd-list-item key={t.id}>
              <nldd-drag-handle-cell {...REORDER_ONLY}></nldd-drag-handle-cell>
              <nldd-list-item-segment button width="full" onClick={() => setEditor(toEditor(t))}>
                <nldd-text-cell hide-below={inactive ? 'md' : undefined} supporting-text={t.description ?? ''}>
                  {t.name} {tag}
                </nldd-text-cell>
                {/* Narrow, the status column is gone: an inactive row says so after its name. */}
                {inactive && (
                  <nldd-text-cell hide-above="sm" supporting-text={t.description ?? ''}>
                    {t.name} {tag} <nldd-badge size="sm" color="neutral" text="Inactief"></nldd-badge>
                  </nldd-text-cell>
                )}
                <nldd-spacer-cell size="16" hide-below="md"></nldd-spacer-cell>
                {/* A builder of its own asks its own questions; "0" would read as incomplete. */}
                <nldd-text-cell
                  hide-below="md"
                  width="8rem"
                  color="secondary"
                  size="sm"
                  text={selfDirectedBuilder(t) ? 'Eigen bouwer' : `${t.follow_up_questions.length} vervolgvragen`}
                ></nldd-text-cell>
                <nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
                <nldd-cell hide-below="md">
                  <nldd-badge color={inactive ? 'neutral' : 'success'} decorative></nldd-badge>
                </nldd-cell>
                <nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
                <nldd-text-cell
                  hide-below="md"
                  width="4.5rem"
                  size="sm"
                  text={inactive ? 'Inactief' : 'Actief'}
                ></nldd-text-cell>
              </nldd-list-item-segment>
              <nldd-list-item-segment
                button
                popovertarget={`techniek-acties-${t.id}`}
                accessible-label={`Acties voor ${t.name}`}
              >
                <nldd-icon-cell icon="ellipsis" size="20" color="secondary"></nldd-icon-cell>
              </nldd-list-item-segment>
            </nldd-list-item>
          );
        })}
        {loading ? (
          <nldd-inline-dialog slot="empty" variant="loading" text="Technieken laden"></nldd-inline-dialog>
        ) : (
          <nldd-inline-dialog
            slot="empty"
            icon="sparkles"
            text="Nog geen technieken"
            supporting-text="Een nieuwe techniek verschijnt hier en in de promptgenerator."
          ></nldd-inline-dialog>
        )}
      </nldd-list>
      {techniques.map((t, i) => (
        <nldd-menu key={t.id} id={`techniek-acties-${t.id}`} placement="bottom-end">
          <MenuAction icon="pencil" text="Bewerk" onSelect={() => setEditor(toEditor(t))} />
          <MenuAction
            icon="arrow-up"
            text="Omhoog"
            disabled={i === 0 || undefined}
            onSelect={() => void move(t, -1)}
          />
          <MenuAction
            icon="arrow-down"
            text="Omlaag"
            disabled={i === techniques.length - 1 || undefined}
            onSelect={() => void move(t, 1)}
          />
          <MenuAction
            icon={t.is_active === false ? 'eye' : 'eye-slash'}
            text={t.is_active === false ? 'Zet actief' : 'Zet inactief'}
            onSelect={() => void toggleActive(t)}
          />
          <nldd-menu-divider></nldd-menu-divider>
          <MenuAction icon="trash" text="Verwijder" destructive onSelect={() => setToDelete(t)} />
        </nldd-menu>
      ))}

      <AdminSheet
        open={!!editor}
        onClose={() => setEditor(null)}
        title={ed.id ? 'Techniek bewerken' : 'Nieuwe techniek'}
        width="720px"
      >
        <nldd-form>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <nldd-form-field label="Naam">
              <BoundTextField value={ed.name} onValue={(name) => edit({ name })}></BoundTextField>
            </nldd-form-field>

            <nldd-form-field label="Soort">
              <nldd-segmented-control ref={familyRef} value={ed.family}>
                <nldd-segmented-control-item
                  value="technique"
                  text="Prompttechniek"
                  selected={ed.family === 'technique' || undefined}
                ></nldd-segmented-control-item>
                <nldd-segmented-control-item
                  value="context"
                  text="Prompt framework"
                  selected={ed.family === 'context' || undefined}
                ></nldd-segmented-control-item>
              </nldd-segmented-control>
            </nldd-form-field>

            <nldd-switch-field
              ref={activeRef}
              label="Actief (zichtbaar in de promptgenerator)"
              checked={ed.is_active || undefined}
            ></nldd-switch-field>

            <nldd-form-field label="Beschrijving" optional>
              <BoundTextField
                value={ed.description}
                onValue={(description) => edit({ description })}
              ></BoundTextField>
            </nldd-form-field>

            <nldd-form-field label="Doel van de techniek" supporting-label="Helpt de slimme aanbeveling" optional>
              <BoundMultiLine
                rows={2}
                value={ed.strength}
                placeholder="Waar is deze techniek sterk in? Bijv. complexe afwegingen onderbouwen."
                onValue={(strength) => edit({ strength })}
              ></BoundMultiLine>
            </nldd-form-field>

            <nldd-form-field label="Gebruikssituaties" supporting-label="Eén per regel" optional>
              <BoundMultiLine
                rows={3}
                value={ed.useCasesText}
                placeholder={'Een beleidskeuze afwegen\nEen risicoanalyse onderbouwen'}
                onValue={(useCasesText) => edit({ useCasesText })}
              ></BoundMultiLine>
            </nldd-form-field>

            {/* A technique with a builder of its own asks its own questions: no list
                of questions, but an explanation of what the builder does. */}
            {ownBuilder ? (
              <nldd-banner
                variant="accent"
                text="Deze techniek heeft een eigen bouwer en geen vaste vragen."
                supporting-text={ownBuilder}
              >
                <nldd-text size="sm" color="secondary">
                  Wat je hier wél stuurt: de beschrijving en het doel hierboven, en de template hieronder.
                </nldd-text>
              </nldd-banner>
            ) : (
              <nldd-form-section
                text="Vervolgvragen"
                supporting-text="De velden die de gebruiker invult om de template te bouwen"
              >
                {ed.followUps.length === 0 ? (
                  <nldd-text size="sm" color="secondary">
                    Nog geen vragen. Voeg er één toe om de gebruiker te begeleiden.
                  </nldd-text>
                ) : (
                  <nldd-container layout="stack" gap="12">
                    {ed.followUps.map((q, i) => (
                      <nldd-box key={i}>
                        <nldd-container padding="12" layout="stack" gap="8">
                          <nldd-title heading-level={3} size={6} text={`Vraag ${i + 1}`}>
                            <nldd-container slot="end" layout="row" gap="4">
                              <nldd-icon-button
                                size="sm"
                                appearance="neutral-transparent"
                                icon="arrow-up"
                                accessible-label={`Vraag ${i + 1} omhoog`}
                                disabled={i === 0 || undefined}
                                onClick={() => moveFollowUp(i, -1)}
                              ></nldd-icon-button>
                              <nldd-icon-button
                                size="sm"
                                appearance="neutral-transparent"
                                icon="arrow-down"
                                accessible-label={`Vraag ${i + 1} omlaag`}
                                disabled={i === ed.followUps.length - 1 || undefined}
                                onClick={() => moveFollowUp(i, 1)}
                              ></nldd-icon-button>
                              <nldd-icon-button
                                size="sm"
                                appearance="critical-transparent"
                                icon="trash"
                                accessible-label={`Verwijder vraag ${i + 1}`}
                                onClick={() => removeFollowUp(i)}
                              ></nldd-icon-button>
                            </nldd-container>
                          </nldd-title>
                          <nldd-form-field label="Vraag aan de gebruiker">
                            <BoundTextField
                              value={q.label}
                              placeholder="Bijv. Vanuit welke interne rol of expert?"
                              onValue={(label) => updateFollowUp(i, { label })}
                            ></BoundTextField>
                          </nldd-form-field>
                          <nldd-form-field label="Voorbeeld in het veld" optional>
                            <BoundTextField
                              value={q.placeholder ?? ''}
                              placeholder="Bijv. een ervaren beleidsmedewerker of een manager"
                              onValue={(placeholder) => updateFollowUp(i, { placeholder })}
                            ></BoundTextField>
                          </nldd-form-field>
                          <nldd-form-field label="Toelichting" optional>
                            <BoundMultiLine
                              rows={2}
                              value={q.why ?? ''}
                              placeholder="Waarom doet deze vraag ertoe en waar moet op worden doorgevraagd?"
                              onValue={(why) => updateFollowUp(i, { why })}
                            ></BoundMultiLine>
                            <nldd-form-field-help-text>
                              Staat als hulptekst onder het veld en stuurt de AI-invulhulp aan.
                            </nldd-form-field-help-text>
                          </nldd-form-field>
                          <nldd-form-field label="Veld-id">
                            <BoundTextField
                              value={q.id}
                              placeholder="veld_id"
                              no-spellcheck
                              width="16rem"
                              onValue={(id) => updateFollowUp(i, { id: id.replace(/[^a-zA-Z0-9_]/g, '_') })}
                            ></BoundTextField>
                            <nldd-form-field-help-text>
                              Gebruikt als <code>{`{{${q.id || 'veld_id'}}}`}</code> in de template.
                            </nldd-form-field-help-text>
                          </nldd-form-field>
                        </nldd-container>
                      </nldd-box>
                    ))}
                  </nldd-container>
                )}
                <nldd-spacer size="12"></nldd-spacer>
                <nldd-button
                  appearance="secondary"
                  start-icon="plus"
                  text="Vraag toevoegen"
                  onClick={addFollowUp}
                ></nldd-button>
              </nldd-form-section>
            )}

            <nldd-form-field label="Template">
              <BoundMultiLine
                rows={8}
                no-spellcheck
                value={ed.template}
                onValue={(template) => edit({ template })}
              ></BoundMultiLine>
              <nldd-form-field-help-text>
                Gebruik <code>{'{{PROMPT}}'}</code> en <code>{'{{vraag_id}}'}</code>.
              </nldd-form-field-help-text>
            </nldd-form-field>

            <nldd-container layout="stack" gap="8">
              <nldd-title heading-level={3} size={6} text="Preview gegenereerde output"></nldd-title>
              <nldd-code-viewer wrap max-height="12rem">
                {preview || ''}
              </nldd-code-viewer>
            </nldd-container>

            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button appearance="primary" type="submit" text="Bewaar"></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </AdminSheet>

      <ConfirmDialog
        open={!!toDelete}
        title="Techniek verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && handleDelete(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </nldd-container>
  );
}
