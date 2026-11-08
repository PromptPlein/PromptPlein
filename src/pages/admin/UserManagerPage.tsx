import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import AdminSheet from '@/components/admin/AdminSheet';
import { useAuth } from '@/context/AuthContext';
import {
  adminUpdateProfile,
  listProfiles,
  listOrganizations,
  APP_ROLE_LABELS,
} from '@/services/orgService';
import { logAdminAction } from '@/services/adminService';
import type { AppRole, Organization, Profile } from '@/types';

const ROLES: AppRole[] = ['user', 'admin', 'super_admin'];

const ROLE_COLOR: Record<AppRole, 'lintblauw' | 'hemelblauw' | 'neutral'> = {
  super_admin: 'lintblauw',
  admin: 'hemelblauw',
  user: 'neutral',
};

interface Editor {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  organization_id: string;
  is_active: boolean;
}

export default function UserManagerPage() {
  const { hasRole, user } = useAuth();
  const canEditRoles = hasRole('super_admin');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const orgFilterRef = useRef<HTMLElement>(null);
  const sortRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLElement & { value?: string }>(null);
  const roleRef = useRef<HTMLElement>(null);
  const editOrgRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLElement>(null);

  type ValueEvent = CustomEvent<{ value?: string }>;
  const valueOf = (e: Event) =>
    (e as ValueEvent).detail?.value ?? (e.target as HTMLSelectElement | null)?.value ?? '';

  useNlddEvent(orgFilterRef, 'change', (e) => setOrgFilter(valueOf(e)));
  useNlddEvent(sortRef, 'change', (e) => setSortOrder(valueOf(e) as 'newest' | 'oldest'));
  useNlddValue(nameRef, editor?.full_name ?? '', (v) => setEditor((ed) => (ed ? { ...ed, full_name: v } : ed)));
  useNlddEvent(roleRef, 'change', (e) => {
    const v = valueOf(e) as AppRole;
    setEditor((ed) => (ed ? { ...ed, role: v } : ed));
  });
  useNlddEvent(editOrgRef, 'change', (e) => {
    const v = valueOf(e);
    setEditor((ed) => (ed ? { ...ed, organization_id: v } : ed));
  });
  useNlddEvent<CustomEvent<{ checked: boolean }>>(activeRef, 'change', (e) => {
    const checked = !!e.detail?.checked;
    setEditor((ed) => (ed ? { ...ed, is_active: checked } : ed));
  });

  const orgName = useMemo(() => {
    const map = new Map(orgs.map((o) => [o.id, o.name]));
    return (id?: string | null) => (id ? map.get(id) ?? 'Geen' : 'Geen');
  }, [orgs]);

  const visibleProfiles = useMemo(() => {
    const filtered = profiles.filter((p) => {
      if (orgFilter === 'all') return true;
      if (orgFilter === 'none') return !p.organization_id;
      return p.organization_id === orgFilter;
    });
    return [...filtered].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
  }, [profiles, orgFilter, sortOrder]);

  async function load() {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([listProfiles(), listOrganizations(true)]);
      setProfiles(p);
      setOrgs(o);
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
    try {
      await adminUpdateProfile(editor.id, {
        full_name: editor.full_name.trim() || null,
        organization_id: editor.organization_id || null,
        is_active: editor.is_active,
        ...(canEditRoles ? { role: editor.role } : {}),
      });
      await logAdminAction({
        action: 'update_profile',
        entity_type: 'profile',
        entity_id: editor.id,
        changes: {
          role: canEditRoles ? editor.role : undefined,
          organization_id: editor.organization_id || null,
          is_active: editor.is_active,
        },
      });
      notify.success('Gebruiker bijgewerkt');
      setEditor(null);
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    }
  }

  const count =
    `${visibleProfiles.length}${visibleProfiles.length !== profiles.length ? ` van ${profiles.length}` : ''} gebruikers` +
    (!canEditRoles ? ' · alleen hoofdbeheerders kunnen rollen wijzigen' : '');
  const ownAccount = !!editor && editor.id === user?.id;

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title heading-level={1} size={2} text="Gebruikers beheren" supporting-text={count}></nldd-title>

      <nldd-container layout="wrap" gap="16" vertical-alignment="bottom">
        <nldd-container width="18rem">
          <nldd-form-field label="Organisatie">
            <nldd-dropdown ref={orgFilterRef}>
              <select value={orgFilter} onChange={() => undefined}>
                <option value="all">Alle organisaties</option>
                <option value="none">Geen organisatie</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </nldd-dropdown>
          </nldd-form-field>
        </nldd-container>
        <nldd-container width="18rem">
          <nldd-form-field label="Sorteren">
            <nldd-segmented-control ref={sortRef} value={sortOrder}>
              <nldd-segmented-control-item value="newest" text="Nieuwste eerst" selected={sortOrder === 'newest' || undefined}></nldd-segmented-control-item>
              <nldd-segmented-control-item value="oldest" text="Oudste eerst" selected={sortOrder === 'oldest' || undefined}></nldd-segmented-control-item>
            </nldd-segmented-control>
          </nldd-form-field>
        </nldd-container>
      </nldd-container>

      <nldd-list appearance="box-tinted" accessible-label="Gebruikers">
        {!loading &&
          visibleProfiles.map((p) => {
            const name = p.full_name || 'Geen naam';
            const details = `${p.email} · ${p.organization_id ? orgName(p.organization_id) : 'geen organisatie'}`;
            const role = (
              <nldd-tag size="sm" color={ROLE_COLOR[p.role]} text={APP_ROLE_LABELS[p.role]}></nldd-tag>
            );
            return (
              <nldd-list-item
                key={p.id}
                button
                onClick={() =>
                  setEditor({
                    id: p.id,
                    email: p.email,
                    full_name: p.full_name ?? '',
                    role: p.role,
                    organization_id: p.organization_id ?? '',
                    is_active: p.is_active,
                  })
                }
              >
                <nldd-text-cell hide-below={!p.is_active ? 'md' : undefined} supporting-text={details}>
                  {name} {role}
                </nldd-text-cell>
                {/* Narrow, the status column is gone: an inactive account says so after its name. */}
                {!p.is_active && (
                  <nldd-text-cell hide-above="sm" supporting-text={details}>
                    {name} {role} <nldd-badge size="sm" color="neutral" text="Inactief"></nldd-badge>
                  </nldd-text-cell>
                )}
                <nldd-spacer-cell size="16" hide-below="md"></nldd-spacer-cell>
                <nldd-cell hide-below="md">
                  <nldd-badge color={p.is_active ? 'success' : 'neutral'} decorative></nldd-badge>
                </nldd-cell>
                <nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
                <nldd-text-cell
                  hide-below="md"
                  width="4.5rem"
                  size="sm"
                  text={p.is_active ? 'Actief' : 'Inactief'}
                ></nldd-text-cell>
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
              </nldd-list-item>
            );
          })}
        {loading ? (
          <nldd-inline-dialog slot="empty" variant="loading" text="Gebruikers laden"></nldd-inline-dialog>
        ) : (
          <nldd-inline-dialog
            slot="empty"
            icon="users"
            text={profiles.length === 0 ? 'Nog geen gebruikers' : 'Geen gebruikers voor dit filter'}
            supporting-text={
              profiles.length === 0
                ? 'Wie zich registreert, verschijnt hier.'
                : 'Kies een andere organisatie.'
            }
          ></nldd-inline-dialog>
        )}
      </nldd-list>

      <AdminSheet open={!!editor} onClose={() => setEditor(null)} title="Gebruiker bewerken" width="480px">
        <nldd-form>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <nldd-form-field label="E-mailadres">
              <nldd-text-field type="email" value={editor?.email ?? ''} readonly></nldd-text-field>
            </nldd-form-field>
            <nldd-form-field label="Volledige naam">
              <nldd-text-field ref={nameRef} autocomplete="off"></nldd-text-field>
            </nldd-form-field>
            <nldd-form-field label="Rol">
              <nldd-dropdown ref={roleRef} disabled={!canEditRoles || ownAccount || undefined}>
                <select value={editor?.role ?? 'user'} onChange={() => undefined}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {APP_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </nldd-dropdown>
              {ownAccount && (
                <nldd-form-field-help-text>Je kunt je eigen rol niet wijzigen.</nldd-form-field-help-text>
              )}
            </nldd-form-field>
            <nldd-form-field label="Organisatie">
              <nldd-dropdown ref={editOrgRef}>
                <select value={editor?.organization_id ?? ''} onChange={() => undefined}>
                  <option value="">Geen organisatie</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </nldd-dropdown>
            </nldd-form-field>
            <nldd-form-field>
              <nldd-switch-field
                ref={activeRef}
                label="Account actief"
                checked={editor?.is_active || undefined}
              ></nldd-switch-field>
            </nldd-form-field>
            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button appearance="primary" type="submit" text="Bewaar"></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </AdminSheet>
    </nldd-container>
  );
}
