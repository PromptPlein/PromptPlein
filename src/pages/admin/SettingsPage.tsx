import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import MenuAction from '@/components/common/MenuAction';
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
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/divider';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/link';
import '@nldd/design-system/link-group';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/menu';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/slider';
import '@nldd/design-system/switch-field';
import '@nldd/design-system/tab-bar';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';
import '@nldd/design-system/token';
import '@nldd/design-system/toolbar';

const TABS = [
  { id: 'bouwer', label: 'Bouwer' },
  { id: 'kaders', label: 'Overheidskaders' },
  { id: 'chat', label: 'Chat' },
  { id: 'chatfuncties', label: 'Chatfuncties' },
  { id: 'grenzen', label: 'Grenzen' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [initial, setInitial] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [chat, setChat] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [chatInitial, setChatInitial] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');
  const [tab, setTab] = useState<TabId>('bouwer');
  const [scrollToChatModel, setScrollToChatModel] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ item?: HTMLElement }>>(tabsRef, 'tabchange', (e) => {
    const next = TABS.find((t) => t.id === e.detail?.item?.dataset.tab);
    if (next) setTab(next.id);
  });

  // The chat model block only exists once the Chat tab renders, so scroll after that render.
  useEffect(() => {
    if (!scrollToChatModel || tab !== 'chat') return;
    document.getElementById('chat-model')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToChatModel(false);
  }, [scrollToChatModel, tab]);

  function goToChatModel() {
    setTab('chat');
    setScrollToChatModel(true);
  }

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
      notify.success('AI-instellingen opgeslagen. Gelden voor alle gebruikers.');
    } catch {
      notify.error('Opslaan mislukt. Probeer het opnieuw.');
    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <nldd-container layout="stack" gap="24">
        <nldd-title heading-level={1} size={3} text="AI-instellingen"></nldd-title>
        <nldd-inline-dialog variant="loading" text="Instellingen laden"></nldd-inline-dialog>
      </nldd-container>
    );
  }

  const optimizeProviderLabel = AI_MODELS.find((m) => m.id === settings.provider)?.label;
  const optimizePortal = AI_MODELS.find((m) => m.id === settings.provider)?.apiKeysUrl;
  const chosenOptimizeModel =
    settings.provider !== 'auto'
      ? PROVIDER_MODELS[settings.provider].find((m) => m.id === settings.model)
      : undefined;
  const chatModelText = `${AI_MODELS.find((m) => m.id === chat.provider)?.label ?? ''}${
    modelLabel(chat.provider, chat.model) ? ` · ${modelLabel(chat.provider, chat.model)}` : ''
  }`;

  function requestSave() {
    if (!dirty) {
      notify('Er zijn geen wijzigingen om op te slaan.');
      return;
    }
    void handleSave();
  }

  const saveButton = (
    <nldd-button
      appearance="primary"
      start-icon="save"
      text="Opslaan"
      supporting-text={dirty ? 'Niet-opgeslagen wijzigingen' : undefined}
      loading={saving || undefined}
      loading-text="Aan het opslaan"
      onClick={requestSave}
    ></nldd-button>
  );

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title heading-level={1} size={3} text="AI-instellingen">
        <nldd-text slot="supporting-text" color="secondary">
          Bepaal globaal hoe de AI reageert en welke grenzen er gelden. Deze instellingen gelden voor{' '}
          <strong>alle</strong> gebruikers.
        </nldd-text>
      </nldd-title>

      <nldd-toolbar accessible-label="Onderdelen en opslaan">
        <nldd-toolbar-item slot="start" priority="3">
          <nldd-tab-bar ref={tabsRef} accessible-label="Onderdelen van de AI-instellingen">
            {TABS.map((t) => (
              <nldd-tab-bar-item
                key={t.id}
                data-tab={t.id}
                text={t.label}
                current={tab === t.id || undefined}
              ></nldd-tab-bar-item>
            ))}
          </nldd-tab-bar>
          <nldd-menu-group slot="overflow" text="Onderdeel">
            {TABS.map((t) => (
              <MenuAction
                key={t.id}
                type="radio"
                text={t.label}
                selected={tab === t.id || undefined}
                onSelect={() => setTab(t.id)}
              />
            ))}
          </nldd-menu-group>
        </nldd-toolbar-item>
        <nldd-toolbar-item slot="end" priority="2">
          {saveButton}
          <MenuAction slot="overflow" text="Opslaan" icon="save" onSelect={requestSave} />
        </nldd-toolbar-item>
      </nldd-toolbar>

      {tab === 'bouwer' && (
        <Panel>
          {/* AI model for the builder */}
          <Block title="AI-model voor optimalisatie">
            <>
              De gekozen API wordt gebruikt voor alle optimalisaties in de bouwer. Gebruikers kiezen
              zelf geen model. Dit geldt <strong>niet</strong> voor de chat: die heeft een eigen model,
              op het tabblad <ChatModelLink onGo={goToChatModel} />.
            </>
            <ProviderChoice label="Provider voor optimalisatie" value={settings.provider} onSelect={selectProvider} />

            {/* Model choice within the chosen provider, shown once a concrete provider is selected. */}
            {settings.provider !== 'auto' && (
              <nldd-container layout="stack" gap="12">
                <nldd-title heading-level={3} size={6} text={`Model voor ${optimizeProviderLabel ?? ''}`}>
                  <nldd-text slot="supporting-text" size="sm" color="secondary">
                    Kies welk specifiek API-model van deze provider voor alle optimalisaties wordt
                    gebruikt. Prijzen zijn richtbedragen in USD per 1 miljoen tokens (in = je prompt, uit
                    = het antwoord); duurdere modellen leveren doorgaans meer kwaliteit.
                  </nldd-text>
                  {optimizePortal && (
                    <nldd-link
                      slot="end"
                      size="sm"
                      href={optimizePortal}
                      target="_blank"
                      text="Naar het API-portaal"
                      end-icon="external-link"
                    ></nldd-link>
                  )}
                </nldd-title>
                <ModelChoice
                  label="Model voor optimalisatie"
                  provider={settings.provider}
                  value={settings.model}
                  onSelect={(id) => patch({ model: id })}
                />
                <nldd-text size="sm" color="secondary">
                  Gekozen model:{' '}
                  <strong>{modelLabel(settings.provider, settings.model) || 'standaardmodel'}</strong>
                  {chosenOptimizeModel ? ` · ${pricingSummary(chosenOptimizeModel.pricing)}` : ''}
                </nldd-text>
                {chat.provider !== 'auto' && (
                  <nldd-text size="sm" color="secondary">
                    De chat draait op <strong>{chatModelText}</strong>; dat stel je in bij{' '}
                    <ChatModelLink onGo={goToChatModel} />.
                  </nldd-text>
                )}
              </nldd-container>
            )}

            <nldd-container layout="stack" gap="8">
              <nldd-title heading-level={3} size={6} text="API-sleutels beheren"></nldd-title>
              <nldd-link-group size="sm" accessible-label="API-sleutels beheren">
                {API_PORTALS.map((portal) => (
                  <nldd-link
                    key={portal.id}
                    href={portal.apiKeysUrl}
                    target="_blank"
                    text={portal.id === settings.provider ? `${portal.label} (gekozen)` : portal.label}
                    end-icon="external-link"
                  ></nldd-link>
                ))}
              </nldd-link-group>
              <nldd-text size="sm" color="secondary">
                De sleutel zelf zet je niet hier, maar als secret op de server:{' '}
                <code>supabase secrets set DEEPSEEK_API_KEY=…</code> (idem <code>MISTRAL_API_KEY</code>).
                PromptPlein gebruikt alleen deze twee diensten; Claude en OpenAI staan uit.
              </nldd-text>
            </nldd-container>
          </Block>

          {/* Main prompt, tone and creativity */}
          <Block title="Hoe de AI reageert">
            <>Bepaal de hoofd-prompt (systeeminstructie), de schrijfstijl en hoe creatief het model mag zijn.</>
            <PromptField
              label="Hoofd-prompt (systeeminstructie)"
              value={settings.systemPrompt}
              onValue={(v) => patch({ systemPrompt: v })}
              placeholder="Bijv. Je bent een expert in prompt-engineering…"
              rows={8}
              isDefault={settings.systemPrompt.trim() === DEFAULT_SYSTEM_PROMPT}
              onReset={() => patch({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}
            >
              Pas de standaardinstructie aan naar wens. Laat leeg om de ingebouwde default te gebruiken.
            </PromptField>

            <TextInput
              label="Toon / schrijfstijl"
              value={settings.toneInstruction}
              onValue={(v) => patch({ toneInstruction: v })}
              placeholder="Bijv. duidelijke, professionele taal op B1-taalniveau"
            />

            <CreativitySlider value={settings.temperature} onValue={(v) => patch({ temperature: v })} />

            <PromptField
              label="Instructie bij internetbronnen (alleen beheerders)"
              value={settings.webSearchInstruction}
              onValue={(v) => patch({ webSearchInstruction: v })}
              placeholder="Bijv. Gebruik de bronnen om de feiten in de prompt actueel te maken…"
              rows={8}
              isDefault={settings.webSearchInstruction.trim() === DEFAULT_GENERATOR_WEB_SEARCH_INSTRUCTION}
              onReset={() => patch({ webSearchInstruction: DEFAULT_GENERATOR_WEB_SEARCH_INSTRUCTION })}
            >
              Beheerders zien in de promptbouwer naast &ldquo;Denken&rdquo; ook de knop &ldquo;Zoeken&rdquo;.
              Staat die aan, dan zoekt de AI eerst op internet met de prompt of het doel van de gebruiker en
              krijgt hij de gevonden pagina&rsquo;s met deze instructie erbij. Andere gebruikers zien de knop
              niet, en de server zoekt ook alleen voor een beheerder. Er gaan maximaal vijf bronnen mee. Laat
              leeg om de ingebouwde standaard te gebruiken.
            </PromptField>
          </Block>
        </Panel>
      )}

      {tab === 'kaders' && (
        <Panel>
          {/* Government frameworks and knowledge base */}
          <Block title="Overheidskaders en kennisbank">
            <>
              Laat de promptbouwer aansluiten op de kaders van de overheid. Per opdracht gaan alleen de
              kaders mee waar die opdracht onder valt. De kennisbank van developer.overheid.nl wordt alleen
              geraadpleegd bij een digitale opdracht, zoals een API, open source of de toegankelijkheid van
              een website. Daarbij gaat geen tekst van de gebruiker naar buiten.
            </>
            <nldd-container layout="stack" gap="16">
              <Toggle
                label="Overheidskaders meegeven (persoonsgegevens, besluiten over burgers, publiekstekst, Woo, beveiliging)"
                checked={settings.kaders.enabled}
                onChecked={(c) => patch({ kaders: { ...settings.kaders, enabled: c } })}
              />
              <PromptField
                label="Overheidskaders"
                value={settings.kaders.instruction}
                onValue={(v) => patch({ kaders: { ...settings.kaders, instruction: v } })}
                rows={9}
                disabled={!settings.kaders.enabled}
                isDefault={settings.kaders.instruction.trim() === DEFAULT_KADER_INSTRUCTION}
                onReset={() => patch({ kaders: { ...settings.kaders, instruction: DEFAULT_KADER_INSTRUCTION } })}
              >
                Elk blok tussen tags hoort bij een soort opdracht en gaat alleen mee als de opdracht daaronder
                valt: &lt;persoonsgegevens&gt;, &lt;besluiten&gt; (over burgers of bedrijven),
                &lt;publiekstekst&gt;, &lt;openbaarheid&gt; (Woo) en &lt;beveiliging&gt;. Een blok met een
                eigen naam gaat altijd mee. Gebaseerd op de Nederlandse Richtlijn Digitale Systemen (NeRDS) en
                het overheidsbrede standpunt over generatieve AI. Laat leeg om de ingebouwde standaard te
                gebruiken.
              </PromptField>
            </nldd-container>

            <nldd-container layout="stack" gap="16">
              <Toggle
                label="Kennisbank van developer.overheid.nl gebruiken bij digitale opdrachten"
                checked={settings.kennisbank.enabled}
                onChecked={(c) => patch({ kennisbank: { ...settings.kennisbank, enabled: c } })}
              />
              <PromptField
                label="Instructie bij de kennisbank"
                value={settings.kennisbank.instruction}
                onValue={(v) => patch({ kennisbank: { ...settings.kennisbank, instruction: v } })}
                rows={8}
                disabled={!settings.kennisbank.enabled}
                isDefault={settings.kennisbank.instruction.trim() === DEFAULT_KENNISBANK_INSTRUCTION}
                onReset={() =>
                  patch({ kennisbank: { ...settings.kennisbank, instruction: DEFAULT_KENNISBANK_INSTRUCTION } })
                }
              >
                De server kiest maximaal drie pagina&rsquo;s uit de index van de kennisbank en geeft ze met
                deze instructie mee. De gebruiker ziet ze als bronnen onder de prompt. Laat leeg om de
                ingebouwde standaard te gebruiken.
              </PromptField>
            </nldd-container>
          </Block>
        </Panel>
      )}

      {tab === 'chat' && (
        <Panel>
          <Block title="Chat">
            <>
              De chatpagina waar gebruikers rechtstreeks met het model praten en documenten laten
              analyseren. Deze instellingen staan <strong>los</strong> van het optimalisatie-model van de
              bouwer: het model dat je hier kiest is wat de chat gebruikt en als badge toont.
            </>
            <Toggle
              label="Chat ingeschakeld (menu-item zichtbaar voor alle bezoekers)"
              checked={chat.enabled}
              onChecked={(c) => patchChat({ enabled: c })}
            />

            <nldd-container id="chat-model" layout="stack" gap="12">
              <nldd-title heading-level={3} size={6} text="AI-model voor de chat">
                <nldd-text slot="supporting-text" size="sm" color="secondary">
                  Het gekozen model is voor gebruikers zichtbaar als badge rechtsonder in de chat
                  {chat.provider !== 'auto' && (
                    <>
                      {' '}
                      (nu: <strong>{chatModelText}</strong>)
                    </>
                  )}
                  .
                </nldd-text>
              </nldd-title>
              <ProviderChoice
                label="Provider voor de chat"
                value={chat.provider}
                onSelect={selectChatProvider}
                disabled={!chat.enabled}
              />
              {chat.provider !== 'auto' && (
                <ModelChoice
                  label="Model voor de chat"
                  provider={chat.provider}
                  value={chat.model}
                  onSelect={(id) => patchChat({ model: id })}
                  disabled={!chat.enabled}
                />
              )}
            </nldd-container>

            <CreativitySlider
              value={chat.temperature}
              onValue={(v) => patchChat({ temperature: v })}
              disabled={!chat.enabled}
            />
          </Block>

          <Block title="Systeemprompts van de chat">
            <>
              Wat het model bij elk bericht meekrijgt, in de volgorde waarin het in de systeemprompt komt.
            </>
            <PromptField
              label="Systeemprompt: huisregels voor elk antwoord"
              value={chat.systemPrompt}
              onValue={(v) => patchChat({ systemPrompt: v })}
              placeholder="Bijv. Je bent een behulpzame AI-assistent…"
              rows={9}
              disabled={!chat.enabled}
              isDefault={chat.systemPrompt.trim() === DEFAULT_CHAT_SYSTEM_PROMPT}
              onReset={() => patchChat({ systemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT })}
            >
              Gaat mee bij <strong>elk</strong> bericht van <strong>iedere</strong> gebruiker en bepaalt
              taal, toon en opmaak van de antwoorden. Laat leeg om de ingebouwde standaard te gebruiken. Er
              komt alleen nog iets onder als de gebruiker zelf een eigen instructie heeft ingesteld of iets
              heeft laten onthouden (zie hieronder). Het antwoord wordt daarna niet meer bijgeschaafd.
            </PromptField>

            <PromptField
              label="Tekst rond de eigen instructie van een gebruiker"
              value={chat.personalInstructionPrompt}
              onValue={(v) => patchChat({ personalInstructionPrompt: v })}
              rows={5}
              disabled={!chat.enabled}
              isDefault={chat.personalInstructionPrompt.trim() === DEFAULT_PERSONAL_INSTRUCTION_PROMPT}
              onReset={() => patchChat({ personalInstructionPrompt: DEFAULT_PERSONAL_INSTRUCTION_PROMPT })}
            >
              Komt onder de systeemprompt als een ingelogde gebruiker bij Instellingen een eigen instructie
              heeft ingesteld. Op de plek van <code>{'{{instructie}}'}</code> komt die tekst. Geldt alleen
              voor gewone chats, niet in projecten en niet bij het uitvoeren van een prompt. Wat een
              gebruiker invult, kun je hier niet lezen.
            </PromptField>

            <PromptField
              label="Tekst rond het geheugen van een gebruiker"
              value={chat.memoryPrompt}
              onValue={(v) => patchChat({ memoryPrompt: v })}
              rows={5}
              disabled={!chat.enabled}
              isDefault={chat.memoryPrompt.trim() === DEFAULT_MEMORY_PROMPT}
              onReset={() => patchChat({ memoryPrompt: DEFAULT_MEMORY_PROMPT })}
            >
              Komt als laatste in de systeemprompt als een ingelogde gebruiker in de chat iets heeft laten
              onthouden met woorden als voortaan, onthoud dit of vanaf nu. Op de plek van{' '}
              <code>{'{{geheugen}}'}</code> komen die wensen, één per regel. Dit blok is leidend, ook boven
              de systeemprompt hierboven. Geldt in gewone chats en projecten, niet bij het uitvoeren van een
              prompt. Wat een gebruiker liet onthouden, kun je hier niet lezen.
            </PromptField>

            <PromptField
              label="Systeemprompt bij het uitvoeren van een prompt"
              value={chat.executionSystemPrompt}
              onValue={(v) => patchChat({ executionSystemPrompt: v })}
              placeholder="Bijv. Voer de prompt-instructie van de gebruiker letterlijk uit…"
              rows={7}
              disabled={!chat.enabled}
              isDefault={chat.executionSystemPrompt.trim() === DEFAULT_EXECUTION_SYSTEM_PROMPT}
              onReset={() => patchChat({ executionSystemPrompt: DEFAULT_EXECUTION_SYSTEM_PROMPT })}
            >
              Geldt alleen wanneer een <strong>gegenereerde prompt wordt uitgevoerd</strong> (de prompt
              tester in de generator en de chat die uit &ldquo;Kopiëren in chat&rdquo; ontstaat). De
              huisregels hierboven gelden daar bewust niet: de prompt van de gebruiker bepaalt zelf taal,
              toon en opmaak. Laat leeg om de ingebouwde standaard te gebruiken.
            </PromptField>
          </Block>
        </Panel>
      )}

      {tab === 'chatfuncties' && (
        <Panel>
          <Block title="Tekst verbeteren in het invoerveld">
            <>
              Typt een gebruiker iets in de chat, dan verschijnt rechtsboven in het invoerveld een oranje
              sterretje. Eén klik herschrijft de getypte tekst tot een scherpere vraag, die de gebruiker
              daarna zelf kan nalezen, aanpassen of terugdraaien. Dit is een <strong>lichte</strong>{' '}
              verbetering; de volledige generator blijft achter &ldquo;Genereren&rdquo;. Hetzelfde
              sterretje staat bij het contextveld van een techniek op &ldquo;Technieken&rdquo;, met deze
              instelling en deze instructie.
            </>
            <Toggle
              label="Sterretje tonen in het invoerveld van de chat en bij het contextveld van een techniek"
              checked={chat.optimizeEnabled}
              onChecked={(c) => patchChat({ optimizeEnabled: c })}
              disabled={!chat.enabled}
            />
            <PromptField
              label="Instructie voor de verbetering"
              value={chat.optimizeSystemPrompt}
              onValue={(v) => patchChat({ optimizeSystemPrompt: v })}
              placeholder="Bijv. Herschrijf de tekst van de gebruiker tot een duidelijkere vraag…"
              rows={8}
              disabled={!chat.enabled || !chat.optimizeEnabled}
              isDefault={chat.optimizeSystemPrompt.trim() === DEFAULT_CHAT_OPTIMIZE_PROMPT}
              onReset={() => patchChat({ optimizeSystemPrompt: DEFAULT_CHAT_OPTIMIZE_PROMPT })}
            >
              Bepaalt hoe ver de verbetering gaat: wat wél mag worden toegevoegd (doel, gewenste vorm,
              lengte) en wat niet (verzonnen feiten, een heel sjabloon). Het model krijgt alleen de
              getypte tekst te zien, niet het gesprek of de bijlagen. Laat leeg om de ingebouwde
              standaard te gebruiken.
            </PromptField>
          </Block>

          <Block title="Projectinstructie omschrijven tot systeemprompt">
            <>
              Hetzelfde oranje sterretje, maar dan in het veld &ldquo;Projectinstructie&rdquo; van de
              projectinstellingen. Eén klik schrijft de ruwe instructie om tot een volwaardige
              systeemprompt. Dit is een <strong>zwaardere</strong> slag dan het sterretje in de chat: de
              uitkomst stuurt <em>elk</em> gesprek in dat project, dus er wordt een vaste rol, een vast
              eindproduct en een uitweg bij twijfel in uitgewerkt. Het resultaat vervangt het veld maar
              wordt niet opgeslagen; de gebruiker leest het na en slaat zelf op, of haalt zijn eigen tekst
              terug.
            </>
            <nldd-banner
              size="sm"
              text={`Deze slag draait op het chatmodel${
                projectModelLabelFor(chat.provider, chat.model)
                  ? `, nu ${projectModelLabelFor(chat.provider, chat.model)}`
                  : ' (bij Automatisch: het sterkste model van de provider die als eerste antwoordt)'
              }.`}
              supporting-text="Is er geen geldig model gekozen, dan neemt hij het sterkste model van de provider. Wat eruit komt stuurt daarna elk gesprek in dat project, en een kleiner model verzint daar sneller regels bij die de gebruiker nooit heeft opgeschreven."
            ></nldd-banner>
            <Toggle
              label="Sterretje tonen bij de projectinstructie"
              checked={chat.projectOptimizeEnabled}
              onChecked={(c) => patchChat({ projectOptimizeEnabled: c })}
              disabled={!chat.enabled}
            />
            <PromptField
              label="Instructie voor het omschrijven"
              value={chat.projectOptimizeSystemPrompt}
              onValue={(v) => patchChat({ projectOptimizeSystemPrompt: v })}
              placeholder="Bijv. Herschrijf de ruwe projectinstructie tot een volwaardige systeemprompt…"
              rows={8}
              disabled={!chat.enabled || !chat.projectOptimizeEnabled}
              isDefault={chat.projectOptimizeSystemPrompt.trim() === DEFAULT_PROJECT_OPTIMIZE_PROMPT}
              onReset={() => patchChat({ projectOptimizeSystemPrompt: DEFAULT_PROJECT_OPTIMIZE_PROMPT })}
            >
              De standaardtekst stuurt op zes onderwerpen: wie de assistent is, wat er elk gesprek uit
              moet komen (en wat niet), waaraan je ziet dat het goed is, de regels mét hun reden, de
              termen die letterlijk moeten blijven, en wat er gebeurt als informatie ontbreekt. De
              zwaarste regel erin is wat er <em>niet</em> bij mag komen. Dat heeft twee redenen: een
              verzonnen regel werkt door in elk volgend gesprek zonder dat de gebruiker ziet waar hij
              vandaan komt, én elke extra regel verkleint de kans dat de echte regels nog worden
              opgevolgd. Het model krijgt de ruwe instructie te zien plus de projectnaam en de namen van
              de bronbestanden, niet de inhoud daarvan. Laat leeg om de ingebouwde standaard te
              gebruiken.
            </PromptField>
          </Block>

          <Block title="Zoeken op internet">
            <>
              Zet dit aan, dan staat er in de invoerbalk van de chat een knop &ldquo;Zoeken&rdquo;. Heeft
              de gebruiker die aanstaan, dan gaat zijn vraag eerst naar een zoekmachine en krijgt het model
              de gevonden pagina&rsquo;s mee als bronnen. Onder het antwoord staan die bronnen als
              aanklikbare links, zodat de gebruiker kan nalezen of het klopt. De knop staat standaard uit en
              de gebruiker kiest per bericht; zoeken kost een paar seconden extra voordat het antwoord
              begint.
            </>
            <nldd-banner size="sm" text="Hier aanzetten is niet genoeg: er moet ook een zoekdienst achter zitten.">
              <nldd-text size="sm">
                Die staat in de secrets van de edge function, niet in dit scherm, want een zoekadres dat
                de browser mag kiezen is een adres dat iedereen mag kiezen. Zet er één van deze twee klaar
                met <code>supabase secrets set</code>: <strong>TAVILY_API_KEY</strong> (1000
                zoekopdrachten per maand gratis, geen creditcard) of <strong>SEARXNG_URL</strong> (een
                eigen SearXNG-server: open source en geen prijs per zoekopdracht, maar je host hem zelf).
                Staat er geen van beide, dan doet de knop niets en antwoordt het model gewoon uit eigen
                kennis.
              </nldd-text>
            </nldd-banner>
            <Toggle
              label="Knop “Zoeken” tonen in het invoerveld van de chat"
              checked={chat.webSearchEnabled}
              onChecked={(c) => patchChat({ webSearchEnabled: c })}
              disabled={!chat.enabled}
            />
            <RangeField
              label="Aantal bronnen per vraag"
              supportingLabel={`Nu ${chat.webSearchResults}`}
              min={1}
              max={MAX_WEB_SEARCH_RESULTS}
              step={1}
              value={chat.webSearchResults}
              onValue={(v) => patchChat({ webSearchResults: v })}
              disabled={!chat.enabled || !chat.webSearchEnabled}
              help="Meer bronnen geven een completer beeld, maar maken de vraag aan het model langer en daarmee trager. Vijf is een goede middenweg."
            />
            <PromptField
              label="Instructie bij de gevonden bronnen"
              value={chat.webSearchInstruction}
              onValue={(v) => patchChat({ webSearchInstruction: v })}
              placeholder="Bijv. Beantwoord de vraag met wat er in de bronnen staat en verwijs met [1]…"
              rows={8}
              disabled={!chat.enabled || !chat.webSearchEnabled}
              isDefault={chat.webSearchInstruction.trim() === DEFAULT_WEB_SEARCH_INSTRUCTION}
              onReset={() => patchChat({ webSearchInstruction: DEFAULT_WEB_SEARCH_INSTRUCTION })}
            >
              Deze tekst komt onder de systeemprompt van de chat te staan, en alleen wanneer het zoeken
              ook echt iets heeft opgeleverd; de gevonden pagina&rsquo;s staan er als genummerde bronnen
              onder. De standaardtekst regelt drie dingen: de bronnen gaan vóór wat het model zelf dacht
              te weten, wat er in geen enkele bron staat mag er niet bij verzonnen worden, en achter elke
              bewering hoort een verwijzing als [1] met onderaan de bijbehorende lijst. Laat leeg om de
              ingebouwde standaard te gebruiken.
            </PromptField>
          </Block>
        </Panel>
      )}

      {tab === 'grenzen' && (
        <Panel>
          {/* Guardrail: personal data */}
          <Block title="Guardrail: persoonsgegevens (AVG)">
            <>
              Detecteert mogelijke persoonsgegevens (e-mail, BSN, telefoonnummer, IBAN, naam met aanhef,
              geboortedatum) in de invoer van de bouwer en in chatberichten en bijlagen. Bij detectie gaat er
              niets naar de AI tot de gebruiker bevestigt.
            </>
            <Toggle
              label="Waarschuw en blokkeer bij mogelijke persoonsgegevens"
              checked={settings.pii.enabled}
              onChecked={(c) => patch({ pii: { ...settings.pii, enabled: c } })}
            />
            <PromptField
              label="Waarschuwingstekst voor de gebruiker"
              value={settings.pii.warning}
              onValue={(v) => patch({ pii: { ...settings.pii, warning: v } })}
              rows={3}
              disabled={!settings.pii.enabled}
            />
          </Block>

          {/* Blocked topics */}
          <Block title="Verboden onderwerpen">
            <>
              Bevat de prompt een van deze termen, dan wordt de gebruiker gewaarschuwd en moet die bevestigen
              voordat het optimaliseren doorgaat.
            </>
            {settings.blockedTopics.length > 0 ? (
              <nldd-container layout="wrap" gap="8">
                {settings.blockedTopics.map((topic) => (
                  <TopicToken key={topic} topic={topic} onRemove={() => removeTopic(topic)} />
                ))}
              </nldd-container>
            ) : (
              <nldd-text size="sm" color="secondary">
                Nog geen verboden onderwerpen ingesteld.
              </nldd-text>
            )}
            <TopicAdder value={topicDraft} onValue={setTopicDraft} onAdd={addTopic} />
          </Block>
        </Panel>
      )}

      <nldd-divider></nldd-divider>
      <nldd-container layout="row" gap="12" horizontal-alignment="right">
        {saveButton}
      </nldd-container>
    </nldd-container>
  );
}

/** The content of one tab: its blocks, with a divider between each two. */
function Panel({ children }: { children: ReactNode }) {
  // Zoals op main: elk blok instellingen op een eigen witte kaart.
  const blocks = Children.toArray(children);
  return (
    <nldd-container layout="stack" gap="16">
      {blocks.map((block, i) => (
        <nldd-card key={i}>
          <nldd-container padding="24" sm-padding="16">
            {block}
          </nldd-container>
        </nldd-card>
      ))}
    </nldd-container>
  );
}

/** A settings block: a section heading, an introduction and its fields. */
function Block({ title, children }: { title: string; children: [ReactNode, ...ReactNode[]] }) {
  const [intro, ...rest] = children;
  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title heading-level={2} size={4} text={title}>
        <nldd-text slot="supporting-text" color="secondary">
          {intro}
        </nldd-text>
      </nldd-title>
      {rest}
    </nldd-container>
  );
}

/** Link to the chat model settings on the Chat tab; switches tab instead of routing. */
function ChatModelLink({ onGo }: { onGo: () => void }) {
  return (
    <nldd-link
      href="#chat-model"
      text="Chat"
      onClick={(e) => {
        e.preventDefault();
        onGo();
      }}
    ></nldd-link>
  );
}

/** A multi-line prompt field with its help text and a reset to the built-in default. */
function PromptField({
  label,
  value,
  onValue,
  placeholder,
  rows,
  disabled,
  isDefault = true,
  onReset,
  children,
}: {
  label: string;
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  isDefault?: boolean;
  onReset?: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-container layout="stack" gap="8">
      <nldd-form-field label={label}>
        <nldd-multi-line-text-field
          ref={ref}
          rows={rows}
          resize="vertical"
          placeholder={placeholder}
          disabled={disabled || undefined}
        ></nldd-multi-line-text-field>
        {children && <nldd-form-field-help-text>{children}</nldd-form-field-help-text>}
      </nldd-form-field>
      {!isDefault && onReset && (
        <nldd-container width="fit-content">
          <nldd-button
            size="sm"
            appearance="neutral-tinted"
            start-icon="arrow-2-counter-clockwise"
            text="Herstel standaard"
            accessible-label={`Herstel standaard: ${label}`}
            disabled={disabled || undefined}
            onClick={onReset}
          ></nldd-button>
        </nldd-container>
      )}
    </nldd-container>
  );
}

function TextInput({
  label,
  value,
  onValue,
  placeholder,
}: {
  label: string;
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-form-field label={label}>
      <nldd-text-field ref={ref} type="text" placeholder={placeholder}></nldd-text-field>
    </nldd-form-field>
  );
}

function Toggle({
  label,
  checked,
  onChecked,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChecked: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => {
    const target = e.currentTarget as (HTMLElement & { checked?: boolean }) | null;
    onChecked(e.detail?.checked ?? !!target?.checked);
  });
  return (
    <nldd-switch-field
      ref={ref}
      label={label}
      checked={checked || undefined}
      disabled={disabled || undefined}
    ></nldd-switch-field>
  );
}

function RangeField({
  label,
  supportingLabel,
  min,
  max,
  step,
  value,
  onValue,
  disabled,
  help,
}: {
  label: string;
  supportingLabel?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onValue: (value: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const read = (e: CustomEvent<{ value?: number }>) => {
    const target = e.currentTarget as (HTMLElement & { value?: number }) | null;
    const next = Number(e.detail?.value ?? target?.value);
    if (!Number.isNaN(next)) onValue(next);
  };
  useNlddEvent<CustomEvent<{ value?: number }>>(ref, 'input', read);
  useNlddEvent<CustomEvent<{ value?: number }>>(ref, 'change', read);
  return (
    <nldd-form-field label={label} supporting-label={supportingLabel}>
      <nldd-slider
        ref={ref}
        min={String(min)}
        max={String(max)}
        step={String(step)}
        value={String(value)}
        disabled={disabled || undefined}
      ></nldd-slider>
      {help && <nldd-form-field-help-text>{help}</nldd-form-field-help-text>}
    </nldd-form-field>
  );
}

function CreativitySlider({
  value,
  onValue,
  disabled,
}: {
  value: number;
  onValue: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <RangeField
      label="Creativiteit"
      supportingLabel={`Van voorspelbaar (0) tot creatief (1), nu ${value.toFixed(2)}`}
      min={0}
      max={1}
      step={0.05}
      value={value}
      onValue={onValue}
      disabled={disabled}
    />
  );
}

/** Text field plus button that adds a blocked topic; Enter adds as well. */
function TopicAdder({
  value,
  onValue,
  onAdd,
}: {
  value: string;
  onValue: (value: string) => void;
  onAdd: () => void;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-form>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <nldd-form-field label="Nieuw onderwerp">
          <nldd-text-field
            ref={ref}
            type="text"
            enter-key="done"
            placeholder="Bijv. politieke voorkeur, medisch dossier…"
          ></nldd-text-field>
        </nldd-form-field>
        <nldd-form-actions>
          <nldd-button-group>
            <nldd-button type="submit" appearance="secondary" start-icon="plus" text="Voeg toe"></nldd-button>
          </nldd-button-group>
        </nldd-form-actions>
      </form>
    </nldd-form>
  );
}

function TopicToken({ topic, onRemove }: { topic: string; onRemove: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'dismiss', () => onRemove());
  return <nldd-token ref={ref} text={topic} control="dismiss" dismiss-text={`Verwijder ${topic}`}></nldd-token>;
}

/** Provider choice as a radio list; shared by the optimization and chat blocks. */
function ProviderChoice({
  label,
  value,
  onSelect,
  disabled,
}: {
  label: string;
  value: AiProvider;
  onSelect: (provider: AiProvider) => void;
  disabled?: boolean;
}) {
  return (
    <nldd-list type="radiogroup" appearance="box-tinted" accessible-label={label}>
      {AI_MODELS.map((m) => (
        <nldd-list-item
          key={m.id}
          radio
          checked={m.id === value || undefined}
          disabled={disabled || undefined}
          onClick={() => {
            if (!disabled && m.id !== value) onSelect(m.id);
          }}
        >
          <nldd-text-cell text={m.label} supporting-text={m.hint}></nldd-text-cell>
        </nldd-list-item>
      ))}
    </nldd-list>
  );
}

/** Model choice within a provider, with indicative prices; shared by both blocks. */
function ModelChoice({
  label,
  provider,
  value,
  onSelect,
  disabled,
}: {
  label: string;
  provider: Exclude<AiProvider, 'auto'>;
  value: string;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
}) {
  return (
    <nldd-list type="radiogroup" appearance="box-tinted" accessible-label={label}>
      {PROVIDER_MODELS[provider].map((mdl) => (
        <nldd-list-item
          key={mdl.id}
          radio
          checked={mdl.id === value || undefined}
          disabled={disabled || undefined}
          onClick={() => {
            if (!disabled && mdl.id !== value) onSelect(mdl.id);
          }}
        >
          <nldd-text-cell
            text={mdl.label}
            overline={mdl.id}
            supporting-text={`${mdl.hint} · ${pricingSummary(mdl.pricing)}`}
          ></nldd-text-cell>
        </nldd-list-item>
      ))}
    </nldd-list>
  );
}
