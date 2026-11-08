import { useEffect, useMemo, useState } from 'react';
import {
  Cpu,
  Loader2,
  Check,
  MessageSquareText,
  MessagesSquare,
  ShieldAlert,
  Ban,
  Plus,
  X,
  Sliders,
  Sparkles,
  Bot,
  Layers,
  Coins,
  ExternalLink,
  Globe,
  KeyRound,
  Landmark,
} from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AI_MODELS,
  API_PORTALS,
  PROVIDER_MODELS,
  defaultModelFor,
  modelLabel,
  pricingSummary,
  projectModelLabelFor,
} from '@/config/aiModels';
import type { AiProvider } from '@/config/aiModels';
import {
  getAiSettings,
  saveAiSettings,
  getChatSettings,
  saveChatSettings,
  DEFAULT_AI_SETTINGS,
  DEFAULT_CHAT_SETTINGS,
  DEFAULT_CHAT_OPTIMIZE_PROMPT,
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_PERSONAL_INSTRUCTION_PROMPT,
  DEFAULT_MEMORY_PROMPT,
  DEFAULT_EXECUTION_SYSTEM_PROMPT,
  DEFAULT_GENERATOR_WEB_SEARCH_INSTRUCTION,
  DEFAULT_KADER_INSTRUCTION,
  DEFAULT_KENNISBANK_INSTRUCTION,
  DEFAULT_PROJECT_OPTIMIZE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_WEB_SEARCH_INSTRUCTION,
  MAX_WEB_SEARCH_RESULTS,
  type AiSettings,
  type ChatSettings,
} from '@/services/settingsService';
import { logAdminAction } from '@/services/adminService';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [initial, setInitial] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [chat, setChat] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [chatInitial, setChatInitial] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getAiSettings(), getChatSettings()])
      .then(([s, c]) => {
        if (!active) return;
        setSettings(s);
        setInitial(s);
        setChat(c);
        setChatInitial(c);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const aiDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initial),
    [settings, initial],
  );
  const chatDirty = useMemo(
    () => JSON.stringify(chat) !== JSON.stringify(chatInitial),
    [chat, chatInitial],
  );
  const dirty = aiDirty || chatDirty;

  function patch(p: Partial<AiSettings>) {
    setSettings((s) => ({ ...s, ...p }));
  }

  function patchChat(p: Partial<ChatSettings>) {
    setChat((s) => ({ ...s, ...p }));
  }

  /** Kies een provider én zet meteen het standaardmodel van die provider klaar. */
  function selectProvider(provider: AiProvider) {
    patch({ provider, model: defaultModelFor(provider) });
  }

  function selectChatProvider(provider: AiProvider) {
    patchChat({ provider, model: defaultModelFor(provider) });
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
      if (aiDirty) {
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
      }
      if (chatDirty) {
        await saveChatSettings(chat);
        await logAdminAction({
          action: 'update_setting',
          entity_type: 'app_setting',
          entity_id: 'chat_settings',
          changes: {
            enabled: chat.enabled,
            provider: chat.provider,
            model: chat.model,
            temperature: chat.temperature,
            optimize_enabled: chat.optimizeEnabled,
            project_optimize_enabled: chat.projectOptimizeEnabled,
            web_search_enabled: chat.webSearchEnabled,
            web_search_results: chat.webSearchResults,
          },
        }).catch(() => {
          /* audit is best-effort */
        });
        setChatInitial(chat);
      }
      toast.success('AI-instellingen opgeslagen. Gelden voor alle gebruikers.');
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
          De gekozen API wordt gebruikt voor alle optimalisaties in de bouwer. Gebruikers kiezen
          zelf geen model. Dit blok geldt <strong>niet</strong> voor de chat: die heeft een eigen
          model, verderop in het blok{' '}
          <a href="#chat-model" className="underline hover:text-rijksblauw-700 dark:hover:text-rijksblauw-200">
            Chat
          </a>
          .
        </SectionHeader>
        <ProviderCards value={settings.provider} onSelect={selectProvider} />

        {/* Directe links naar de sleutelbeheer-pagina's. Staan buiten de kaarten:
            een <a> in een <button> nesten is geen geldige HTML, en zo blijft de
            hele kaart één klikvlak voor het kiezen van de provider. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
            <KeyRound size={14} className="text-slate-400" />
            API-sleutels beheren:
          </span>
          {API_PORTALS.map((portal) => (
            <a
              key={portal.id}
              href={portal.apiKeysUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium transition-colors',
                portal.id === settings.provider
                  ? 'bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-rijksblauw-700 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {portal.label}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          De sleutel zelf zet je niet hier, maar als secret op de server:{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.6875rem] dark:bg-slate-700">
            supabase secrets set DEEPSEEK_API_KEY=…
          </code>{' '}
          (idem <code className="font-mono text-[0.6875rem]">MISTRAL_API_KEY</code>). PromptPlein gebruikt
          alleen deze twee diensten; Claude en OpenAI staan uit.
        </p>

        {/* Modelkeuze binnen de gekozen provider. Verschijnt zodra een concrete
            provider (geen 'Automatisch') is geselecteerd. */}
        {settings.provider !== 'auto' && (
          <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Layers size={16} className="text-rijksblauw-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Model voor {AI_MODELS.find((m) => m.id === settings.provider)?.label}
              </h3>
              {(() => {
                const portal = AI_MODELS.find((m) => m.id === settings.provider)?.apiKeysUrl;
                return portal ? (
                  <a
                    href={portal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  >
                    Naar het API-portaal
                    <ExternalLink size={11} />
                  </a>
                ) : null;
              })()}
            </div>
            <p className="mb-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Kies welk specifiek API-model van deze provider voor alle optimalisaties wordt gebruikt.
              Prijzen zijn richtbedragen in USD per 1 miljoen tokens (in = je prompt, uit = het
              antwoord); duurdere modellen leveren doorgaans meer kwaliteit.
            </p>
            <ModelCards
              provider={settings.provider}
              value={settings.model}
              onSelect={(id) => patch({ model: id })}
            />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Gekozen model:{' '}
              <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                {modelLabel(settings.provider, settings.model) || 'standaardmodel'}
              </span>
              {(() => {
                const chosen = PROVIDER_MODELS[settings.provider].find(
                  (m) => m.id === settings.model,
                );
                return chosen ? <span> · {pricingSummary(chosen.pricing)}</span> : null;
              })()}
            </p>
            {chat.provider !== 'auto' && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                De chat draait op{' '}
                <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                  {AI_MODELS.find((m) => m.id === chat.provider)?.label}
                  {modelLabel(chat.provider, chat.model) ? ` · ${modelLabel(chat.provider, chat.model)}` : ''}
                </span>
                ; dat stel je in bij{' '}
                <a href="#chat-model" className="underline hover:text-rijksblauw-700 dark:hover:text-rijksblauw-200">
                  Chat
                </a>
                .
              </p>
            )}
          </div>
        )}
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
          className="opl-input min-h-[180px] resize-y font-mono text-[0.8125rem]"
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

        <div className="mt-5">
          <label className="opl-label" htmlFor="generatorWebSearchInstruction">
            Instructie bij internetbronnen (alleen beheerders)
          </label>
          <textarea
            id="generatorWebSearchInstruction"
            className="opl-input min-h-[180px] resize-y font-mono text-[0.8125rem]"
            value={settings.webSearchInstruction}
            onChange={(e) => patch({ webSearchInstruction: e.target.value })}
            placeholder="Bijv. Gebruik de bronnen om de feiten in de prompt actueel te maken…"
          />
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span>
              Beheerders zien in de promptbouwer naast &ldquo;Denken&rdquo; ook de knop
              &ldquo;Zoeken&rdquo;. Staat die aan, dan zoekt de AI eerst op internet met de
              prompt of het doel van de gebruiker en krijgt hij de gevonden pagina&rsquo;s met
              deze instructie erbij. Andere gebruikers zien de knop niet, en de server zoekt
              ook alleen voor een beheerder. Er gaan maximaal vijf bronnen mee.
              Laat leeg om de ingebouwde standaard te gebruiken.
            </span>
            {settings.webSearchInstruction.trim() !== DEFAULT_GENERATOR_WEB_SEARCH_INSTRUCTION && (
              <button
                type="button"
                className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={() =>
                  patch({ webSearchInstruction: DEFAULT_GENERATOR_WEB_SEARCH_INSTRUCTION })
                }
              >
                Herstel standaard
              </button>
            )}
          </p>
        </div>
      </section>

      {/* 2b. Overheidskaders en kennisbank */}
      <section className="opl-card p-6">
        <SectionHeader icon={Landmark} title="Overheidskaders en kennisbank">
          Laat de promptbouwer aansluiten op de kaders van de overheid. Per opdracht gaan alleen de
          kaders mee waar die opdracht onder valt.
          De kennisbank van developer.overheid.nl wordt alleen geraadpleegd bij een digitale
          opdracht, zoals een API, open source of de toegankelijkheid van een website. Daarbij gaat
          geen tekst van de gebruiker naar buiten.
        </SectionHeader>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-rijksblauw-500"
            checked={settings.kaders.enabled}
            onChange={(e) =>
              patch({ kaders: { ...settings.kaders, enabled: e.target.checked } })
            }
          />
          <span className="text-sm text-slate-700 dark:text-slate-200">
            Overheidskaders meegeven (persoonsgegevens, besluiten over burgers, publiekstekst, Woo,
            beveiliging)
          </span>
        </label>
        <div className={clsx('mt-3', !settings.kaders.enabled && 'pointer-events-none opacity-50')}>
          <textarea
            id="kaderInstruction"
            aria-label="Overheidskaders"
            className="opl-input min-h-[220px] resize-y font-mono text-[0.8125rem]"
            value={settings.kaders.instruction}
            onChange={(e) =>
              patch({ kaders: { ...settings.kaders, instruction: e.target.value } })
            }
          />
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span>
              Elk blok tussen tags hoort bij een soort opdracht en gaat alleen mee als de opdracht
              daaronder valt: &lt;persoonsgegevens&gt;, &lt;besluiten&gt; (over burgers of
              bedrijven), &lt;publiekstekst&gt;, &lt;openbaarheid&gt; (Woo) en
              &lt;beveiliging&gt;. Een blok met een eigen naam gaat altijd mee. Gebaseerd op de
              Nederlandse Richtlijn Digitale Systemen (NeRDS) en het overheidsbrede standpunt over
              generatieve AI. Laat leeg om de ingebouwde standaard te gebruiken.
            </span>
            {settings.kaders.instruction.trim() !== DEFAULT_KADER_INSTRUCTION && (
              <button
                type="button"
                className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={() =>
                  patch({ kaders: { ...settings.kaders, instruction: DEFAULT_KADER_INSTRUCTION } })
                }
              >
                Herstel standaard
              </button>
            )}
          </p>
        </div>

        <label className="mt-6 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-rijksblauw-500"
            checked={settings.kennisbank.enabled}
            onChange={(e) =>
              patch({ kennisbank: { ...settings.kennisbank, enabled: e.target.checked } })
            }
          />
          <span className="min-w-0 text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200">
            Kennisbank van developer.overheid.nl gebruiken bij digitale opdrachten
          </span>
        </label>
        <div
          className={clsx('mt-3', !settings.kennisbank.enabled && 'pointer-events-none opacity-50')}
        >
          <textarea
            id="kennisbankInstruction"
            aria-label="Instructie bij de kennisbank"
            className="opl-input min-h-[180px] resize-y font-mono text-[0.8125rem]"
            value={settings.kennisbank.instruction}
            onChange={(e) =>
              patch({ kennisbank: { ...settings.kennisbank, instruction: e.target.value } })
            }
          />
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span>
              De server kiest maximaal drie pagina&rsquo;s uit de index van de kennisbank en geeft ze
              met deze instructie mee. De gebruiker ziet ze als bronnen onder de prompt. Laat leeg
              om de ingebouwde standaard te gebruiken.
            </span>
            {settings.kennisbank.instruction.trim() !== DEFAULT_KENNISBANK_INSTRUCTION && (
              <button
                type="button"
                className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                onClick={() =>
                  patch({
                    kennisbank: {
                      ...settings.kennisbank,
                      instruction: DEFAULT_KENNISBANK_INSTRUCTION,
                    },
                  })
                }
              >
                Herstel standaard
              </button>
            )}
          </p>
        </div>
      </section>

      {/* 3. Chat */}
      <section className="opl-card p-6">
        <SectionHeader icon={MessagesSquare} title="Chat">
          De chatpagina waar gebruikers rechtstreeks met het model praten en documenten laten
          analyseren. Deze instellingen staan <strong>los</strong> van het optimalisatie-model
          hierboven: het model dat je hier kiest is wat de chat gebruikt en als badge toont.
        </SectionHeader>

        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-rijksblauw-500"
            checked={chat.enabled}
            onChange={(e) => patchChat({ enabled: e.target.checked })}
          />
          <span className="text-sm text-slate-700 dark:text-slate-200">
            Chat ingeschakeld (menu-item zichtbaar voor alle bezoekers)
          </span>
        </label>

        <div className={clsx('mt-5 space-y-6', !chat.enabled && 'pointer-events-none opacity-50')}>
          <div id="chat-model" className="scroll-mt-24">
            <div className="mb-3 flex items-center gap-2">
              <Cpu size={16} className="text-rijksblauw-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                AI-model voor de chat
              </h3>
            </div>
            <ProviderCards value={chat.provider} onSelect={selectChatProvider} />
            {chat.provider !== 'auto' && (
              <div className="mt-4">
                <ModelCards
                  provider={chat.provider}
                  value={chat.model}
                  onSelect={(id) => patchChat({ model: id })}
                />
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Het gekozen model is voor gebruikers zichtbaar als badge rechtsonder in de chat
              {chat.provider !== 'auto' && (
                <>
                  {' '}
                  (nu: <strong>{AI_MODELS.find((m) => m.id === chat.provider)?.label}
                  {modelLabel(chat.provider, chat.model) ? ` · ${modelLabel(chat.provider, chat.model)}` : ''}</strong>)
                </>
              )}
              .
            </p>
          </div>

          <div>
            <label className="opl-label" htmlFor="chatSystemPrompt">
              Systeemprompt: huisregels voor elk antwoord
            </label>
            <textarea
              id="chatSystemPrompt"
              className="opl-input min-h-[220px] resize-y font-mono text-[0.8125rem]"
              value={chat.systemPrompt}
              onChange={(e) => patchChat({ systemPrompt: e.target.value })}
              placeholder="Bijv. Je bent een behulpzame AI-assistent…"
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <span>
                Gaat mee bij <strong>elk</strong> bericht van <strong>iedere</strong> gebruiker en
                bepaalt taal, toon en opmaak van de antwoorden. Laat leeg om de ingebouwde standaard
                te gebruiken. Er komt alleen nog iets onder als de gebruiker zelf een eigen
                instructie heeft ingesteld of iets heeft laten onthouden (zie hieronder). Het
                antwoord wordt daarna niet meer bijgeschaafd.
              </span>
              {chat.systemPrompt.trim() !== DEFAULT_CHAT_SYSTEM_PROMPT && (
                <button
                  type="button"
                  className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  onClick={() => patchChat({ systemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT })}
                >
                  Herstel standaard
                </button>
              )}
            </p>
          </div>

          <div>
            <label className="opl-label" htmlFor="chatPersonalInstructionPrompt">
              Tekst rond de eigen instructie van een gebruiker
            </label>
            <textarea
              id="chatPersonalInstructionPrompt"
              className="opl-input min-h-[120px] resize-y font-mono text-[0.8125rem]"
              value={chat.personalInstructionPrompt}
              onChange={(e) => patchChat({ personalInstructionPrompt: e.target.value })}
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <span>
                Komt onder de systeemprompt als een ingelogde gebruiker bij Instellingen een eigen
                instructie heeft ingesteld. Op de plek van <code>{'{{instructie}}'}</code> komt die
                tekst. Geldt alleen voor gewone chats, niet in projecten en niet bij het uitvoeren
                van een prompt. Wat een gebruiker invult, kun je hier niet lezen.
              </span>
              {chat.personalInstructionPrompt.trim() !== DEFAULT_PERSONAL_INSTRUCTION_PROMPT && (
                <button
                  type="button"
                  className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  onClick={() =>
                    patchChat({ personalInstructionPrompt: DEFAULT_PERSONAL_INSTRUCTION_PROMPT })
                  }
                >
                  Herstel standaard
                </button>
              )}
            </p>
          </div>

          <div>
            <label className="opl-label" htmlFor="chatMemoryPrompt">
              Tekst rond het geheugen van een gebruiker
            </label>
            <textarea
              id="chatMemoryPrompt"
              className="opl-input min-h-[120px] resize-y font-mono text-[0.8125rem]"
              value={chat.memoryPrompt}
              onChange={(e) => patchChat({ memoryPrompt: e.target.value })}
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <span>
                Komt als laatste in de systeemprompt als een ingelogde gebruiker in de chat iets
                heeft laten onthouden met woorden als voortaan, onthoud dit of vanaf nu. Op de plek
                van <code>{'{{geheugen}}'}</code> komen die wensen, één per regel. Dit blok is
                leidend, ook boven de systeemprompt hierboven. Geldt in gewone chats en projecten,
                niet bij het uitvoeren van een prompt. Wat een gebruiker liet onthouden, kun je hier
                niet lezen.
              </span>
              {chat.memoryPrompt.trim() !== DEFAULT_MEMORY_PROMPT && (
                <button
                  type="button"
                  className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  onClick={() => patchChat({ memoryPrompt: DEFAULT_MEMORY_PROMPT })}
                >
                  Herstel standaard
                </button>
              )}
            </p>
          </div>

          <div>
            <label className="opl-label" htmlFor="chatExecutionPrompt">
              Systeemprompt bij het uitvoeren van een prompt
            </label>
            <textarea
              id="chatExecutionPrompt"
              className="opl-input min-h-[160px] resize-y font-mono text-[0.8125rem]"
              value={chat.executionSystemPrompt}
              onChange={(e) => patchChat({ executionSystemPrompt: e.target.value })}
              placeholder="Bijv. Voer de prompt-instructie van de gebruiker letterlijk uit…"
            />
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              <span>
                Geldt alleen wanneer een <strong>gegenereerde prompt wordt uitgevoerd</strong> (de
                prompt tester in de generator en de chat die uit &ldquo;Kopiëren in
                chat&rdquo; ontstaat). De huisregels
                hierboven gelden daar bewust niet: de prompt van de gebruiker bepaalt zelf taal,
                toon en opmaak. Laat leeg om de ingebouwde standaard te gebruiken.
              </span>
              {chat.executionSystemPrompt.trim() !== DEFAULT_EXECUTION_SYSTEM_PROMPT && (
                <button
                  type="button"
                  className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  onClick={() => patchChat({ executionSystemPrompt: DEFAULT_EXECUTION_SYSTEM_PROMPT })}
                >
                  Herstel standaard
                </button>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-rijksoranje" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Tekst verbeteren in het invoerveld
              </h3>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Typt een gebruiker iets in de chat, dan verschijnt rechtsboven in het invoerveld een
              oranje sterretje. Eén klik herschrijft de getypte tekst tot een scherpere vraag, die de
              gebruiker daarna zelf kan nalezen, aanpassen of terugdraaien. Dit is een{' '}
              <strong>lichte</strong> verbetering; de volledige generator blijft achter
              &ldquo;Genereren&rdquo;. Hetzelfde sterretje staat bij het contextveld van een techniek
              op &ldquo;Technieken&rdquo;, met deze instelling en deze instructie.
            </p>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-rijksblauw-500"
                checked={chat.optimizeEnabled}
                onChange={(e) => patchChat({ optimizeEnabled: e.target.checked })}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Sterretje tonen in het invoerveld van de chat en bij het contextveld van een
                techniek
              </span>
            </label>

            <div className={clsx('mt-4', !chat.optimizeEnabled && 'pointer-events-none opacity-50')}>
              <label className="opl-label" htmlFor="chatOptimizePrompt">
                Instructie voor de verbetering
              </label>
              <textarea
                id="chatOptimizePrompt"
                className="opl-input min-h-[200px] resize-y font-mono text-[0.8125rem]"
                value={chat.optimizeSystemPrompt}
                onChange={(e) => patchChat({ optimizeSystemPrompt: e.target.value })}
                placeholder="Bijv. Herschrijf de tekst van de gebruiker tot een duidelijkere vraag…"
              />
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <span>
                  Bepaalt hoe ver de verbetering gaat: wat wél mag worden toegevoegd (doel, gewenste
                  vorm, lengte) en wat niet (verzonnen feiten, een heel sjabloon). Het model krijgt
                  alleen de getypte tekst te zien, niet het gesprek of de bijlagen. Laat leeg om de
                  ingebouwde standaard te gebruiken.
                </span>
                {chat.optimizeSystemPrompt.trim() !== DEFAULT_CHAT_OPTIMIZE_PROMPT && (
                  <button
                    type="button"
                    className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                    onClick={() => patchChat({ optimizeSystemPrompt: DEFAULT_CHAT_OPTIMIZE_PROMPT })}
                  >
                    Herstel standaard
                  </button>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-rijksoranje" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Projectinstructie omschrijven tot systeemprompt
              </h3>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Hetzelfde oranje sterretje, maar dan in het veld
              &ldquo;Projectinstructie&rdquo; van de projectinstellingen. Eén klik schrijft de ruwe
              instructie om tot een volwaardige systeemprompt. Dit is een <strong>zwaardere</strong>{' '}
              slag dan het sterretje in de chat: de uitkomst stuurt <em>elk</em> gesprek in dat
              project, dus er wordt een vaste rol, een vast eindproduct en een uitweg bij twijfel in
              uitgewerkt. Het resultaat vervangt het veld maar wordt niet opgeslagen; de gebruiker
              leest het na en slaat zelf op, of haalt zijn eigen tekst terug.
            </p>

            <p className="mb-4 max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              Deze slag draait op het <strong>chatmodel</strong> hierboven
              {projectModelLabelFor(chat.provider, chat.model) ? (
                <>
                  {' '}
                  · nu <strong>{projectModelLabelFor(chat.provider, chat.model)}</strong>
                </>
              ) : (
                ' (bij Automatisch: het sterkste model van de provider die als eerste antwoordt)'
              )}
              . Is er geen geldig model gekozen, dan neemt hij het sterkste model van de provider.
              Wat eruit komt stuurt daarna elk gesprek in dat project, en een kleiner model
              verzint daar sneller regels bij die de gebruiker nooit heeft opgeschreven.
            </p>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-rijksblauw-500"
                checked={chat.projectOptimizeEnabled}
                onChange={(e) => patchChat({ projectOptimizeEnabled: e.target.checked })}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Sterretje tonen bij de projectinstructie
              </span>
            </label>

            <div
              className={clsx('mt-4', !chat.projectOptimizeEnabled && 'pointer-events-none opacity-50')}
            >
              <label className="opl-label" htmlFor="projectOptimizePrompt">
                Instructie voor het omschrijven
              </label>
              <textarea
                id="projectOptimizePrompt"
                className="opl-input min-h-[200px] resize-y font-mono text-[0.8125rem]"
                value={chat.projectOptimizeSystemPrompt}
                onChange={(e) => patchChat({ projectOptimizeSystemPrompt: e.target.value })}
                placeholder="Bijv. Herschrijf de ruwe projectinstructie tot een volwaardige systeemprompt…"
              />
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <span>
                  De standaardtekst stuurt op zes onderwerpen: wie de assistent is, wat er elk
                  gesprek uit moet komen (en wat niet), waaraan je ziet dat het goed is, de regels
                  mét hun reden, de termen die letterlijk moeten blijven, en wat er gebeurt als
                  informatie ontbreekt. De zwaarste regel erin is wat er <em>niet</em> bij mag
                  komen. Dat heeft twee redenen: een verzonnen regel werkt door in elk volgend
                  gesprek zonder dat de gebruiker ziet waar hij vandaan komt, én elke extra regel
                  verkleint de kans dat de echte regels nog worden opgevolgd. Het model krijgt de
                  ruwe instructie te zien plus de projectnaam en de namen van de bronbestanden,
                  niet de inhoud daarvan. Laat leeg om de ingebouwde standaard te gebruiken.
                </span>
                {chat.projectOptimizeSystemPrompt.trim() !== DEFAULT_PROJECT_OPTIMIZE_PROMPT && (
                  <button
                    type="button"
                    className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                    onClick={() =>
                      patchChat({ projectOptimizeSystemPrompt: DEFAULT_PROJECT_OPTIMIZE_PROMPT })
                    }
                  >
                    Herstel standaard
                  </button>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-3 flex items-center gap-2">
              <Globe size={16} className="text-rijksblauw-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Zoeken op internet
              </h3>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Zet dit aan, dan staat er in de invoerbalk van de chat een knop
              &ldquo;Zoeken&rdquo;. Heeft de gebruiker die aanstaan, dan gaat zijn vraag eerst naar
              een zoekmachine en krijgt het model de gevonden pagina&rsquo;s mee als bronnen. Onder
              het antwoord staan die bronnen als aanklikbare links, zodat de gebruiker kan nalezen
              of het klopt. De knop staat standaard uit en de gebruiker kiest per bericht; zoeken
              kost een paar seconden extra voordat het antwoord begint.
            </p>

            <p className="mb-4 max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              Hier aanzetten is niet genoeg: er moet ook een zoekdienst achter zitten. Die staat in
              de secrets van de edge function, niet in dit scherm, want een zoekadres dat de browser
              mag kiezen is een adres dat iedereen mag kiezen. Zet er één van deze twee klaar met{' '}
              <code className="rounded bg-slate-200 px-1 py-0.5 text-[0.75rem] dark:bg-slate-700">
                supabase secrets set
              </code>
              :{' '}
              <strong>TAVILY_API_KEY</strong> (1000 zoekopdrachten per maand gratis, geen
              creditcard) of <strong>SEARXNG_URL</strong> (een eigen SearXNG-server: open source en
              geen prijs per zoekopdracht, maar je host hem zelf). Staat er geen van beide, dan doet
              de knop niets en antwoordt het model gewoon uit eigen kennis.
            </p>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-rijksblauw-500"
                checked={chat.webSearchEnabled}
                onChange={(e) => patchChat({ webSearchEnabled: e.target.checked })}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Knop &ldquo;Zoeken&rdquo; tonen in het invoerveld van de chat
              </span>
            </label>

            <div className={clsx('mt-4', !chat.webSearchEnabled && 'pointer-events-none opacity-50')}>
              <div className="mb-1 flex items-center gap-2">
                <Sliders size={15} className="text-slate-400" />
                <label className="opl-label mb-0" htmlFor="webSearchResults">
                  Aantal bronnen per vraag
                </label>
                <span className="ml-auto text-sm font-medium tabular-nums text-rijksblauw-700 dark:text-rijksblauw-200">
                  {chat.webSearchResults}
                </span>
              </div>
              <input
                id="webSearchResults"
                type="range"
                min={1}
                max={MAX_WEB_SEARCH_RESULTS}
                step={1}
                value={chat.webSearchResults}
                onChange={(e) => patchChat({ webSearchResults: Number(e.target.value) })}
                className="w-full accent-rijksblauw-500"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Meer bronnen geven een completer beeld, maar maken de vraag aan het model langer en
                daarmee trager. Vijf is een goede middenweg.
              </p>

              <label className="opl-label mt-4" htmlFor="webSearchInstruction">
                Instructie bij de gevonden bronnen
              </label>
              <textarea
                id="webSearchInstruction"
                className="opl-input min-h-[200px] resize-y font-mono text-[0.8125rem]"
                value={chat.webSearchInstruction}
                onChange={(e) => patchChat({ webSearchInstruction: e.target.value })}
                placeholder="Bijv. Beantwoord de vraag met wat er in de bronnen staat en verwijs met [1]…"
              />
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <span>
                  Deze tekst komt onder de systeemprompt van de chat te staan, en alleen wanneer het
                  zoeken ook echt iets heeft opgeleverd; de gevonden pagina&rsquo;s staan er als
                  genummerde bronnen onder. De standaardtekst regelt drie dingen: de bronnen gaan
                  vóór wat het model zelf dacht te weten, wat er in geen enkele bron staat mag er
                  niet bij verzonnen worden, en achter elke bewering hoort een verwijzing als [1]
                  met onderaan de bijbehorende lijst. Laat leeg om de ingebouwde standaard te
                  gebruiken.
                </span>
                {chat.webSearchInstruction.trim() !== DEFAULT_WEB_SEARCH_INSTRUCTION && (
                  <button
                    type="button"
                    className="shrink-0 font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                    onClick={() =>
                      patchChat({ webSearchInstruction: DEFAULT_WEB_SEARCH_INSTRUCTION })
                    }
                  >
                    Herstel standaard
                  </button>
                )}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <Sliders size={15} className="text-slate-400" />
              <label className="opl-label mb-0" htmlFor="chatTemperature">
                Creativiteit
              </label>
              <span className="ml-auto text-sm font-medium tabular-nums text-rijksblauw-700 dark:text-rijksblauw-200">
                {chat.temperature.toFixed(2)}
              </span>
            </div>
            <input
              id="chatTemperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={chat.temperature}
              onChange={(e) => patchChat({ temperature: Number(e.target.value) })}
              className="w-full accent-rijksblauw-500"
            />
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>Voorspelbaar</span>
              <span>Creatief</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Guardrail: persoonsgegevens */}
      <section className="opl-card p-6">
        <SectionHeader icon={ShieldAlert} title="Guardrail: persoonsgegevens (AVG)">
          Detecteert mogelijke persoonsgegevens (e-mail, BSN, telefoonnummer, IBAN, naam met aanhef,
          geboortedatum) in de invoer van de bouwer en in chatberichten en bijlagen. Bij detectie
          gaat er niets naar de AI tot de gebruiker bevestigt.
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

      {/* 5. Verboden onderwerpen */}
      <section className="opl-card p-6">
        <SectionHeader icon={Ban} title="Verboden onderwerpen">
          Bevat de prompt een van deze termen, dan wordt de gebruiker gewaarschuwd en moet die bevestigen
          voordat het optimaliseren doorgaat.
        </SectionHeader>

        <div className="flex flex-wrap gap-2">
          <input
            className="opl-input min-w-0 flex-1 basis-48"
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
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm [overflow-wrap:anywhere] text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200"
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
      <div
        style={{ bottom: 'var(--onderbalk)' }}
        className="fixed inset-x-0 z-10 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6 lg:px-8">
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

/** Providerkeuze als klikbare kaarten; gedeeld door de generator- en chat-sectie. */
function ProviderCards({
  value,
  onSelect,
}: {
  value: AiProvider;
  onSelect: (provider: AiProvider) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {AI_MODELS.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
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
  );
}

/** Modelkeuze binnen een provider, met richtprijzen; gedeeld door beide secties. */
function ModelCards({
  provider,
  value,
  onSelect,
}: {
  provider: Exclude<AiProvider, 'auto'>;
  value: string;
  onSelect: (modelId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {PROVIDER_MODELS[provider].map((mdl) => {
        const active = mdl.id === value;
        return (
          <button
            key={mdl.id}
            type="button"
            onClick={() => onSelect(mdl.id)}
            aria-pressed={active}
            className={clsx(
              'flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-all',
              active
                ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
            )}
          >
            <span className="flex flex-col">
              <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                {mdl.label}
              </span>
              <span className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{mdl.hint}</span>
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Coins size={12} className="text-slate-400" />
                {pricingSummary(mdl.pricing)}
              </span>
              <span className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
                {mdl.id}
              </span>
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
  );
}
