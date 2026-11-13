import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import AdminSheet from '@/components/admin/AdminSheet';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import MenuAction from '@/components/common/MenuAction';
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
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/avatar';
import '@nldd/design-system/badge';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/dropdown';
import '@nldd/design-system/file-field';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/menu';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/switch-field';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';

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

  type Field = HTMLElement & { value?: string };
  const nameRef = useRef<Field>(null);
  const codeRef = useRef<Field>(null);
  const typeRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLElement>(null);
  const parentRef = useRef<HTMLElement>(null);
  const emailRef = useRef<Field>(null);
  const descriptionRef = useRef<Field>(null);
  const activeRef = useRef<HTMLElement>(null);

  function setField<K extends keyof Editor>(key: K, value: Editor[K]) {
    setEditor((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  const valueOf = (e: Event) =>
    (e as CustomEvent<{ value?: string }>).detail?.value ?? (e.target as HTMLSelectElement | null)?.value ?? '';

  useNlddValue(nameRef, editor?.name ?? '', (v) => setField('name', v));
  useNlddValue(codeRef, editor?.code ?? '', (v) => setField('code', v));
  useNlddValue(emailRef, editor?.contact_email ?? '', (v) => setField('contact_email', v));
  useNlddValue(descriptionRef, editor?.description ?? '', (v) => setField('description', v));
  useNlddEvent(typeRef, 'change', (e) => setField('organization_type', valueOf(e) as OrganizationType));
  useNlddEvent(parentRef, 'change', (e) => setField('parent_id', valueOf(e)));
  useNlddEvent<CustomEvent<{ checked: boolean }>>(activeRef, 'change', (e) => setField('is_active', !!e.detail?.checked));
  useNlddEvent<CustomEvent<{ files: File[] }>>(fileRef, 'change', (e) => pickFile(e.detail?.files?.[0]));

  const orgName = useMemo(() => {
    const map = new Map(orgs.map((o) => [o.id, o.name]));
    return (id?: string | null) => (id ? map.get(id) ?? 'Onbekend' : 'Geen');
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

  function openEditor(o: Organization) {
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
    });
  }

  const logo = editor?.logo_url?.trim() ?? '';
  const initials = ((editor?.code?.trim() || editor?.name.trim() || '').slice(0, 3)).toUpperCase();

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-container layout="stack" gap="16">
        <nldd-title heading-level={1} size={3} text="Organisaties beheren" supporting-text={`${orgs.length} organisaties`}></nldd-title>
        <nldd-button-group>
          <nldd-button
            appearance="primary"
            start-icon="plus"
            text="Nieuwe organisatie"
            onClick={() => setEditor({ ...EMPTY })}
          ></nldd-button>
        </nldd-button-group>
      </nldd-container>

      <nldd-list appearance="box-tinted" accessible-label="Organisaties">
        {!loading &&
          orgs.map((o) => {
            const details = [
              o.code,
              ORG_TYPE_LABELS[o.organization_type],
              o.parent_id ? `onder ${orgName(o.parent_id)}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <nldd-list-item key={o.id}>
                <nldd-list-item-segment button width="full" onClick={() => openEditor(o)}>
                  {/* A code longer than three letters would be cut off, so that row shows the building icon. */}
                  <nldd-cell>
                    <nldd-avatar
                      type="organization"
                      size="32"
                      src={o.logo_url || undefined}
                      initials={o.code && o.code.length <= 3 ? o.code.toUpperCase() : undefined}
                      decorative
                    ></nldd-avatar>
                  </nldd-cell>
                  <nldd-spacer-cell size="12"></nldd-spacer-cell>
                  <nldd-text-cell hide-below={!o.is_active ? 'md' : undefined} text={o.name} supporting-text={details}></nldd-text-cell>
                  {/* Narrow, the status column is gone: an inactive organization says so after its name. */}
                  {!o.is_active && (
                    <nldd-text-cell hide-above="sm" supporting-text={details}>
                      {o.name} <nldd-badge size="sm" color="neutral" text="Inactief"></nldd-badge>
                    </nldd-text-cell>
                  )}
                  <nldd-spacer-cell size="16" hide-below="md"></nldd-spacer-cell>
                  <nldd-cell hide-below="md">
                    <nldd-badge color={o.is_active ? 'success' : 'neutral'} decorative></nldd-badge>
                  </nldd-cell>
                  <nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
                  <nldd-text-cell
                    hide-below="md"
                    width="4.5rem"
                    size="sm"
                    text={o.is_active ? 'Actief' : 'Inactief'}
                  ></nldd-text-cell>
                </nldd-list-item-segment>
                <nldd-list-item-segment
                  button
                  popovertarget={`organisatie-acties-${o.id}`}
                  accessible-label={`Acties voor ${o.name}`}
                >
                  <nldd-icon-cell icon="ellipsis" size="20" color="secondary"></nldd-icon-cell>
                </nldd-list-item-segment>
              </nldd-list-item>
            );
          })}
        {loading ? (
          <nldd-inline-dialog slot="empty" variant="loading" text="Organisaties laden"></nldd-inline-dialog>
        ) : (
          <nldd-inline-dialog
            slot="empty"
            icon="building"
            text="Nog geen organisaties"
            supporting-text="Begin met de Rijksoverheid of een ministerie; de rest hangt daaronder."
          ></nldd-inline-dialog>
        )}
      </nldd-list>
      {orgs.map((o) => (
        <nldd-menu key={o.id} id={`organisatie-acties-${o.id}`} placement="bottom-end">
          <MenuAction icon="pencil" text="Bewerk" onSelect={() => openEditor(o)} />
          <nldd-menu-divider></nldd-menu-divider>
          <MenuAction icon="trash" text="Verwijder" destructive onSelect={() => setToDelete(o)} />
        </nldd-menu>
      ))}

      <AdminSheet
        open={!!editor}
        onClose={closeEditor}
        title={editor?.id ? 'Organisatie bewerken' : 'Nieuwe organisatie'}
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
              <nldd-text-field ref={nameRef} required></nldd-text-field>
            </nldd-form-field>
            <nldd-form-field label="Code" optional>
              <nldd-text-field ref={codeRef} placeholder="bijv. BZK"></nldd-text-field>
            </nldd-form-field>
            <nldd-form-field label="Type">
              <nldd-dropdown ref={typeRef}>
                <select value={editor?.organization_type ?? 'ministry'} onChange={() => undefined}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ORG_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </nldd-dropdown>
            </nldd-form-field>
            <nldd-form-field
              label="Logo"
              optional
              supporting-label="Je kunt het logo bijsnijden en zoomen; het wordt vierkant en geoptimaliseerd opgeslagen."
            >
              <nldd-container layout="row" gap="16" vertical-alignment="center">
                {savingLogo ? (
                  <nldd-container width="64px" min-height="64px">
                    <nldd-activity-indicator size="24" text="Logo uploaden" timing="instant"></nldd-activity-indicator>
                  </nldd-container>
                ) : (
                  <nldd-avatar
                    type="organization"
                    size="64"
                    src={logo || undefined}
                    initials={initials || undefined}
                    name={editor?.name || 'Logo'}
                  ></nldd-avatar>
                )}
                <nldd-file-field ref={fileRef} accept="image/*" accessible-label="Logo"></nldd-file-field>
                {logo && !savingLogo && (
                  <nldd-icon-button
                    appearance="critical-transparent"
                    icon="trash"
                    accessible-label="Verwijder logo"
                    onClick={() => {
                      setPendingLogo(null);
                      setField('logo_url', '');
                    }}
                  ></nldd-icon-button>
                )}
              </nldd-container>
              <nldd-form-field-help-text>
                Zonder logo toont het organogram de code (bijv. OCW, DUO).
              </nldd-form-field-help-text>
            </nldd-form-field>
            <nldd-form-field label="Bovenliggende organisatie">
              <nldd-dropdown ref={parentRef}>
                <select value={editor?.parent_id ?? ''} onChange={() => undefined}>
                  <option value="">Geen (top-niveau)</option>
                  {orgs
                    .filter((o) => o.id !== editor?.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </nldd-dropdown>
            </nldd-form-field>
            <nldd-form-field label="Contact-e-mail" optional>
              <nldd-text-field ref={emailRef} type="email" autocomplete="email"></nldd-text-field>
            </nldd-form-field>
            <nldd-form-field label="Beschrijving" optional>
              <nldd-text-field ref={descriptionRef}></nldd-text-field>
            </nldd-form-field>
            <nldd-form-field>
              <nldd-switch-field ref={activeRef} label="Actief" checked={(editor?.is_active ?? true) || undefined}></nldd-switch-field>
            </nldd-form-field>
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button
                  appearance="primary"
                  type="submit"
                  text="Bewaar"
                  loading={savingLogo || undefined}
                  loading-text="Logo uploaden"
                ></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </AdminSheet>

      <AdminSheet
        open={!!cropSrc}
        onClose={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        title="Logo bijsnijden"
        width="480px"
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
      </AdminSheet>

      <ConfirmDialog
        open={!!toDelete}
        title="Organisatie verwijderen"
        message={`Weet je zeker dat je "${toDelete?.name}" wilt verwijderen? Gekoppelde gebruikers verliezen hun organisatie.`}
        destructive
        confirmLabel="Verwijderen"
        onConfirm={() => toDelete && remove(toDelete)}
        onClose={() => setToDelete(null)}
      />
    </nldd-container>
  );
}
