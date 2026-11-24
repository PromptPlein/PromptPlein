import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, ImageOff, Search, X } from '@/components/common/icons';
import toast from 'react-hot-toast';
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
import { descendantsInOrder, orgChain } from '@/lib/orgTree';
import { matchesAll } from '@/lib/zoekMatch';

const isTop = (o: Organization) =>
  o.organization_type === 'ministry' || o.organization_type === 'government';

const byName = (a: Organization, b: Organization) =>
  a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });

/** Een groep in de boom: een ministerie met alles wat eronder hangt. */
interface Group {
  key: string;
  ministry: Organization | null;
  nodes: { org: Organization; depth: number }[];
}

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

  // Standaard de lagen die veranderen: directies, diensten en afdelingen, per
  // ministerie als boom. De ministeries zelf staan op een eigen tabblad.
  const [tab, setTab] = useState<'lagen' | 'ministeries'>('lagen');
  const [query, setQuery] = useState('');

  const tops = useMemo(() => orgs.filter(isTop).sort(byName), [orgs]);

  const groups = useMemo<Group[]>(() => {
    const seen = new Set<string>();
    const out: Group[] = [];
    for (const m of tops) {
      if (m.organization_type !== 'ministry') continue;
      const nodes = descendantsInOrder(m.id, orgs);
      nodes.forEach((n) => seen.add(n.org.id));
      if (nodes.length > 0) out.push({ key: m.id, ministry: m, nodes });
    }
    // Wat onder geen ministerie hangt, mag niet uit beeld raken.
    const loose = orgs.filter((o) => !isTop(o) && !seen.has(o.id)).sort(byName);
    if (loose.length > 0) {
      out.push({ key: 'los', ministry: null, nodes: loose.map((org) => ({ org, depth: 1 })) });
    }
    return out;
  }, [orgs, tops]);

  // Zoeken houdt de lagen erboven in beeld, zodat je ziet waar een treffer onder valt.
  const shownGroups = useMemo<Group[]>(() => {
    const q = query.trim();
    if (!q) return groups;
    const byId = new Map(orgs.map((o) => [o.id, o]));
    return groups
      .map((g) => {
        if (g.ministry && matchesAll(q, `${g.ministry.name} ${g.ministry.code ?? ''}`)) return g;
        const keep = new Set<string>();
        for (const { org } of g.nodes) {
          if (!matchesAll(q, `${org.name} ${org.code ?? ''}`)) continue;
          let cur: Organization | undefined = org;
          while (cur && !isTop(cur) && !keep.has(cur.id)) {
            keep.add(cur.id);
            cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
          }
        }
        return { ...g, nodes: g.nodes.filter((n) => keep.has(n.org.id)) };
      })
      .filter((g) => g.nodes.length > 0);
  }, [groups, orgs, query]);

  const shownTops = useMemo(() => {
    const q = query.trim();
    return q ? tops.filter((o) => matchesAll(q, `${o.name} ${o.code ?? ''}`)) : tops;
  }, [tops, query]);

  const counts = useMemo(() => {
    const afdelingen = orgs.filter((o) => o.organization_type === 'department').length;
    return {
      afdelingen,
      directies: orgs.length - afdelingen - tops.length,
      ministeries: tops.filter((o) => o.organization_type === 'ministry').length,
    };
  }, [orgs, tops]);

  /** Hoeveel afdelingen er onder een laag hangen, ook dieper. */
  const afdelingenOnder = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orgs) {
      if (o.organization_type !== 'department') continue;
      for (const up of orgChain(o.id, orgs).slice(0, -1)) {
        map.set(up.id, (map.get(up.id) ?? 0) + 1);
      }
    }
    return map;
  }, [orgs]);

  /** Bovenliggende organisatie kiezen: als boom, met het pad bij elke laag. */
  const parentOptions = useMemo(() => {
    const out: { id: string; label: string; afdeling?: boolean }[] = [];
    for (const t of tops) {
      out.push({ id: t.id, label: t.code ? `${t.name} (${t.code})` : t.name });
      for (const { org, depth } of descendantsInOrder(t.id, orgs)) {
        out.push({
          id: org.id,
          afdeling: org.organization_type === 'department',
          label: `${'\u00a0\u00a0\u00a0'.repeat(depth)}${org.code ? `${org.name} (${org.code})` : org.name}`,
        });
      }
    }
    return out;
  }, [tops, orgs]);

  function startEdit(o: Organization) {
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

  function actions(o: Organization, withAdd = false) {
    return (
      <div className="flex shrink-0 items-center justify-end gap-1">
        {withAdd && (
          <button
            onClick={() => setEditor({ ...EMPTY, parent_id: o.id, organization_type: 'department' })}
            className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
            aria-label={`Afdeling toevoegen onder ${o.name}`}
            title="Afdeling toevoegen"
          >
            <Plus size={15} />
          </button>
        )}
        <button
          onClick={() => startEdit(o)}
          className="rounded p-1.5 text-rijksblauw-500 hover:bg-rijksblauw-50 dark:hover:bg-rijksblauw-500/15"
          aria-label={`${o.name} bewerken`}
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={() => setToDelete(o)}
          className="rounded p-1.5 text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10"
          aria-label={`${o.name} verwijderen`}
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  async function load() {
    setLoading(true);
    try {
      setOrgs(await listOrganizations(true));
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
    if (!editor.name.trim()) {
      toast.error('Naam is verplicht');
      return;
    }

    // Upload een nieuw gekozen logo nu pas (bij opslaan), niet eerder.
    let logoUrl = editor.logo_url?.trim() || null;
    if (pendingLogo) {
      setSavingLogo(true);
      try {
        logoUrl = await uploadOrgLogo(pendingLogo, editor.code || editor.name);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Logo uploaden mislukt');
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
        toast.success('Organisatie bijgewerkt');
      } else {
        const created = await createOrganization(payload);
        await logAdminAction({
          action: 'create_organization',
          entity_type: 'organization',
          entity_id: created.id,
          changes: { ...payload },
        });
        toast.success('Organisatie toegevoegd');
      }
      setPendingLogo(null);
      setEditor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
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
      toast.error('Kies een afbeeldingsbestand.');
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
      toast.success('Organisatie verwijderd');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verwijderen mislukt');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Organisaties beheren</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {counts.directies} directies en diensten, {counts.afdelingen} afdelingen, {counts.ministeries} ministeries
          </p>
        </div>
        <button
          className="opl-btn-primary"
          onClick={() =>
            setEditor({ ...EMPTY, organization_type: tab === 'lagen' ? 'department' : 'ministry' })
          }
        >
          <Plus size={18} /> Nieuwe organisatie
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Weergave" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          {(
            [
              ['lagen', 'Directies en afdelingen'],
              ['ministeries', 'Ministeries'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                tab === key
                  ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-600'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-[1_1_14rem]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            className="opl-input pl-9 pr-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op naam of afkorting"
            aria-label="Zoek op naam of afkorting"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Zoekterm wissen"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="opl-card skeleton h-48 w-full" />
      ) : tab === 'lagen' ? (
        <div className="space-y-4">
          {shownGroups.map((g) => (
            <section key={g.key} className="opl-card overflow-hidden" aria-labelledby={`groep-${g.key}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <h2 id={`groep-${g.key}`} className="text-base font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                  {g.ministry ? g.ministry.name : 'Zonder ministerie'}
                  {g.ministry?.code && (
                    <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">{g.ministry.code}</span>
                  )}
                </h2>
                {g.ministry && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {afdelingenOnder.get(g.ministry.id) ?? 0} afdelingen
                  </span>
                )}
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {g.nodes.map(({ org, depth }) => {
                  const isAfdeling = org.organization_type === 'department';
                  const aantal = afdelingenOnder.get(org.id) ?? 0;
                  return (
                    <li
                      key={org.id}
                      className={clsx(
                        'flex items-center gap-3 py-2.5 pr-3',
                        !isAfdeling && 'bg-white dark:bg-slate-900/20',
                      )}
                      style={{ paddingLeft: `${1 + (depth - 1) * 1.5}rem` }}
                    >
                      <div
                        className={clsx(
                          'min-w-0 flex-1',
                          depth > 1 && 'border-l-2 border-rijksblauw-100 pl-3 dark:border-rijksblauw-500/30',
                        )}
                      >
                        <div
                          className={clsx(
                            'text-slate-800 dark:text-slate-100',
                            isAfdeling ? 'text-sm' : 'font-semibold',
                          )}
                        >
                          {org.name}
                          {org.code && (
                            <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">{org.code}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {ORG_TYPE_LABELS[org.organization_type]}
                          {!isAfdeling && `, ${aantal} ${aantal === 1 ? 'afdeling' : 'afdelingen'}`}
                          {!org.is_active && (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              Inactief
                            </span>
                          )}
                        </div>
                      </div>
                      {actions(org, !isAfdeling)}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {shownGroups.length === 0 && (
            <p className="opl-card px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {query.trim() ? `Niets gevonden voor “${query.trim()}”.` : 'Nog geen directies of afdelingen.'}
            </p>
          )}
        </div>
      ) : (
        <div className="opl-card overflow-hidden">
          <StackTable>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Afdelingen</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Bovenliggend</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {shownTops.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{o.name}</div>
                    {o.code && <div className="text-xs text-slate-400 dark:text-slate-500">{o.code}</div>}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-500 sm:table-cell dark:text-slate-400">
                    {afdelingenOnder.get(o.id) ?? 0}
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
                  <td className="px-4 py-3">{actions(o)}</td>
                </tr>
              ))}
              {shownTops.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    {query.trim() ? `Niets gevonden voor “${query.trim()}”.` : 'Nog geen ministeries.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </StackTable>
        </div>
      )}

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
                  <option value="">Geen (bovenste laag)</option>
                  {parentOptions
                    // Onder een afdeling hangt niets, tenzij dat nu al zo is.
                    .filter((o) => o.id !== editor.id && (!o.afdeling || o.id === editor.parent_id))
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
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
