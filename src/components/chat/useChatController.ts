// Orkestratie van de chatpagina: gespreksstate, verzenden/streamen/stoppen,
// bijlagen en gesprek-CRUD. Bewust een hook (geen component) zodat een latere
// ingebedde chat in de generator (Fase 3) dezelfde logica kan hergebruiken.

import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { v4 as uuid } from 'uuid';
import { defaultModelFor } from '@/config/aiModels';
import {
  buildChatBackup,
  conversationToMarkdown,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  DEVICE_STORAGE_ID,
  loadChatIndex,
  loadConversation,
  MAX_CONVERSATIONS,
  migrateAccountBuckets,
  restoreChatBackup,
  saveConversation,
  titleFromFirstMessage,
} from '@/lib/chatStorage';
import { splitAnswer } from '@/lib/chatFiles';
import { buildRoutekaartHtml, parseRoutekaart } from '@/lib/routekaart';
import { downloadText } from '@/lib/download';
import { sendChatMessage } from '@/services/chatService';
import { hasMemoryTrigger } from '@/lib/memoryTriggers';
import { rememberWish, type MemoryNotice } from '@/components/chat/rememberWish';
import { generateTitle } from '@/services/optimizeService';
import { loadProjectContext } from '@/services/chatProjectService';
import type { ChatSettings } from '@/services/settingsService';
import type {
  AiProviderResult,
  ChatAttachment,
  ChatConversation,
  ChatIndexEntry,
  ChatMessage,
  ChatProjectContext,
  ChatSource,
} from '@/types';

/** Maximum aantal bijlagen per gesprek (zelfde grens als server-side). */
export const MAX_CHAT_ATTACHMENTS = 3;
/** Maximale tekstomvang per bijlage (zelfde grens als server-side). */
export const MAX_CHAT_ATTACHMENT_CHARS = 50_000;
/** Maximale bestandsgrootte per bijlage, gelijk aan een bronbestand in een project. */
export const MAX_CHAT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/**
 * Zo vaak schrijft de chat een afgebroken antwoord vanzelf verder. Elke ronde
 * is hooguit 8192 tokens (MODE_MAX_TOKENS.chat in de edge function), dus vijf
 * rondes dekken zo'n 40.000 tokens: ruim voor een groot HTML-bestand, en binnen
 * MAX_CONTINUE_CHARS van de edge function. Daarna beslist de gebruiker met
 * "Ga verder", zodat een model dat in een herhaling blijft hangen niet
 * eindeloos doorloopt.
 */
const MAX_AUTO_CONTINUE = 4;
/** Tot deze lengte is het eerste bericht zelf een goede titel. */
const MAX_LOCAL_TITLE = 48;
/** Voor een titel is het begin van een prompt genoeg. */
const MAX_TITLE_SOURCE = 2000;

export interface ChatControllerOptions {
  /**
   * Niet in localStorage/index bewaren; het gesprek leeft alleen in-memory.
   * Voor de Testkamer in de generator: testruns zijn wegwerp en zouden anders
   * de 30-gesprekken-cap en de opslagquota van echte gesprekken opeten.
   */
  ephemeral?: boolean;
  /** Alle gesprekken van deze controller draaien als prompt-uitvoering. */
  kind?: ChatConversation['kind'];
  /**
   * Denken aan: het model redeneert eerst en antwoordt daarna pas. Komt van de
   * knop in de invoerbalk, dus de stand kan tussen twee beurten wisselen.
   */
  thinking?: boolean;
  /**
   * Zoeken op internet aan: de server zoekt eerst en levert de bronnen bij het
   * antwoord. Net als de denkstand een knop in de invoerbalk, dus per beurt te
   * wisselen.
   */
  webSearch?: boolean;
}

export interface ChatController {
  conversation: ChatConversation | null;
  index: ChatIndexEntry[];
  streaming: boolean;
  /**
   * Waar de lopende beurt is: 'searching' (op internet aan het zoeken),
   * 'drafting', 'thinking', 'writing' of 'continuing' (een lang antwoord wordt
   * in een volgende ronde verder geschreven). Null zodra er niets loopt. Hiermee kan
   * de berichtenlijst de stilte vóór de eerste regel verklaren.
   */
  phase: string | null;
  extracting: boolean;
  send: (text: string) => Promise<void>;
  /** Wat het geheugen bij het laatste bericht deed; de chat toont het boven het tekstvak. */
  memoryNotice: MemoryNotice | null;
  dismissMemoryNotice: () => void;
  /** Start een vers gesprek en verstuur `text` daarin (generator-handoff). */
  sendInNewConversation: (text: string, kind?: ChatConversation['kind']) => void;
  stop: () => void;
  /** Probeer het laatste, mislukte antwoord opnieuw. */
  retry: () => void;
  /**
   * Maak de routekaart uit `text` direct met de vaste routekaart van
   * PromptPlein, zonder AI. Het bericht en het bestand komen in het gesprek.
   */
  addRoutekaart: (text: string) => Promise<void>;
  /**
   * Schrijf het laatste antwoord verder vanaf waar het ophield: na de stop-knop,
   * of als ook het automatisch verderschrijven het niet heeft afgemaakt.
   */
  continueLast: () => void;
  /**
   * Vervang een eigen bericht door `text`: alles vanaf dat bericht vervalt en de
   * AI schrijft opnieuw. Alleen voor het laatste eigen bericht, omdat een gesprek
   * één lijn is en eerdere beurten er anders onherstelbaar uit zouden vallen.
   */
  editMessage: (messageId: string, text: string) => void;
  /**
   * Start een vers, leeg gesprek. Met `kind: 'execution'` draait dat gesprek
   * onder de neutrale uitvoer-systeemprompt (de gekopieerde prompt uit de
   * bouwer bepaalt dan zelf taal, toon en opmaak).
   */
  newConversation: (kind?: ChatConversation['kind']) => void;
  /**
   * Start een vers gesprek dat bij `projectId` hoort. Het gesprek draait dan het
   * hele leven onder de projectinstructie en bronbestanden van dat project.
   */
  newConversationInProject: (projectId: string) => void;
  /**
   * Zet de keuze uit het contextvenster door. Staan er al berichten, dan wordt
   * een ander project een nieuwe chat: de projectinstructie geldt voor het hele
   * gesprek, en halverwege wisselen zou eerdere beurten onverklaarbaar maken. Is `forPrompt` aan, dan wordt een lege chat
   * zonder project een uitvoergesprek: de prompt draait dan onder de neutrale
   * systeemprompt, net als "Uitvoeren in chat". Bijlagen blijven staan.
   */
  applyContext: (projectId: string | null, forPrompt: boolean) => void;
  selectConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  removeAllConversations: () => void;
  /** Download alle gesprekken als één bestand dat later terug te zetten is. */
  exportHistory: () => void;
  /** Download één gesprek als leesbare tekst (Markdown). */
  exportConversation: (id: string) => void;
  /** Zet een eerder gedownload geschiedenisbestand terug op dit apparaat. */
  importHistory: (file: File) => Promise<void>;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (id: string) => void;
}

export default function useChatController(
  settings: ChatSettings | null,
  options?: ChatControllerOptions,
): ChatController {
  // De gesprekken horen bij dit apparaat, niet bij een account: ingelogd of
  // niet, je ziet dezelfde chats, en uitloggen wist niets.
  const userId = DEVICE_STORAGE_ID;
  // Primitieven i.p.v. het options-object in de dependencies: de aanroeper
  // geeft doorgaans een inline object mee en dat zou elke render alle
  // callbacks verversen.
  const ephemeral = options?.ephemeral ?? false;
  const defaultKind = options?.kind;
  const thinking = options?.thinking ?? false;
  const webSearch = options?.webSearch ?? false;

  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [index, setIndex] = useState<ChatIndexEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [memoryNotice, setMemoryNotice] = useState<MemoryNotice | null>(null);
  const dismissMemoryNotice = useCallback(() => setMemoryNotice(null), []);
  const [phase, setPhase] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Refs naast state: `send` en `retry` hebben de actuele waarden nodig zonder
  // stale closures, ook wanneer ze elkaar direct opvolgen.
  const conversationRef = useRef<ChatConversation | null>(null);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const quotaWarnedRef = useRef(false);

  const update = useCallback((next: ChatConversation | null) => {
    conversationRef.current = next;
    setConversation(next);
  }, []);

  const refreshIndex = useCallback(() => {
    setIndex(ephemeral ? [] : loadChatIndex(userId));
  }, [userId, ephemeral]);

  /** Direct (niet-debounced) opslaan; waarschuwt eenmalig bij een volle opslag. */
  const persistNow = useCallback(
    (conv: ChatConversation) => {
      if (ephemeral || conv.messages.length === 0) return;
      const ok = saveConversation(userId, conv);
      if (!ok && !quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        notify.error(
          'Opslaan op dit apparaat lukt niet; deze chat gaat verloren zodra je de pagina verlaat.',
        );
      }
      refreshIndex();
    },
    [ephemeral, userId, refreshIndex],
  );

  // Init: recentste gesprek hervatten, anders een vers gesprek. Staan er nog
  // chats in een oude bak per account, dan verhuizen die eerst naar dit
  // apparaat.
  // Ephemeer (Testkamer): niets laden of hervatten, altijd een vers gesprek.
  useEffect(() => {
    abortRef.current?.abort();
    if (ephemeral) {
      setIndex([]);
      update(createConversation(defaultKind));
      return;
    }
    migrateAccountBuckets();
    const entries = loadChatIndex(userId);
    setIndex(entries);
    const recent = entries[0] ? loadConversation(userId, entries[0].id) : null;
    update(recent ?? createConversation());
  }, [userId, ephemeral, defaultKind, update]);

  // Multi-tab: bij terugkeer naar dit tabblad de gesprekkenlijst herlezen.
  useEffect(() => {
    const onFocus = () => refreshIndex();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshIndex]);

  // Bij unmount een eventueel lopende stream netjes afbreken.
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Modelnaam voor de badge bij een bericht, gespiegeld aan resolveModel server-side. */
  const modelForProvider = useCallback(
    (provider: string | undefined): string | undefined => {
      if (!provider || !settings) return undefined;
      if (provider === settings.provider) return settings.model;
      if (
        provider === 'claude' ||
        provider === 'openai' ||
        provider === 'deepseek' ||
        provider === 'mistral'
      ) {
        return defaultModelFor(provider);
      }
      return undefined;
    },
    [settings],
  );

  /**
   * Streamt het antwoord in `assistantId` en schrijft het automatisch verder
   * zolang het afbreekt voordat het klaar is: een lang document of een
   * HTML-bestand past niet in één aanroep (uitvoerbudget en tijdslimiet van de
   * edge function). Elke ronde is een nieuwe aanroep die verderschrijft vanaf de
   * laatste letter; de gebruiker ziet één doorlopend antwoord.
   *
   * `startText` is wat er al staat ("Ga verder" op een afgebroken antwoord);
   * leeg = een nieuw antwoord.
   */
  const streamAnswer = useCallback(
    async (
      conv: ChatConversation,
      assistantId: string,
      history: { role: 'user' | 'assistant'; content: string }[],
      startText: string,
    ) => {
      if (!settings) return;
      streamingRef.current = true;
      setStreaming(true);
      setPhase(startText ? 'continuing' : webSearch ? 'searching' : null);

      // Hoort dit gesprek bij een project, dan halen we de projectinstructie en de
      // bronbestanden erbij (gecachet, dus normaal gratis). Lukt dat niet — het
      // project is verwijderd of de backend antwoordt niet — dan gaat de beurt
      // gewoon door als gewone chat. Een mislukte projectophaling mag een
      // gebruiker nooit zijn bericht kosten.
      let project: ChatProjectContext | null = null;
      let projectSources: string[] | undefined;
      if (conv.projectId) {
        try {
          // De vraag kiest in een te groot project welke stukken van de
          // bronbestanden er meegaan. De vraag ervoor gaat mee, want een
          // vervolgvraag als "en bij punt 3?" zegt op zichzelf te weinig.
          const asking = history
            .filter((m) => m.role === 'user')
            .slice(-2)
            .map((m) => m.content)
            .join('\n');
          // De eerste vraag in een groot project wacht op de vectoren; zeg dat.
          if (!startText) setPhase('sources');
          const result = await loadProjectContext(conv.projectId, asking).finally(() =>
            setPhase(startText ? 'continuing' : webSearch ? 'searching' : null),
          );
          project = result?.context ?? null;
          if (result?.searched) projectSources = result.context.files.map((f) => f.name);
          if (result?.searched && !startText) {
            notify(
              'Groot project: alleen de stukken die bij je vraag passen gaan mee in dit antwoord.',
              { icon: '🔍' },
            );
          } else if (result?.skipped.length && !startText) {
            // Stil afkappen zou de gebruiker laten denken dat het model alles
            // gelezen heeft; daarom benoemen we wat er buiten het budget viel.
            notify(
              `Te veel bronmateriaal: ${result.skipped.join(', ')} gaat niet mee in dit antwoord.`,
              { icon: '✂️' },
            );
          }
        } catch {
          /* project onbereikbaar — de beurt draait verder als gewone chat */
        }
      }

      const controller = new AbortController();
      abortRef.current = controller;

      /** Zet de eindstand of een tussenstand van het antwoord in het gesprek. */
      const commit = (patch: Partial<ChatMessage>, save: boolean) => {
        const cur = conversationRef.current;
        if (!cur || cur.id !== conv.id) return;
        const messages = cur.messages.map((m) => {
          if (m.id !== assistantId) return m;
          const next: ChatMessage = { ...m, ...patch };
          // Vlaggen van een eerdere ronde gelden niet meer als deze ronde ze niet zet.
          if (!('error' in patch)) delete next.error;
          if (!('stopped' in patch)) delete next.stopped;
          if (!('incomplete' in patch)) delete next.incomplete;
          return next;
        });
        const next = { ...cur, messages, updatedAt: new Date().toISOString() };
        update(next);
        if (save) persistNow(next);
      };

      // De tekst van alle rondes samen, precies zoals hij binnenkwam.
      let full = startText;
      let sources: ChatSource[] | undefined;
      let provider: AiProviderResult | undefined;
      let model: string | undefined;

      for (let round = 0; ; round++) {
        const base = full;
        // rAF-gethrottlede tussenstanden: maximaal één render per frame, en
        // alleen het laatste bericht wijzigt (de rijen zelf zijn gememoïseerd).
        let pendingText: string | null = null;
        let rafId = 0;
        const flushPending = () => {
          rafId = 0;
          if (pendingText === null) return;
          const value = pendingText;
          pendingText = null;
          setConversation((cur) =>
            cur && cur.id === conv.id
              ? {
                  ...cur,
                  messages: cur.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: value } : m,
                  ),
                }
              : cur,
          );
        };

        const continuing = Boolean(base);
        const res = await sendChatMessage({
          messages: history,
          attachments: conv.attachments.map((a) => ({ name: a.name, text: a.text })),
          settings,
          // Het gesprek zelf bepaalt de modus: een uitvoergesprek blijft dat ook
          // voor vervolgbeurten, óók na een refresh (kind overleeft de opslag).
          kind: conv.kind,
          project,
          // Denken en zoeken horen bij het begin van het antwoord; het vervolg
          // sluit alleen aan op wat er al staat.
          thinking: continuing ? false : thinking,
          webSearch: continuing ? false : webSearch,
          continueFrom: continuing ? base : undefined,
          onChunk: (textSoFar) => {
            pendingText = base + textSoFar;
            if (!rafId) rafId = requestAnimationFrame(flushPending);
          },
          // Alleen de fase: die verklaart de stilte vóór de eerste regel (zoeken
          // duurt een paar seconden). De bronnen zelf komen via het resultaat
          // hieronder mee, want daar horen ze bij het bericht.
          onStatus: (status) => {
            if (status.phase) setPhase(continuing ? 'continuing' : status.phase);
          },
          signal: controller.signal,
        });
        if (rafId) cancelAnimationFrame(rafId);

        // Vervolgrondes plakken de onbewerkte tekst aan; een bijgeknipte
        // regelovergang zou twee regels code aan elkaar zetten.
        const piece =
          continuing || res.incomplete || res.aborted ? (res.raw ?? res.text) : res.text;
        full = continuing ? base + piece : piece;
        if (res.provider) {
          provider = res.provider as AiProviderResult;
          model = modelForProvider(res.provider);
        }
        // Lege bronnenlijst = er is gezocht maar niets gevonden; dan hoort er
        // ook geen kopje "Bronnen" onder het antwoord te staan.
        if (!continuing && res.sources?.length) sources = res.sources;
        const fixed = {
          content: full,
          provider,
          model,
          ...(sources ? { sources } : {}),
          ...(projectSources ? { projectSources } : {}),
        };

        if (res.aborted) {
          commit({ ...fixed, stopped: true }, true);
          break;
        }
        const madeProgress = Boolean(piece.trim());
        // Een vervolg zonder nieuwe tekst: het model had niets meer toe te
        // voegen. Mistral meldt dan soms toch nog 'length', omdat het
        // meegegeven begin meetelt in het budget. Staat er geen codeblok meer
        // open, dan is het antwoord af; anders blijft "Ga verder" staan.
        if (continuing && !madeProgress && !res.error) {
          const lastSegment = splitAnswer(full).at(-1);
          const openBlock = lastSegment?.kind === 'code' && !lastSegment.closed;
          commit(
            openBlock ? { ...fixed, incomplete: true } : { ...fixed, content: full.trimEnd() },
            true,
          );
          break;
        }
        if (res.incomplete && madeProgress && round < MAX_AUTO_CONTINUE) {
          // Tussenstand bewaren: een refresh halverwege houdt dan alles wat er
          // al staat, en "Ga verder" pakt het daarna op.
          commit({ ...fixed, incomplete: true }, true);
          setPhase('continuing');
          continue;
        }
        if (res.error) {
          // Staat er al tekst, dan blijft die staan en is het antwoord "niet af"
          // in plaats van mislukt: "Ga verder" maakt het dan alsnog af.
          commit(
            full.trim() ? { ...fixed, error: res.error, incomplete: true } : { ...fixed, error: res.error },
            true,
          );
          break;
        }
        commit(res.incomplete ? { ...fixed, incomplete: true } : { ...fixed, content: full.trimEnd() }, true);
        break;
      }

      abortRef.current = null;
      streamingRef.current = false;
      setStreaming(false);
      setPhase(null);
    },
    [settings, thinking, webSearch, update, persistNow, modelForProvider],
  );

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || streamingRef.current || !settings) return;
      // Een nieuw bericht: de melding over het vorige geldt niet meer.
      setMemoryNotice(null);

      const base = conversationRef.current ?? createConversation(defaultKind);
      const now = new Date().toISOString();
      const userMsg: ChatMessage = { id: uuid(), role: 'user', content: text, createdAt: now };
      const assistantMsg: ChatMessage = { id: uuid(), role: 'assistant', content: '', createdAt: now };
      const updated: ChatConversation = {
        ...base,
        title: base.messages.length === 0 ? titleFromFirstMessage(text) : base.title,
        updatedAt: now,
        messages: [...base.messages, userMsg, assistantMsg],
      };
      update(updated);
      const isFirstMessage = base.messages.length === 0;

      // De vraag meteen bewaren (zonder de nog lege assistant-placeholder),
      // zodat een refresh midden in de stream het gesprek niet kwijtraakt.
      persistNow({ ...updated, messages: [...base.messages, userMsg] });

      // Geschiedenis voor het model: eerdere beurten zonder mislukte antwoorden
      // en zonder bestanden die PromptPlein zelf maakte.
      const history = updated.messages
        .filter((m) => m.id !== assistantMsg.id && !m.error && !m.madeBy && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

      // "Voortaan", "onthoud dit", "vanaf nu": eerst vastleggen, dan antwoorden,
      // zodat een wens die een oude vervangt al in dit antwoord geldt. Niet in een
      // uitvoergesprek: daar staan zulke woorden in de prompt die getest wordt.
      if (updated.kind !== 'execution' && hasMemoryTrigger(text)) {
        const earlier = base.messages.filter((m) => !m.error && !m.madeBy && m.content.trim());
        // Al bezig: zo kan er tijdens het vastleggen geen tweede bericht door.
        streamingRef.current = true;
        setStreaming(true);
        await rememberWish({
          message: text,
          previousUser: earlier.filter((m) => m.role === 'user').at(-1)?.content,
          previousAssistant: earlier.filter((m) => m.role === 'assistant').at(-1)?.content,
          preferredProvider: settings.provider,
          preferredModel: settings.model,
        }, setMemoryNotice);
      }

      await streamAnswer(updated, assistantMsg.id, history, '');

      // Een lang eerste bericht is meestal een prompt, en dan zegt het begin
      // ervan niets ("#CONTEXT: Je bent een..."). Pas na het antwoord: de titel
      // mag het gesprek niet ophouden en is bijzaak als hij niet lukt.
      if (isFirstMessage && text.length > MAX_LOCAL_TITLE && !ephemeral) {
        const title = await generateTitle({
          templateContent: text.slice(0, MAX_TITLE_SOURCE),
          preferredProvider: settings.provider,
          preferredModel: settings.model,
        });
        const cur = conversationRef.current;
        if (cur && cur.id === updated.id && title && title !== 'Nieuwe prompt') {
          const next = { ...cur, title };
          update(next);
          persistNow(next);
        }
      }
    },
    [settings, defaultKind, ephemeral, update, persistNow, streamAnswer],
  );

  const continueLast = useCallback(() => {
    const cur = conversationRef.current;
    if (!cur || streamingRef.current) return;
    const last = cur.messages[cur.messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.content.trim()) return;
    if (!last.incomplete && !last.stopped) return;
    // Dezelfde geschiedenis als bij het begin van dit antwoord: alles ervoor.
    const history = cur.messages
      .slice(0, -1)
      .filter((m) => !m.error && !m.madeBy && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    void streamAnswer(cur, last.id, history, last.content);
  }, [streamAnswer]);

  const addRoutekaart = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || streamingRef.current) return;
      const data = parseRoutekaart(text);
      if (!data) {
        notify.error('In dit bericht staat geen volledige routekaart (KOP, haltes en FINISH).');
        return;
      }
      let html: string;
      try {
        html = await buildRoutekaartHtml(data);
      } catch {
        notify.error('De routekaart kon niet worden gemaakt.');
        return;
      }
      const base = conversationRef.current ?? createConversation(defaultKind);
      const now = new Date().toISOString();
      const userMsg: ChatMessage = { id: uuid(), role: 'user', content: text, createdAt: now };
      const fileMsg: ChatMessage = {
        id: uuid(),
        role: 'assistant',
        content: `Gemaakt met de vaste routekaart van PromptPlein, met de inhoud uit je bericht. Zonder AI, dus elke routekaart heeft dezelfde opmaak.\n\n\`\`\`html\n${html}\n\`\`\``,
        createdAt: now,
        provider: 'local-template',
        madeBy: 'routekaart',
      };
      const next: ChatConversation = {
        ...base,
        title: base.messages.length === 0 ? data.kop.titel || titleFromFirstMessage(text) : base.title,
        updatedAt: now,
        messages: [...base.messages, userMsg, fileMsg],
      };
      update(next);
      persistNow(next);
    },
    [defaultKind, update, persistNow],
  );

  const sendInNewConversation = useCallback(
    (text: string, kind?: ChatConversation['kind']) => {
      if (streamingRef.current) return;
      update(createConversation(kind ?? defaultKind));
      // Een routekaart (vanuit de bouwer via "Uitvoeren in chat") laat de AI
      // niet zelf programmeren: met Mistral liepen labels en weg dan door elkaar.
      // De vaste routekaart maakt hem altijd in dezelfde opmaak.
      if (parseRoutekaart(text)) {
        void addRoutekaart(text);
        return;
      }
      void send(text);
    },
    [send, update, defaultKind, addRoutekaart],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const cur = conversationRef.current;
    if (!cur || streamingRef.current) return;
    const messages = [...cur.messages];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.madeBy) return;
    messages.pop();
    const lastUser = messages[messages.length - 1];
    if (!lastUser || lastUser.role !== 'user') return;
    messages.pop();
    update({ ...cur, messages });
    void send(lastUser.content);
  }, [send, update]);

  const editMessage = useCallback(
    (messageId: string, text: string) => {
      const cur = conversationRef.current;
      if (!cur || streamingRef.current) return;
      const at = cur.messages.findIndex((m) => m.id === messageId);
      if (at < 0) return;
      update({ ...cur, messages: cur.messages.slice(0, at) });
      void send(text);
    },
    [send, update],
  );

  const newConversation = useCallback(
    (kind?: ChatConversation['kind']) => {
      if (streamingRef.current) return;
      update(createConversation(kind));
    },
    [update],
  );

  const newConversationInProject = useCallback(
    (projectId: string) => {
      if (streamingRef.current) return;
      update(createConversation(undefined, projectId));
    },
    [update],
  );

  const applyContext = useCallback(
    (projectId: string | null, forPrompt: boolean) => {
      if (streamingRef.current) return;
      const cur = conversationRef.current;
      if (!cur || cur.messages.length > 0) {
        if ((cur?.projectId ?? null) !== projectId || !cur) {
          update(createConversation(undefined, projectId ?? undefined));
        }
        return;
      }
      const next: ChatConversation = { ...cur };
      delete next.projectId;
      if (projectId) {
        next.projectId = projectId;
        delete next.kind;
      } else if (forPrompt) {
        next.kind = 'execution';
      }
      update(next);
    },
    [update],
  );

  const selectConversation = useCallback(
    (id: string) => {
      if (streamingRef.current) return;
      if (conversationRef.current?.id === id) return;
      const loaded = loadConversation(userId, id);
      if (!loaded) {
        notify.error('Deze chat kon niet worden geladen.');
        refreshIndex();
        return;
      }
      update(loaded);
    },
    [userId, update, refreshIndex],
  );

  const removeConversation = useCallback(
    (id: string) => {
      if (streamingRef.current) return;
      deleteConversation(userId, id);
      refreshIndex();
      if (conversationRef.current?.id === id) update(createConversation());
      notify.success('Chat verwijderd van dit apparaat.');
    },
    [userId, update, refreshIndex],
  );

  const removeAllConversations = useCallback(() => {
    if (streamingRef.current) return;
    deleteAllConversations(userId);
    refreshIndex();
    update(createConversation());
    notify.success('Alle chats verwijderd van dit apparaat.');
  }, [userId, update, refreshIndex]);

  const exportHistory = useCallback(() => {
    const backup = buildChatBackup(userId);
    if (backup.conversations.length === 0) {
      notify.error('Er zijn nog geen chats om te bewaren.');
      return;
    }
    downloadText(
      `promptplein-chats-${backup.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    );
    notify.success(
      backup.conversations.length === 1
        ? '1 chat bewaard als bestand op dit apparaat.'
        : `${backup.conversations.length} chats bewaard als bestand op dit apparaat.`,
    );
  }, [userId]);

  const exportConversation = useCallback(
    (id: string) => {
      const conv =
        conversationRef.current?.id === id ? conversationRef.current : loadConversation(userId, id);
      if (!conv || conv.messages.length === 0) {
        notify.error('Deze chat is leeg of kon niet worden geladen.');
        return;
      }
      const slug =
        conv.title
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'chat';
      downloadText(`${slug}.md`, conversationToMarkdown(conv), 'text/markdown');
    },
    [userId],
  );

  const importHistory = useCallback(
    async (file: File) => {
      if (streamingRef.current) return;
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        notify.error('Dit bestand kon niet worden gelezen. Kies een bestand dat je eerder hebt bewaard.');
        return;
      }
      try {
        const { restored, unchanged, dropped } = restoreChatBackup(userId, data);
        refreshIndex();
        // Stond het open gesprek in het bestand in een nieuwere versie, toon
        // die dan; anders schrijft de oude versie hem bij de volgende beurt over.
        const cur = conversationRef.current;
        const fresh = cur ? loadConversation(userId, cur.id) : null;
        if (cur && fresh && fresh.updatedAt > cur.updatedAt) update(fresh);
        const parts = [
          restored === 1 ? '1 chat teruggezet' : `${restored} chats teruggezet`,
          unchanged > 0 ? `${unchanged} stond${unchanged === 1 ? '' : 'en'} er al` : '',
          dropped > 0 ? `${dropped} niet bewaard (opslag vol of meer dan ${MAX_CONVERSATIONS} chats)` : '',
        ].filter(Boolean);
        notify.success(`${parts.join(', ')}.`);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Terugzetten is niet gelukt.');
      }
    },
    [userId, refreshIndex, update],
  );

  const addAttachment = useCallback(
    async (file: File) => {
      const cur = conversationRef.current;
      if (!cur || extracting) return;
      if (cur.attachments.length >= MAX_CHAT_ATTACHMENTS) {
        notify.error(`Maximaal ${MAX_CHAT_ATTACHMENTS} bijlagen per chat.`);
        return;
      }
      setExtracting(true);
      try {
        // Dynamische import: pdfjs/mammoth blijven buiten de startbundel.
        const { extractDocument } = await import('@/lib/extractDocument');
        const doc = await extractDocument(file, MAX_CHAT_ATTACHMENT_BYTES);
        const truncated = doc.text.length > MAX_CHAT_ATTACHMENT_CHARS;
        const text = truncated ? doc.text.slice(0, MAX_CHAT_ATTACHMENT_CHARS) : doc.text;
        const attachment: ChatAttachment = {
          id: uuid(),
          name: doc.name,
          chars: text.length,
          text,
          truncated,
        };
        const next = {
          ...cur,
          attachments: [...cur.attachments, attachment],
          updatedAt: new Date().toISOString(),
        };
        update(next);
        persistNow(next);
        if (truncated) {
          notify(
            `"${doc.name}" is ingekort tot ${MAX_CHAT_ATTACHMENT_CHARS.toLocaleString('nl-NL')} tekens.`,
            { icon: '✂️' },
          );
        } else {
          notify.success(`"${doc.name}" toegevoegd (${text.length.toLocaleString('nl-NL')} tekens).`);
        }
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Het bestand kon niet worden gelezen.');
      } finally {
        setExtracting(false);
      }
    },
    [extracting, update, persistNow],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      const cur = conversationRef.current;
      if (!cur) return;
      const next = {
        ...cur,
        attachments: cur.attachments.filter((a) => a.id !== id),
        updatedAt: new Date().toISOString(),
      };
      update(next);
      persistNow(next);
    },
    [update, persistNow],
  );

  return {
    memoryNotice,
    dismissMemoryNotice,
    conversation,
    index,
    streaming,
    phase,
    extracting,
    send,
    sendInNewConversation,
    stop,
    retry,
    addRoutekaart,
    continueLast,
    editMessage,
    newConversation,
    newConversationInProject,
    applyContext,
    selectConversation,
    removeConversation,
    removeAllConversations,
    exportHistory,
    exportConversation,
    importHistory,
    addAttachment,
    removeAttachment,
  };
}
