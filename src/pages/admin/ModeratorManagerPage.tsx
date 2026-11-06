import { useEffect, useMemo, useState } from 'react';
import { Pencil, ShieldCheck, Search } from '@/components/common/icons';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Modal from '@/components/common/Modal';
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

  const ministryName = useMemo(() => {
    const map = new Map(ministries.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? '—';
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
      toast.error(err instanceof Error ? err.message : 'Laden mislukt');
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

      toast.success('Moderator-toewijzing bijgewerkt');
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Moderatoren beheren
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Wijs gebruikers aan als moderator van een ministerie. Zij beoordelen de prompts die op
          ministerieniveau worden gedeeld binnen die hele tak.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="opl-input pl-9"
          placeholder="Zoek op naam of e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam / e-mail</th>
                <th className="px-4 py-3 font-medium">Modereert ministerie(s)</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((p) => {
                const mods = modsByUser.get(p.id) ?? [];
                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {p.full_name || '—'}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{p.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {mods.length === 0 ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Geen moderator
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {mods.map((m) => (
                            <span
                              key={m.id}
                              className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-50 px-2 py-0.5 text-xs font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200"
                            >
                              <ShieldCheck size={12} /> {ministryName(m.organization_id)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => openEditor(p)}
                          className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
                          aria-label="Moderator-toewijzing bewerken"
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    Geen gebruikers gevonden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor ? `Moderator van ${editor.user.full_name || editor.user.email}` : ''}
        size="max-w-md"
      >
        {editor && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vink de ministeries aan waarvan deze gebruiker moderator is. Een moderator beoordeelt
              de ministerie-prompts van de hele tak (inclusief diensten en afdelingen).
            </p>
            <div className="max-h-72 space-y-1 overflow-auto">
              {ministries.map((m) => {
                const checked = editor.selected.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors',
                      checked
                        ? 'border-rijksblauw-400 bg-rijksblauw-50/60 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(m.id)}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      {m.name}
                      {m.code && (
                        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">({m.code})</span>
                      )}
                    </span>
                  </label>
                );
              })}
              {ministries.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Er zijn nog geen ministeries om aan te koppelen.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button className="opl-btn-secondary" onClick={() => setEditor(null)} disabled={saving}>
                Annuleren
              </button>
              <button className="opl-btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
