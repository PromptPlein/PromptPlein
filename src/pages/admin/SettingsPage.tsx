import { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  Loader2,
  Check,
  MessageSquareText,
  ShieldAlert,
  Ban,
  Plus,
  X,
  Sliders,
  Bot,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AI_MODELS } from '@/config/aiModels';
import {
  getAiSettings,
  saveAiSettings,
  DEFAULT_AI_SETTINGS,
  DEFAULT_SYSTEM_PROMPT,
  type AiSettings,
} from '@/services/settingsService';
import { logAdminAction } from '@/services/adminService';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [initial, setInitial] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');

  useEffect(() => {
    let active = true;
    getAiSettings()
      .then((s) => {
        if (!active) return;
        setSettings(s);
        setInitial(s);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initial),
    [settings, initial],
  );

  function patch(p: Partial<AiSettings>) {
    setSettings((s) => ({ ...s, ...p }));
  }

  function addTopic() {
    const t = topicDraft.trim();
    if (!t) return;
    if (settings.blockedTopics.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTopicDraft('');
      return;
    }
    patch({ blockedTopics: [...settings.blockedTopics, t] });
    setTopicDraft('');
  }

  function removeTopic(topic: string) {
    patch({ blockedTopics: settings.blockedTopics.filter((t) => t !== topic) });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveAiSettings(settings);
      await logAdminAction({
        action: 'update_setting',
        entity_type: 'app_setting',
        entity_id: 'ai_settings',
        changes: {
          provider: settings.provider,
          temperature: settings.temperature,
          pii_enabled: settings.pii.enabled,
          blocked_topics: settings.blockedTopics.length,
        },
      }).catch(() => {
        /* audit is best-effort */
      });
      setInitial(settings);
      toast.success('AI-instellingen opgeslagen. Gelden voor alle optimalisaties.');
    } catch {
      toast.error('Opslaan mislukt. Probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-64 rounded-lg" />
        <div className="skeleton h-48 w-full rounded-xl" />
        <div className="skeleton h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          <Bot className="text-rijksblauw-500" /> AI-instellingen
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bepaal globaal hoe de AI reageert en welke grenzen er gelden. Deze instellingen gelden voor{' '}
          <strong>alle</strong> prompt-optimalisaties.
        </p>
      </div>

      {/* 1. AI-model */}
      <section className="opl-card p-6">
        <SectionHeader icon={Cpu} title="AI-model voor optimalisatie">
          De gekozen API wordt gebruikt voor alle optimalisaties. Gebruikers kiezen zelf geen model.
        </SectionHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AI_MODELS.map((m) => {
            const active = m.id === settings.provider;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => patch({ provider: m.id })}
                aria-pressed={active}
                className={clsx(
                  'flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                )}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">{m.label}</span>
                  <span className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{m.hint}</span>
                </span>
                {active && (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                    <Check size={14} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Hoofd-prompt + toon + creativiteit */}
      <section className="opl-card p-6">
        <SectionHeader icon={MessageSquareText} title="Hoe de AI reageert">
          Bepaal de hoofd-prompt (systeeminstructie), de schrijfstijl en hoe creatief het model mag zijn.
        </SectionHeader>

        <label className="opl-label" htmlFor="systemPrompt">
          Hoofd-prompt (systeeminstructie)
        </label>
        <textarea
          id="systemPrompt"
          className="opl-input min-h-[180px] resize-y font-mono text-[13px]"
          value={settings.systemPrompt}
          onChange={(e) => patch({ systemPrompt: e.target.value })}
          placeholder="Bijv. Je bent een expert in prompt-engineering…"
        />
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span>Pas de standaardinstructie aan naar wens. Laat leeg om de ingebouwde default te gebruiken.</span>
          {settings.systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT && (
            <button
              type="button"
              className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={() => patch({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            >
              Herstel standaard
            </button>
          )}
        </p>

        <div className="mt-5">
          <label className="opl-label" htmlFor="tone">
            Toon / schrijfstijl
          </label>
          <input
            id="tone"
            className="opl-input"
            value={settings.toneInstruction}
            onChange={(e) => patch({ toneInstruction: e.target.value })}
            placeholder="Bijv. duidelijke, professionele taal op B1-taalniveau"
          />
        </div>

        <div className="mt-5">
          <div className="mb-1 flex items-center gap-2">
            <Sliders size={15} className="text-slate-400" />
            <label className="opl-label mb-0" htmlFor="temperature">
              Creativiteit
            </label>
            <span className="ml-auto text-sm font-medium tabular-nums text-rijksblauw-700 dark:text-rijksblauw-200">
              {settings.temperature.toFixed(2)}
            </span>
          </div>
          <input
            id="temperature"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.temperature}
            onChange={(e) => patch({ temperature: Number(e.target.value) })}
            className="w-full accent-rijksblauw-500"
          />
          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>Voorspelbaar</span>
            <span>Creatief</span>
          </div>
        </div>
      </section>

      {/* 3. Guardrail: persoonsgegevens */}
      <section className="opl-card p-6">
        <SectionHeader icon={ShieldAlert} title="Guardrail: persoonsgegevens (AVG)">
          Detecteert mogelijke persoonsgegevens (e-mail, BSN, telefoonnummer, IBAN) in de invoer. Bij
          detectie wordt optimaliseren geblokkeerd tot de gebruiker bevestigt.
        </SectionHeader>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-rijksblauw-500"
            checked={settings.pii.enabled}
            onChange={(e) => patch({ pii: { ...settings.pii, enabled: e.target.checked } })}
          />
          <span className="text-sm text-slate-700 dark:text-slate-200">
            Waarschuw en blokkeer bij mogelijke persoonsgegevens
          </span>
        </label>

        <div className={clsx('mt-4', !settings.pii.enabled && 'pointer-events-none opacity-50')}>
          <label className="opl-label" htmlFor="piiWarning">
            Waarschuwingstekst voor de gebruiker
          </label>
          <textarea
            id="piiWarning"
            className="opl-input min-h-[80px] resize-y"
            value={settings.pii.warning}
            onChange={(e) => patch({ pii: { ...settings.pii, warning: e.target.value } })}
          />
        </div>
      </section>

      {/* 4. Verboden onderwerpen */}
      <section className="opl-card p-6">
        <SectionHeader icon={Ban} title="Verboden onderwerpen">
          Bevat de prompt een van deze termen, dan wordt de gebruiker gewaarschuwd en moet die bevestigen
          voordat het optimaliseren doorgaat.
        </SectionHeader>

        <div className="flex gap-2">
          <input
            className="opl-input"
            value={topicDraft}
            onChange={(e) => setTopicDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTopic();
              }
            }}
            placeholder="Bijv. politieke voorkeur, medisch dossier…"
          />
          <button type="button" className="opl-btn-secondary shrink-0 px-4" onClick={addTopic}>
            <Plus size={16} /> Toevoegen
          </button>
        </div>

        {settings.blockedTopics.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {settings.blockedTopics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200"
              >
                {topic}
                <button
                  type="button"
                  onClick={() => removeTopic(topic)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-rijksrood/10 hover:text-rijksrood"
                  aria-label={`Verwijder ${topic}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
            Nog geen verboden onderwerpen ingesteld.
          </p>
        )}
      </section>

      {/* Sticky opslaan-balk */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {dirty && (
            <span className="text-sm text-slate-500 dark:text-slate-400">Niet-opgeslagen wijzigingen</span>
          )}
          <button className="opl-btn-primary px-6 py-2.5" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Opslaan…
              </>
            ) : (
              <>
                <Check size={18} /> Opslaan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon size={18} className="text-rijksblauw-500" />
        <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">{children}</p>
    </div>
  );
}
