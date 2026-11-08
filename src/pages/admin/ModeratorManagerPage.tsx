import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import AdminSheet from '@/components/admin/AdminSheet';
import {
  listProfiles,
  listOrganizations,
  listOrganizationModerators,
  addOrganizationModerator,
  removeOrganizationModerator,
} from '@/services/orgService';
import { logAdminAction } from '@/services/adminService';
import type { Organization, OrganizationModerator, Profile } from '@/types';

/**
 * Adminscherm: wijs gebruikers aan als moderator van een ministerie. Een
 * moderator beoordeelt de Ministerie-deelniveaus van die hele tak (inclusief de
 * onderliggende diensten en afdelingen). Alleen ministeries zijn koppelbaar —
 * dat sluit aan op de goedkeuringsregel "ministerie wordt door een moderator
 * beoordeeld".
 */

interface Editor {
  user: Profile;
  /** De ministerie-id's die in de modal zijn aangevinkt. */
  selected: Set<string>;
}

export default function ModeratorManagerPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ministries, setMinistries] = useState<Organization[]>([]);
  const [moderators, setModerators] = useState<OrganizationModerator[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(searchRef, query, setQuery);

  const ministryName = useMemo(() => {
    const map = new Map(ministries.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? 'Onbekend';
  }, [ministries]);

  /** The short name of a ministry for a row: its code, else its name. */
  const ministryShort = useMemo(() => {
    const map = new Map(ministries.map((m) => [m.id, m.code || m.name]));
    return (id: string) => map.get(id) ?? 'Onbekend';
  }, [ministries]);

  /** Moderator-koppelingen per gebruiker (user_id → koppelingen). */
  const modsByUser = useMemo(() => {
    const map = new Map<string, OrganizationModerator[]>();
    for (const m of moderators) {
      const list = map.get(m.user_id) ?? [];
      list.push(m);
      map.set(m.user_id, list);
    }
    return map;
  }, [moderators]);

  async function load() {
    setLoading(true);
    try {
      const [p, orgs, mods] = await Promise.all([
        listProfiles(),
        listOrganizations(true),
        listOrganizationModerators(),
      ]);
      setProfiles(p);
      // Alleen ministeries zijn koppelbaar als moderator-scope.
      setMinistries(orgs.filter((o) => o.organization_type === 'ministry'));
      setModerators(mods);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.full_name ?? '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [profiles, query]);

  function openEditor(user: Profile) {
    const current = new Set((modsByUser.get(user.id) ?? []).map((m) => m.organization_id));
    setEditor({ user, selected: current });
  }

  function toggle(orgId: string) {
    if (!editor) return;
    const next = new Set(editor.selected);
    if (next.has(orgId)) next.delete(orgId);
    else next.add(orgId);
    setEditor({ ...editor, selected: next });
  }

  async function save() {
    if (!editor) return;
    setSaving(true);
    try {
      const before = new Set((modsByUser.get(editor.user.id) ?? []).map((m) => m.organization_id));
      const after = editor.selected;

      // Toe te voegen: in `after`, niet in `before`.
      const toAdd = [...after].filter((id) => !before.has(id));
      // Te verwijderen: in `before`, niet in `after` — verwijder via koppel-id.
      const toRemove = (modsByUser.get(editor.user.id) ?? []).filter(
        (m) => !after.has(m.organization_id),
      );

      for (const orgId of toAdd) {
        await addOrganizationModerator(editor.user.id, orgId);
      }
      for (const m of toRemove) {
        await removeOrganizationModerator(m.id);
      }

      if (toAdd.length || toRemove.length) {
        await logAdminAction({
          action: 'update_moderators',
          entity_type: 'profile',
          entity_id: editor.user.id,
          changes: {
            added: toAdd.map(ministryName),
            removed: toRemove.map((m) => ministryName(m.organization_id)),
          },
        });
      }

      notify.success('Moderator-toewijzing bijgewerkt');
      setEditor(null);
      await load();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const editorName = editor ? editor.user.full_name || editor.user.email : '';

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title
        heading-level={1}
        size={2}
        text="Moderatoren beheren"
        supporting-text="Wijs gebruikers aan als moderator van een ministerie. Zij beoordelen de prompts die op ministerieniveau worden gedeeld binnen die hele tak."
      ></nldd-title>

      <nldd-search-field
        ref={searchRef}
        width="24rem"
        placeholder="Zoek op naam of e-mail"
      ></nldd-search-field>

      <nldd-list appearance="box-tinted" accessible-label="Gebruikers en hun ministeries">
        {!loading &&
          filtered.map((p) => {
            const mods = modsByUser.get(p.id) ?? [];
            return (
              <nldd-list-item key={p.id} button onClick={() => openEditor(p)}>
                <nldd-text-cell
                  supporting-text={
                    mods.length === 0
                      ? `${p.email} · geen moderator`
                      : `${p.email} · moderator van ${mods.map((m) => ministryShort(m.organization_id)).join(', ')}`
                  }
                >
                  {p.full_name || 'Geen naam'}
                  {mods.length > 0 && (
                    <>
                      {' '}
                      <nldd-tag size="sm" color="lintblauw" icon="shield-check-mark" text="Moderator"></nldd-tag>
                    </>
                  )}
                </nldd-text-cell>
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
            text={profiles.length === 0 ? 'Nog geen gebruikers' : 'Geen gebruikers gevonden'}
            supporting-text={profiles.length === 0 ? undefined : 'Zoek op een andere naam of een ander e-mailadres.'}
          ></nldd-inline-dialog>
        )}
      </nldd-list>

      <AdminSheet
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor ? `Moderator van ${editorName}` : 'Moderator'}
        width="480px"
      >
        <nldd-container layout="stack" gap="16">
          <nldd-text color="secondary">
            Vink de ministeries aan waarvan deze gebruiker moderator is. Een moderator beoordeelt de
            ministerie-prompts van de hele tak, inclusief diensten en afdelingen.
          </nldd-text>
          <nldd-list appearance="box-tinted" accessible-label="Ministeries">
            {ministries.map((m) => (
              <MinistryRow
                key={m.id}
                name={m.name}
                code={m.code}
                checked={!!editor?.selected.has(m.id)}
                onToggle={() => toggle(m.id)}
              />
            ))}
            <nldd-inline-dialog slot="empty" text="Er zijn nog geen ministeries om aan te koppelen."></nldd-inline-dialog>
          </nldd-list>
          <nldd-button-group>
            <nldd-button
              appearance="primary"
              text="Bewaar"
              loading={saving || undefined}
              loading-text="Aan het bewaren"
              onClick={() => void save()}
            ></nldd-button>
          </nldd-button-group>
        </nldd-container>
      </AdminSheet>
    </nldd-container>
  );
}

/** A ministry as a checkbox row; the row fires its own `change`. */
function MinistryRow({
  name,
  code,
  checked,
  onToggle,
}: {
  name: string;
  code?: string | null;
  checked: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'change', () => onToggle());
  return (
    <nldd-list-item ref={ref} checkbox checked={checked || undefined}>
      <nldd-cell>
        <nldd-checkbox decorative checked={checked || undefined}></nldd-checkbox>
      </nldd-cell>
      <nldd-text-cell text={name} supporting-text={code ?? undefined}></nldd-text-cell>
    </nldd-list-item>
  );
}
