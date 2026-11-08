import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, ImageOff } from '@/components/common/icons';
import { notify } from '@/lib/notify';
import clsx from 'clsx';
import Modal from '@/components/common/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LogoCropper from '@/components/common/LogoCropper';
import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listOrganizations,
  uploadOrgLogo,
  ORG_TYPE_LABELS,
  type OrganizationInput,
} from '@/services/orgService';
import { logAdminAction } from '@/services/adminService';
import type { Organization, OrganizationType } from '@/types';
import StackTable from '@/components/common/StackTable';

const TYPES: OrganizationType[] = [
  'government',
  'ministry',
  'directorate_general',
  'directorate',
  'agency',
  'department',
];

interface Editor extends OrganizationInput {
  id?: string;
}

const EMPTY: Editor = {
  name: '',
  code: '',
  description: '',
  logo_url: '',
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
  // Logo-upload: bron-URL van het te bewerken bestand + nog niet-geüploade blob.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<Blob | null>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgName = useMemo(() => {
    const map = new Map(orgs.map((o) => [o.id, o.name]));
    return (id?: string | null) => (id ? map.get(id) ?? '—' : '—');
  }, [orgs]);

  async function load() {
    setLoading(true);
    try {
      setOrgs(await listOrganizations(true));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Laden mislukt');
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
      notify.error('Naam is verplicht');
      return;
    }

    // Upload een nieuw gekozen logo nu pas (bij opslaan), niet eerder.
    let logoUrl = editor.logo_url?.trim() || null;
    if (pendingLogo) {
      setSavingLogo(true);
      try {
        logoUrl = await uploadOrgLogo(pendingLogo, editor.code || editor.name);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Logo uploaden mislukt');
        setSavingLogo(false);
        return;
      }
      setSavingLogo(false);
    } else if (logoUrl?.startsWith('data:')) {
      // Veiligheidsnet: een data-URL (preview) hoort nooit in de database.
      logoUrl = null;
    }

    const payload: OrganizationInput = {
      name: editor.name.trim(),
      code: editor.code?.trim() || null,
      description: editor.description?.trim() || null,
      logo_url: logoUrl,
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
        notify.success('Organisatie bijgewerkt');
      } else {
        const created = await createOrganization(payload);
        await logAdminAction({
          action: 'create_organization',
          entity_type: 'organization',
          entity_id: created.id,
          changes: { ...payload },
        });
        notify.success('Organisatie toegevoegd');
      }
      setPendingLogo(null);
      setEditor(null);
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    }
  }

  // --- Logo-upload ---

  function closeEditor() {
    setPendingLogo(null);
    setEditor(null);
  }

  function pickFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('Kies een afbeeldingsbestand.');
      return;
    }
    setCropSrc(URL.createObjectURL(file));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function handleCropConfirm(blob: Blob, previewUrl: string) {
    if (!editor) return;
    // Alleen een lokale preview tonen + de blob onthouden. De daadwerkelijke
    // upload naar de bucket gebeurt pas bij "Opslaan", zodat er geen weeslogo's
    // achterblijven als de bewerking wordt geannuleerd.
    setPendingLogo(blob);
    setEditor((prev) => (prev ? { ...prev, logo_url: previewUrl } : prev));
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function remove(o: Organization) {
    try {
      await deleteOrganization(o.id);
      await logAdminAction({
        action: 'delete_organization',
        entity_type: 'organization',
        entity_id: o.id,
      });
      notify.success('Organisatie verwijderd');
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Verwijderen mislukt');
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
          <StackTable>
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
                            logo_url: o.logo_url ?? '',
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
          </StackTable>
        )}
      </div>

      <Modal
        open={!!editor}
        onClose={closeEditor}
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
                <label className="opl-label">Logo</label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  className={clsx(
                    'flex items-center gap-4 rounded-xl border-2 border-dashed p-3 transition-colors',
                    dragActive
                      ? 'border-rijksblauw-400 bg-rijksblauw-50/60 dark:bg-rijksblauw-500/10'
                      : 'border-slate-300 dark:border-slate-600',
                  )}
                >
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900">
                    {savingLogo ? (
                      <span className="text-[0.625rem] text-slate-400">Uploaden…</span>
                    ) : editor.logo_url?.trim() ? (
                      <img src={editor.logo_url.trim()} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-sm font-bold text-rijksblauw-500">
                        {(editor.code?.trim() || editor.name.trim().slice(0, 3)).toUpperCase() || (
                          <ImageOff size={18} className="text-slate-300" />
                        )}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="opl-btn-secondary"
                    >
                      <Upload size={15} /> Logo uploaden
                    </button>
                    {editor.logo_url?.trim() && !savingLogo && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingLogo(null);
                          setEditor({ ...editor, logo_url: '' });
                        }}
                        className="ml-2 text-xs text-rijksrood hover:underline"
                      >
                        Verwijderen
                      </button>
                    )}
                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                      Sleep een afbeelding hierheen of klik. Je kunt het logo bijsnijden en zoomen;
                      het wordt vierkant en geoptimaliseerd opgeslagen. Zonder logo toont het
                      organogram de code (bijv. OCW, DUO).
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      pickFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
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
              <button className="opl-btn-secondary" onClick={closeEditor}>
                Annuleren
              </button>
              <button className="opl-btn-primary" onClick={save} disabled={savingLogo}>
                {savingLogo ? 'Logo uploaden…' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!cropSrc}
        onClose={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        title="Logo bijsnijden"
        size="max-w-md"
      >
        {cropSrc && (
          <LogoCropper
            src={cropSrc}
            onConfirm={handleCropConfirm}
            onCancel={() => {
              URL.revokeObjectURL(cropSrc);
              setCropSrc(null);
            }}
          />
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
