import { useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import AdminSheet from '@/components/admin/AdminSheet';
import { BoundMultiLine, BoundTextField } from '@/components/admin/AdminFields';
import MenuAction from '@/components/common/MenuAction';
import { useNlddEvent } from '@/lib/nldd';
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
  const iconRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value: string }>>(iconRef, 'change', (e) => {
    const icon = e.detail?.value ?? (e.target as HTMLSelectElement | null)?.value;
    if (icon) setEditor((ed) => (ed ? { ...ed, icon } : ed));
  });

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
      notify.error('Naam is verplicht');
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
      notify.success('Categorie bijgewerkt');
    } else {
      const created = await createCategory(payload);
      await logAdminAction({ action: 'create_category', entity_type: 'category', entity_id: created.id, changes: payload });
      notify.success('Categorie toegevoegd');
    }
    setEditor(null);
    await load();
    await refresh();
  }

  async function remove(c: Category) {
    await deleteCategory(c.id);
    await logAdminAction({ action: 'delete_category', entity_type: 'category', entity_id: c.id });
    notify.success('Categorie verwijderd');
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
    notify.success(`${count} categorieën geïmporteerd`);
    setCsv('');
    setCsvOpen(false);
    await load();
    await refresh();
  }

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title
        heading-level={1}
        size={2}
        text="Categorieën beheren"
        supporting-text={`${categories.length} categorieën`}
      ></nldd-title>
      <nldd-button-group>
        <nldd-button appearance="secondary" start-icon="upload" text="CSV importeren" onClick={() => setCsvOpen(true)}></nldd-button>
        <nldd-button
          appearance="primary"
          start-icon="plus"
          text="Nieuwe categorie"
          onClick={() => setEditor({ name: '', description: '', icon: 'Folder' })}
        ></nldd-button>
      </nldd-button-group>

      {loading ? (
        <nldd-container min-height="12rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      ) : (
        <nldd-table
          accessible-label="Categorieën"
          columns="minmax(10rem,1fr) minmax(10rem,2fr) 8rem auto"
          sm-columns="minmax(0,1fr) auto"
        >
          <nldd-table-row slot="header">
            <nldd-text-cell text="Naam"></nldd-text-cell>
            <nldd-text-cell text="Beschrijving" hide-below="md"></nldd-text-cell>
            <nldd-text-cell text="Icoon" hide-below="md"></nldd-text-cell>
            <nldd-cell>
              <nldd-visually-hidden>Acties</nldd-visually-hidden>
            </nldd-cell>
          </nldd-table-row>
          {categories.map((c, i) => (
            <nldd-table-row key={c.id}>
              <nldd-text-cell row-header text={c.name}></nldd-text-cell>
              <nldd-text-cell text={c.description || 'Geen beschrijving'} color="secondary" hide-below="md"></nldd-text-cell>
              <nldd-text-cell text={c.icon || 'Geen'} color="secondary" hide-below="md"></nldd-text-cell>
              <nldd-cell horizontal-alignment="right">
                <nldd-container layout="row" gap="4">
                  <nldd-icon-button
                    size="sm"
                    appearance="neutral-transparent"
                    icon="pencil"
                    accessible-label={`Bewerk ${c.name}`}
                    onClick={() =>
                      setEditor({ id: c.id, name: c.name, description: c.description ?? '', icon: c.icon ?? 'Folder' })
                    }
                  ></nldd-icon-button>
                  <nldd-icon-button size="sm" appearance="neutral-transparent" icon="ellipsis" accessible-label={`Meer acties voor ${c.name}`}>
                    <nldd-menu slot="popup" placement="bottom-end">
                      <MenuAction icon="arrow-up" text="Omhoog" disabled={i === 0 || undefined} onSelect={() => move(c, -1)} />
                      <MenuAction
                        icon="arrow-down"
                        text="Omlaag"
                        disabled={i === categories.length - 1 || undefined}
                        onSelect={() => move(c, 1)}
                      />
                      <nldd-menu-divider></nldd-menu-divider>
                      <MenuAction icon="trash" text="Verwijder" destructive onSelect={() => setToDelete(c)} />
                    </nldd-menu>
                  </nldd-icon-button>
                </nldd-container>
              </nldd-cell>
            </nldd-table-row>
          ))}
          <nldd-inline-dialog slot="empty" icon="categories" text="Nog geen categorieën."></nldd-inline-dialog>
        </nldd-table>
      )}

      <AdminSheet
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.id ? 'Categorie bewerken' : 'Nieuwe categorie'}
        width="480px"
      >
        <nldd-form>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <nldd-form-field label="Naam">
              <BoundTextField value={editor?.name ?? ''} onValue={(name) => editor && setEditor({ ...editor, name })}></BoundTextField>
            </nldd-form-field>
            <nldd-form-field label="Beschrijving" optional>
              <BoundTextField
                value={editor?.description ?? ''}
                onValue={(description) => editor && setEditor({ ...editor, description })}
              ></BoundTextField>
            </nldd-form-field>
            <nldd-form-field label="Icoon">
              <nldd-dropdown ref={iconRef}>
                <select value={editor?.icon ?? 'Folder'} onChange={() => undefined}>
                  {ICON_OPTIONS.map((ic) => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </select>
              </nldd-dropdown>
            </nldd-form-field>
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button appearance="primary" type="submit" text="Bewaar"></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </AdminSheet>

      <AdminSheet open={csvOpen} onClose={() => setCsvOpen(false)} title="CSV-import (categorieën)" width="560px">
        <nldd-form>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!csv.trim()) {
                notify.error('Plak eerst een of meer regels.');
                return;
              }
              void importCsv();
            }}
          >
            <nldd-form-field label="Categorieën" supporting-label="Eén categorie per regel, formaat: naam,beschrijving,icoon">
              <BoundMultiLine
                value={csv}
                onValue={setCsv}
                rows={8}
                no-spellcheck
                placeholder={'Subsidies,Aanvragen en regelingen,FileText\nKlachten,Klachtafhandeling,Mail'}
              ></BoundMultiLine>
            </nldd-form-field>
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button appearance="primary" type="submit" start-icon="upload" text="Importeer"></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </AdminSheet>

      <ConfirmDialog
        open={!!toDelete}
        title="Categorie verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen?`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </nldd-container>
  );
}
