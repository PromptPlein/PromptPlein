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

      {loading ? (
        <nldd-container min-height="12rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      ) : (
        <nldd-table accessible-label="Functies" columns="minmax(10rem,1fr) minmax(10rem,2fr) auto" sm-columns="minmax(0,1fr) auto">
          <nldd-table-row slot="header">
            <nldd-text-cell text="Naam"></nldd-text-cell>
            <nldd-text-cell text="Beschrijving" hide-below="md"></nldd-text-cell>
            <nldd-cell>
              <nldd-visually-hidden>Acties</nldd-visually-hidden>
            </nldd-cell>
          </nldd-table-row>
          {roles.map((r, i) => (
            <nldd-table-row key={r.id}>
              <nldd-text-cell row-header text={r.name}></nldd-text-cell>
              <nldd-text-cell text={r.description || 'Geen beschrijving'} color="secondary" hide-below="md"></nldd-text-cell>
              <nldd-cell horizontal-alignment="right">
                <nldd-container layout="row" gap="4">
                  <nldd-icon-button
                    size="sm"
                    appearance="neutral-transparent"
                    icon="pencil"
                    accessible-label={`Bewerk ${r.name}`}
                    onClick={() => setEditor({ id: r.id, name: r.name, description: r.description ?? '' })}
                  ></nldd-icon-button>
                  <nldd-icon-button size="sm" appearance="neutral-transparent" icon="ellipsis" accessible-label={`Meer acties voor ${r.name}`}>
                    <nldd-menu slot="popup" placement="bottom-end">
                      <MenuAction icon="arrow-up" text="Omhoog" disabled={i === 0 || undefined} onSelect={() => move(r, -1)} />
                      <MenuAction icon="arrow-down" text="Omlaag" disabled={i === roles.length - 1 || undefined} onSelect={() => move(r, 1)} />
                      <nldd-menu-divider></nldd-menu-divider>
                      <MenuAction icon="trash" text="Verwijder" destructive onSelect={() => setToDelete(r)} />
                    </nldd-menu>
                  </nldd-icon-button>
                </nldd-container>
              </nldd-cell>
            </nldd-table-row>
          ))}
          <nldd-inline-dialog slot="empty" icon="users" text="Nog geen functies."></nldd-inline-dialog>
        </nldd-table>
      )}

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
