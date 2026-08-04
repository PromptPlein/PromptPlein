// Orkestratie van de chatpagina: gespreksstate, verzenden/streamen/stoppen,
// bijlagen en gesprek-CRUD. Bewust een hook (geen component) zodat een latere
// ingebedde chat in de generator (Fase 3) dezelfde logica kan hergebruiken.

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { v4 as uuid } from 'uuid';
import { useAuth } from '@/context/AuthContext';
import { defaultModelFor } from '@/config/aiModels';
import {
  createConversation,
  deleteAllConversations,
  deleteConversation,
  loadChatIndex,
  loadConversation,
  saveConversation,
  titleFromFirstMessage,
} from '@/lib/chatStorage';
import { sendChatMessage } from '@/services/chatService';
import type { ChatSettings } from '@/services/settingsService';
import type {
  AiProviderResult,
  ChatAttachment,
  ChatConversation,
  ChatIndexEntry,
  ChatMessage,
} from '@/types';

/** Maximum aantal bijlagen per gesprek (zelfde grens als server-side). */
export const MAX_CHAT_ATTACHMENTS = 3;
/** Maximale tekstomvang per bijlage (zelfde grens als server-side). */
export const MAX_CHAT_ATTACHMENT_CHARS = 50_000;

export interface ChatController {
  conversation: ChatConversation | null;
  index: ChatIndexEntry[];
  streaming: boolean;
  extracting: boolean;
  send: (text: string) => Promise<void>;
  /** Start een vers gesprek en verstuur `text` daarin (generator-handoff). */
  sendInNewConversation: (text: string) => void;
  stop: () => void;
  /** Probeer het laatste, mislukte antwoord opnieuw. */
  retry: () => void;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  removeAllConversations: () => void;
  addAttachment: (file: File) => Promise<void>;
  removeAttachment: (id: string) => void;
}

export default function useChatController(settings: ChatSettings | null): ChatController {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [index, setIndex] = useState<ChatIndexEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
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
    setIndex(userId ? loadChatIndex(userId) : []);
  }, [userId]);

  /** Direct (niet-debounced) opslaan; waarschuwt eenmalig bij een volle opslag. */
  const persistNow = useCallback(
    (conv: ChatConversation) => {
      if (!userId || conv.messages.length === 0) return;
      const ok = saveConversation(userId, conv);
      if (!ok && !quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        toast.error(
          'Opslaan op dit apparaat lukt niet — dit gesprek gaat verloren zodra je de pagina verlaat.',
        );
      }
      refreshIndex();
    },
    [userId, refreshIndex],
  );

  // Init per account: recentste gesprek hervatten, anders een vers gesprek.
  // Valt de gebruiker weg (uitloggen), breek dan de lopende stream af en wis
  // de in-memory state — de opslag zelf is al gewist door wipeAllChatStorage.
  useEffect(() => {
    if (!userId) {
      abortRef.current?.abort();
      update(null);
      setIndex([]);
      return;
    }
    const entries = loadChatIndex(userId);
    setIndex(entries);
    const recent = entries[0] ? loadConversation(userId, entries[0].id) : null;
    update(recent ?? createConversation());
  }, [userId, update]);

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

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || streamingRef.current || !settings || !userId) return;

      const base = conversationRef.current ?? createConversation();
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
      streamingRef.current = true;
      setStreaming(true);

      // De vraag meteen bewaren (zonder de nog lege assistant-placeholder),
      // zodat een refresh midden in de stream het gesprek niet kwijtraakt.
      persistNow({ ...updated, messages: [...base.messages, userMsg] });

      // Geschiedenis voor het model: eerdere beurten zonder mislukte antwoorden.
      const history = updated.messages
        .filter((m) => m.id !== assistantMsg.id && !m.error && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

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
          cur && cur.id === updated.id
            ? {
                ...cur,
                messages: cur.messages.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: value } : m,
                ),
              }
            : cur,
        );
      };

      const res = await sendChatMessage({
        messages: history,
        attachments: updated.attachments.map((a) => ({ name: a.name, text: a.text })),
        settings,
        onChunk: (textSoFar) => {
          pendingText = textSoFar;
          if (!rafId) rafId = requestAnimationFrame(flushPending);
        },
        signal: controller.signal,
      });

      if (rafId) cancelAnimationFrame(rafId);
      abortRef.current = null;

      // Eindstand samenstellen op basis van het (leidende) service-resultaat.
      const provider = res.provider as AiProviderResult | undefined;
      const model = modelForProvider(res.provider);
      const cur = conversationRef.current;
      if (cur && cur.id === updated.id) {
        const messages = cur.messages.map((m) => {
          if (m.id !== assistantMsg.id) return m;
          if (res.aborted) return { ...m, content: res.text, provider, model, stopped: true };
          if (res.error) return { ...m, content: res.text, provider, model, error: res.error };
          return { ...m, content: res.text, provider, model };
        });
        const next = { ...cur, messages, updatedAt: new Date().toISOString() };
        update(next);
        persistNow(next);
      }

      streamingRef.current = false;
      setStreaming(false);
    },
    [settings, userId, update, persistNow, modelForProvider],
  );

  const sendInNewConversation = useCallback(
    (text: string) => {
      if (streamingRef.current) return;
      update(createConversation());
      void send(text);
    },
    [send, update],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    const cur = conversationRef.current;
    if (!cur || streamingRef.current) return;
    const messages = [...cur.messages];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.error) return;
    messages.pop();
    const lastUser = messages[messages.length - 1];
    if (!lastUser || lastUser.role !== 'user') return;
    messages.pop();
    update({ ...cur, messages });
    void send(lastUser.content);
  }, [send, update]);

  const newConversation = useCallback(() => {
    if (streamingRef.current) return;
    update(createConversation());
  }, [update]);

  const selectConversation = useCallback(
    (id: string) => {
      if (streamingRef.current || !userId) return;
      if (conversationRef.current?.id === id) return;
      const loaded = loadConversation(userId, id);
      if (!loaded) {
        toast.error('Dit gesprek kon niet worden geladen.');
        refreshIndex();
        return;
      }
      update(loaded);
    },
    [userId, update, refreshIndex],
  );

  const removeConversation = useCallback(
    (id: string) => {
      if (streamingRef.current || !userId) return;
      deleteConversation(userId, id);
      refreshIndex();
      if (conversationRef.current?.id === id) update(createConversation());
      toast.success('Gesprek verwijderd van dit apparaat.');
    },
    [userId, update, refreshIndex],
  );

  const removeAllConversations = useCallback(() => {
    if (streamingRef.current || !userId) return;
    deleteAllConversations(userId);
    refreshIndex();
    update(createConversation());
    toast.success('Alle gesprekken verwijderd van dit apparaat.');
  }, [userId, update, refreshIndex]);

  const addAttachment = useCallback(
    async (file: File) => {
      const cur = conversationRef.current;
      if (!cur || extracting) return;
      if (cur.attachments.length >= MAX_CHAT_ATTACHMENTS) {
        toast.error(`Maximaal ${MAX_CHAT_ATTACHMENTS} bijlagen per gesprek.`);
        return;
      }
      setExtracting(true);
      try {
        // Dynamische import: pdfjs/mammoth blijven buiten de startbundel.
        const { extractDocument } = await import('@/lib/extractDocument');
        const doc = await extractDocument(file);
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
          toast(
            `"${doc.name}" is ingekort tot ${MAX_CHAT_ATTACHMENT_CHARS.toLocaleString('nl-NL')} tekens.`,
            { icon: '✂️' },
          );
        } else {
          toast.success(`"${doc.name}" toegevoegd (${text.length.toLocaleString('nl-NL')} tekens).`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Het bestand kon niet worden gelezen.');
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
    conversation,
    index,
    streaming,
    extracting,
    send,
    sendInNewConversation,
    stop,
    retry,
    newConversation,
    selectConversation,
    removeConversation,
    removeAllConversations,
    addAttachment,
    removeAttachment,
  };
}
