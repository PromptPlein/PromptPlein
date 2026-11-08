import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, FileCode2, Loader2, RotateCcw, Search } from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  getPromptCatalog,
  getPromptOverrides,
  savePromptOverrides,
  type ServerPrompt,
} from '@/services/promptAdminService';
import { logAdminAction } from '@/services/adminService';

/**
 * Beheer, Prompts: alle systeemprompts van de AI-laag op één plek, gegroepeerd
 * naar waar ze in de app gebruikt worden. De beheerder past een tekst aan, ziet
 * welke afwijken van de standaard en zet ze met één klik terug. Opslaan geldt
 * voor iedereen, binnen een halve minuut.
 */
export default function PromptsPage() {
  const [catalog, setCatalog] = useState<ServerPrompt[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // De opgeslagen eigen versies en wat er nu in de tekstvakken staat.
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getPromptCatalog(), getPromptOverrides()])
      .then(([prompts, overrides]) => {
        if (!active) return;
        setCatalog(prompts);
        setSaved(overrides);
        setDrafts(
          Object.fromEntries(prompts.map((p) => [p.id, overrides[p.id] ?? p.standaard])),
        );
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'De prompts konden niet worden geladen');
      });
    return () => {
      active = false;
    };
  }, []);

  // Wat er zou worden opgeslagen: alleen teksten die afwijken van de standaard.
  const nextOverrides = useMemo(() => {
    if (!catalog) return {};
    return Object.fromEntries(
      catalog
        .filter((p) => drafts[p.id]?.trim() && drafts[p.id] !== p.standaard)
        .map((p) => [p.id, drafts[p.id]]),
    );
  }, [catalog, drafts]);
  const dirty = JSON.stringify(nextOverrides) !== JSON.stringify(saved);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (catalog ?? []).filter(
      (p) =>
        !q ||
        p.titel.toLowerCase().includes(q) ||
        p.uitleg.toLowerCase().includes(q) ||
        (drafts[p.id] ?? '').toLowerCase().includes(q),
    );
    const byGroup = new Map<string, ServerPrompt[]>();
    for (const p of list) byGroup.set(p.groep, [...(byGroup.get(p.groep) ?? []), p]);
    return [...byGroup.entries()];
  }, [catalog, drafts, query]);

  async function handleSave() {
    setSaving(true);
    try {
      await savePromptOverrides(nextOverrides);
      const changed = [
        ...new Set([...Object.keys(saved), ...Object.keys(nextOverrides)]),
      ].filter((id) => saved[id] !== nextOverrides[id]);
      await logAdminAction({
        action: 'update_setting',
        entity_type: 'app_setting',
        entity_id: 'prompt_overrides',
        changes: { aangepast: Object.keys(nextOverrides).length, gewijzigd: changed },
      }).catch(() => {
        /* audit is best-effort */
      });
      setSaved(nextOverrides);
      toast.success('Prompts opgeslagen. Binnen een halve minuut gebruikt de AI de nieuwe tekst.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Prompts</h1>
        <div className="opl-card p-6 text-sm text-red-700 dark:text-red-300">
          De prompts konden niet worden geladen: {loadError}
        </div>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Prompts</h1>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Prompts laden…
        </div>
      </div>
    );
  }

  const aantalAangepast = Object.keys(nextOverrides).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <FileCode2 size={20} className="text-rijksblauw-500" /> Prompts
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Alle systeemprompts van de AI-laag, gegroepeerd naar waar ze gebruikt worden. Pas een
            tekst aan en sla op; binnen een halve minuut gebruikt de AI de nieuwe versie, voor
            iedereen. De hoofdprompt, de toon, de chat, de projectinstructie en de overheidskaders
            staan bij{' '}
            <Link to="/admin/instellingen" className="text-rijksblauw-600 hover:underline dark:text-rijksblauw-300">
              AI-instellingen
            </Link>
            .
          </p>
          <p className="mt-1 max-w-3xl text-xs text-slate-400 dark:text-slate-500">
            Tekst tussen dubbele accolades, zoals {'{{sleutels}}'} of {'{{bronnenpunt}}'}, vult de
            server in. Laat die staan. Prompts worden geschreven voor een klein model: houd ze
            concreet, met een exact uitvoersjabloon, en zet er geen twee regels in die elkaar
            tegenspreken.
          </p>
        </div>
        <button
          type="button"
          className="opl-btn-primary"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          Opslaan
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="opl-input pl-9 text-sm"
            placeholder="Zoek op naam of tekst"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {catalog.length} prompts, {aantalAangepast} aangepast
        </span>
      </div>

      {groups.map(([groep, prompts]) => (
        <section key={groep} className="opl-card overflow-hidden">
          <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {groep}
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {prompts.map((p) => {
              const isOpen = open === p.id;
              const aangepast = drafts[p.id] !== p.standaard;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      size={16}
                      className={clsx('mt-0.5 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                        {p.titel}
                        {aangepast && (
                          <span className="rounded-full bg-pleingroen/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-pleingroen">
                            aangepast
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{p.uitleg}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-2 px-5 pb-4">
                      <textarea
                        className="opl-input min-h-[320px] resize-y font-mono text-[0.78125rem] leading-relaxed"
                        value={drafts[p.id] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        aria-label={p.titel}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
                        <span className="font-mono">{p.id}</span>
                        {aangepast && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                            onClick={() => setDrafts((d) => ({ ...d, [p.id]: p.standaard }))}
                          >
                            <RotateCcw size={12} /> Herstel standaard
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
