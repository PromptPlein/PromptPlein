import { useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import AdminSheet from '@/components/admin/AdminSheet';
import { BoundMultiLine, BoundTextField } from '@/components/admin/AdminFields';
import MenuAction from '@/components/common/MenuAction';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { createRole, deleteRole, getRoles, updateRole } from '@/services/repository';
import { logAdminAction } from '@/services/adminService';
import type { Role } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/menu';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

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
      notify.error('Naam is verplicht');
      return;
    }
    const payload = { name: editor.name.trim(), description: editor.description.trim() };
    if (editor.id) {
      await updateRole(editor.id, payload);
      await logAdminAction({ action: 'update_role', entity_type: 'role', entity_id: editor.id, changes: payload });
      notify.success('Functie bijgewerkt');
    } else {
      const created = await createRole(payload);
      await logAdminAction({ action: 'create_role', entity_type: 'role', entity_id: created.id, changes: payload });
      notify.success('Functie toegevoegd');
    }
    setEditor(null);
    await load();
    await refresh();
  }

  async function remove(r: Role) {
    await deleteRole(r.id);
    await logAdminAction({ action: 'delete_role', entity_type: 'role', entity_id: r.id });
    notify.success('Functie verwijderd');
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
    notify.success(`${count} functies geïmporteerd`);
    setCsv('');
    setCsvOpen(false);
    await load();
    await refresh();
  }

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title heading-level={1} size={2} text="Functies beheren" supporting-text={`${roles.length} functies`}></nldd-title>
      <nldd-button-group>
        <nldd-button appearance="secondary" start-icon="upload" text="CSV importeren" onClick={() => setCsvOpen(true)}></nldd-button>
        <nldd-button appearance="primary" start-icon="plus" text="Nieuwe functie" onClick={() => setEditor({ name: '', description: '' })}></nldd-button>
      </nldd-button-group>

      <nldd-list appearance="box-tinted" accessible-label="Functies">
        {!loading &&
          roles.map((r) => (
            <nldd-list-item key={r.id}>
              <nldd-list-item-segment button width="full" accessible-label={`Bewerk ${r.name}`} onClick={() => setEditor({ id: r.id, name: r.name, description: r.description ?? '' })}>
                <nldd-text-cell text={r.name} supporting-text={r.description || 'Geen beschrijving'}></nldd-text-cell>
              </nldd-list-item-segment>
              <nldd-list-item-segment
                button
                popovertarget={`functie-acties-${r.id}`}
                accessible-label={`Acties voor ${r.name}`}
              >
                <nldd-icon-cell icon="ellipsis" size="20" color="secondary"></nldd-icon-cell>
              </nldd-list-item-segment>
            </nldd-list-item>
          ))}
        {loading ? (
          <nldd-inline-dialog slot="empty" variant="loading" text="Functies laden"></nldd-inline-dialog>
        ) : (
          <nldd-inline-dialog slot="empty" icon="users" text="Nog geen functies"></nldd-inline-dialog>
        )}
      </nldd-list>
      {roles.map((r, i) => (
        <nldd-menu key={r.id} id={`functie-acties-${r.id}`} placement="bottom-end">
          <MenuAction icon="pencil" text="Bewerk" onSelect={() => setEditor({ id: r.id, name: r.name, description: r.description ?? '' })} />
          <MenuAction icon="arrow-up" text="Omhoog" disabled={i === 0 || undefined} onSelect={() => move(r, -1)} />
          <MenuAction icon="arrow-down" text="Omlaag" disabled={i === roles.length - 1 || undefined} onSelect={() => move(r, 1)} />
          <nldd-menu-divider></nldd-menu-divider>
          <MenuAction icon="trash" text="Verwijder" destructive onSelect={() => setToDelete(r)} />
        </nldd-menu>
      ))}

      <AdminSheet open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? 'Functie bewerken' : 'Nieuwe functie'} width="480px">
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
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button appearance="primary" type="submit" text="Bewaar"></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </AdminSheet>

      <AdminSheet open={csvOpen} onClose={() => setCsvOpen(false)} title="CSV-import (functies)" width="560px">
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
            <nldd-form-field label="Functies" supporting-label="Eén functie per regel, formaat: naam,beschrijving">
              <BoundMultiLine
                value={csv}
                onValue={setCsv}
                rows={8}
                no-spellcheck
                placeholder={'Inkoopadviseur,Adviseert over aanbestedingen\nHR-adviseur,Personeelszaken'}
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
        title="Functie verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen?`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </nldd-container>
  );
}
