import { useEffect, useMemo, useState } from 'react';
import { Pencil, ShieldCheck, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import Modal from '@/components/common/Modal';
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

  const orgName = useMemo(() => {
    const map = new Map(orgs.map((o) => [o.id, o.name]));
    return (id?: string | null) => (id ? map.get(id) ?? '—' : '—');
  }, [orgs]);

  async function load() {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([listProfiles(), listOrganizations(true)]);
      setProfiles(p);
      setOrgs(o);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Laden mislukt');
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
      toast.success('Gebruiker bijgewerkt');
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Gebruikers beheren</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {profiles.length} gebruikers
          {!canEditRoles && ' · alleen hoofdbeheerders kunnen rollen wijzigen'}
        </p>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam / e-mail</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Organisatie</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{p.full_name || '—'}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{p.email}</div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell dark:text-slate-400">
                    {orgName(p.organization_id)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        p.role === 'super_admin'
                          ? 'bg-rijksblauw-100 text-rijksblauw-800 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                          : p.role === 'admin'
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                      )}
                    >
                      {APP_ROLE_LABELS[p.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck size={14} /> Actief
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                        <ShieldOff size={14} /> Inactief
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
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
                        className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
                        aria-label="Bewerken"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    Nog geen gebruikers.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editor} onClose={() => setEditor(null)} title="Gebruiker bewerken" size="max-w-md">
        {editor && (
          <div className="space-y-4">
            <div>
              <label className="opl-label">E-mailadres</label>
              <input className="opl-input bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400" value={editor.email} disabled />
            </div>
            <div>
              <label className="opl-label">Volledige naam</label>
              <input
                className="opl-input"
                value={editor.full_name}
                onChange={(e) => setEditor({ ...editor, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="opl-label">Rol</label>
              <select
                className="opl-input disabled:bg-slate-50 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                value={editor.role}
                disabled={!canEditRoles || editor.id === user?.id}
                onChange={(e) => setEditor({ ...editor, role: e.target.value as AppRole })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {APP_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {editor.id === user?.id && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">Je kunt je eigen rol niet wijzigen.</p>
              )}
            </div>
            <div>
              <label className="opl-label">Organisatie</label>
              <select
                className="opl-input"
                value={editor.organization_id}
                onChange={(e) => setEditor({ ...editor, organization_id: e.target.value })}
              >
                <option value="">— Geen organisatie —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={editor.is_active}
                onChange={(e) => setEditor({ ...editor, is_active: e.target.checked })}
              />
              Account actief
            </label>
            <div className="flex justify-end gap-3">
              <button className="opl-btn-secondary" onClick={() => setEditor(null)}>
                Annuleren
              </button>
              <button className="opl-btn-primary" onClick={save}>
                Opslaan
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
