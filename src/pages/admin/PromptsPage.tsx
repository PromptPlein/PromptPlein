import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import AdminSheet from '@/components/admin/AdminSheet';
import {
  getPromptCatalog,
  getPromptOverrides,
  savePromptOverrides,
  type ServerPrompt,
} from '@/services/promptAdminService';
import { logAdminAction } from '@/services/adminService';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/badge';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/search-field';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/** The text of one prompt, bound to the drafts of the page. */
function PromptEditor({ value, label, onValue }: { value: string; label: string; onValue: (v: string) => void }) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-form-field label={label}>
      <nldd-multi-line-text-field ref={ref} rows={16} resize="vertical" no-spellcheck></nldd-multi-line-text-field>
      <nldd-form-field-help-text>
        Tekst tussen dubbele accolades, zoals <code>{'{{sleutels}}'}</code> of{' '}
        <code>{'{{bronnenpunt}}'}</code>, vult de server in. Laat die staan. Prompts worden geschreven
        voor een klein model: houd ze concreet, met een exact uitvoersjabloon, en zet er geen twee
        regels in die elkaar tegenspreken.
      </nldd-form-field-help-text>
    </nldd-form-field>
  );
}

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
  const searchRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(searchRef, query, setQuery);

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
      notify.success('Prompts opgeslagen. Binnen een halve minuut gebruikt de AI de nieuwe tekst.');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const aantalAangepast = Object.keys(nextOverrides).length;
  // The sheet stays mounted; while it closes it keeps showing the last prompt.
  const lastOpen = useRef<ServerPrompt | null>(null);
  const openPrompt = catalog?.find((p) => p.id === open) ?? null;
  if (openPrompt) lastOpen.current = openPrompt;
  const shown = openPrompt ?? lastOpen.current;

  const intro = (
    <nldd-title
      heading-level={1}
      size={2}
      text="Prompts"
      supporting-text="Alle systeemprompts van de AI-laag, gegroepeerd naar waar ze gebruikt worden."
    >
      {catalog && !loadError && (
        <nldd-button
          slot="end"
          appearance="primary"
          start-icon="save"
          text="Opslaan"
          loading={saving || undefined}
          loading-text="Aan het opslaan"
          disabled={!dirty || undefined}
          onClick={() => void handleSave()}
        ></nldd-button>
      )}
    </nldd-title>
  );

  if (loadError) {
    return (
      <nldd-container layout="stack" gap="24">
        {intro}
        <nldd-banner variant="critical" text="De prompts konden niet worden geladen" supporting-text={loadError}></nldd-banner>
      </nldd-container>
    );
  }
  if (!catalog) {
    return (
      <nldd-container layout="stack" gap="24">
        {intro}
        <nldd-container min-height="8rem">
          <nldd-activity-indicator text="Prompts laden" show-text></nldd-activity-indicator>
        </nldd-container>
      </nldd-container>
    );
  }

  return (
    <nldd-container layout="stack" gap="24">
      {intro}
      <nldd-text>
        Pas een tekst aan en sla op; binnen een halve minuut gebruikt de AI de nieuwe versie, voor
        iedereen. De hoofdprompt, de toon, de chat, de projectinstructie en de overheidskaders staan
        bij <nldd-link href="/admin/instellingen" text="AI-instellingen"></nldd-link>.
      </nldd-text>

      <nldd-container layout="stack" gap="8">
        <nldd-search-field
          ref={searchRef}
          width="24rem"
          placeholder="Zoek op naam of tekst"
          accessible-label="Zoek op naam of tekst"
        ></nldd-search-field>
        <nldd-text size="sm" color="secondary" aria-live="polite">
          {catalog.length} prompts, {aantalAangepast} aangepast
        </nldd-text>
      </nldd-container>

      {groups.length === 0 && (
        <nldd-inline-dialog icon="magnifier" text="Geen prompts gevonden" supporting-text="Probeer een ander zoekwoord."></nldd-inline-dialog>
      )}

      {groups.map(([groep, prompts]) => (
        <nldd-container key={groep} layout="stack" gap="12">
          <nldd-title heading-level={2} size={5} text={groep}></nldd-title>
          <nldd-list appearance="box-tinted" accessible-label={groep}>
            {prompts.map((p) => {
              const aangepast = drafts[p.id] !== p.standaard;
              return (
                <nldd-list-item key={p.id} button onClick={() => setOpen(p.id)}>
                  <nldd-text-cell hide-below={aangepast ? 'md' : undefined} text={p.titel} supporting-text={p.uitleg}></nldd-text-cell>
                  {/* Narrow, the status column is gone: a changed prompt says so after its name. */}
                  {aangepast && (
                    <nldd-text-cell hide-above="sm" supporting-text={p.uitleg}>
                      {p.titel} <nldd-badge size="sm" color="warning" text="Aangepast"></nldd-badge>
                    </nldd-text-cell>
                  )}
                  {aangepast && (
                    <>
                      <nldd-spacer-cell size="16" hide-below="md"></nldd-spacer-cell>
                      <nldd-cell hide-below="md">
                        <nldd-badge color="warning" decorative></nldd-badge>
                      </nldd-cell>
                      <nldd-spacer-cell size="8" hide-below="md"></nldd-spacer-cell>
                      <nldd-text-cell hide-below="md" width="fit-content" size="sm" text="Aangepast"></nldd-text-cell>
                    </>
                  )}
                  <nldd-spacer-cell size="12"></nldd-spacer-cell>
                  <nldd-icon-cell size="20" color="secondary" icon="chevron-right"></nldd-icon-cell>
                </nldd-list-item>
              );
            })}
          </nldd-list>
        </nldd-container>
      ))}

      <AdminSheet open={!!openPrompt} onClose={() => setOpen(null)} title={shown?.titel ?? 'Prompt'} width="720px">
        {shown && (
          <nldd-container layout="stack" gap="16">
            <nldd-text color="secondary">{shown.uitleg}</nldd-text>
            <PromptEditor
              label="Tekst van de prompt"
              value={drafts[shown.id] ?? ''}
              onValue={(v) => setDrafts((d) => ({ ...d, [shown.id]: v }))}
            />
            <nldd-container layout="wrap" gap="12" vertical-alignment="center">
              <nldd-text size="sm" color="secondary">
                <code>{shown.id}</code>
              </nldd-text>
              {drafts[shown.id] !== shown.standaard && (
                <nldd-button
                  appearance="secondary"
                  size="sm"
                  start-icon="arrow-2-counter-clockwise"
                  text="Herstel standaard"
                  onClick={() => setDrafts((d) => ({ ...d, [shown.id]: shown.standaard }))}
                ></nldd-button>
              )}
            </nldd-container>
            <nldd-text size="sm" color="secondary">
              De wijziging geldt pas na Opslaan op de pagina.
            </nldd-text>
          </nldd-container>
        )}
      </AdminSheet>
    </nldd-container>
  );
}
