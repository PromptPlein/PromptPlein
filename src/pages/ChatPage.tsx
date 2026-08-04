import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatEmptyState from '@/components/chat/ChatEmptyState';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import useChatController from '@/components/chat/useChatController';
import { consumeHandoff } from '@/services/chatService';
import { getChatSettingsCached, type ChatSettings } from '@/services/settingsService';

/**
 * /chat — rechtstreeks gesprek met het door de admin gekozen model (basis:
 * Mistral). Alleen voor ingelogde gebruikers (route staat in de
 * RequireAuth-groep); gesprekken staan uitsluitend in localStorage.
 */
export default function ChatPage() {
  const { configured, user } = useAuth();
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const controller = useChatController(settings);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const handoffDone = useRef(false);

  useEffect(() => {
    let active = true;
    void getChatSettingsCached().then((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);

  // Handoff vanuit de generator ("Uitvoeren in chat"): prompt klaargezet in
  // sessionStorage — overleeft ook de login-roundtrip van RequireAuth.
  const { sendInNewConversation } = controller;
  useEffect(() => {
    if (!user || !settings?.enabled || handoffDone.current) return;
    const prompt = consumeHandoff();
    if (prompt) {
      handoffDone.current = true;
      sendInNewConversation(prompt);
    }
  }, [user, settings, sendInNewConversation]);

  const conversation = controller.conversation;
  const messages = conversation?.messages ?? [];

  // De provider van het laatste AI-antwoord: wijkt die af van de instelling
  // (fallback), dan laat de badge dat zien.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.provider);
  const composerDisabled = !configured || !settings || settings.enabled === false;

  // Chat uitgezet door de beheerder of geen backend: nette melding.
  if (!configured || (settings && !settings.enabled)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="opl-card flex items-start gap-3 border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <h1 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              De chat is niet beschikbaar
            </h1>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              {!configured
                ? 'Er is geen AI-service geconfigureerd in deze omgeving.'
                : 'De beheerder heeft de chat tijdelijk uitgeschakeld.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeInIndex = conversation
    ? controller.index.some((e) => e.id === conversation.id)
    : false;

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.75rem)] w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 lg:h-[calc(100dvh-4.5rem)] lg:px-8">
      <ChatSidebar
        entries={controller.index}
        activeId={conversation?.id ?? null}
        disabled={controller.streaming}
        onSelect={controller.selectConversation}
        onNew={controller.newConversation}
        onRequestDelete={setConfirmDeleteId}
        onRequestDeleteAll={() => setConfirmDeleteAll(true)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Mobiel: gesprekswissel + nieuw/verwijderen boven de berichtenlijst. */}
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <select
            className="opl-input flex-1"
            value={conversation?.id ?? ''}
            disabled={controller.streaming}
            onChange={(e) => controller.selectConversation(e.target.value)}
            aria-label="Kies een gesprek"
          >
            {conversation && !activeInIndex && (
              <option value={conversation.id}>Nieuw gesprek</option>
            )}
            {controller.index.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="opl-btn-secondary shrink-0 !px-2.5"
            onClick={controller.newConversation}
            disabled={controller.streaming}
            aria-label="Nieuw gesprek"
          >
            <Plus size={16} />
          </button>
          {activeInIndex && conversation && (
            <button
              type="button"
              className="opl-btn-secondary shrink-0 !px-2.5 text-rijksrood dark:text-red-400"
              onClick={() => setConfirmDeleteId(conversation.id)}
              disabled={controller.streaming}
              aria-label="Verwijder dit gesprek"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="opl-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6">
            <MessageSquare size={18} className="text-rijksblauw-500" />
            <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {conversation && messages.length > 0 ? conversation.title : 'Chat'}
            </h1>
          </div>

          {messages.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ChatEmptyState onPick={(text) => void controller.send(text)} />
            </div>
          ) : (
            <ChatMessageList
              messages={messages}
              streaming={controller.streaming}
              expectedProvider={settings?.provider ?? 'mistral'}
              onRetry={controller.retry}
            />
          )}

          <ChatComposer
            disabled={composerDisabled}
            streaming={controller.streaming}
            extracting={controller.extracting}
            attachments={conversation?.attachments ?? []}
            onSend={(text) => void controller.send(text)}
            onStop={controller.stop}
            onAddFile={(file) => void controller.addAttachment(file)}
            onRemoveAttachment={controller.removeAttachment}
            badge={
              settings ? (
                <ChatModelBadge
                  provider={settings.provider}
                  model={settings.model}
                  actualProvider={lastAssistant?.provider}
                />
              ) : undefined
            }
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Gesprek verwijderen?"
        message="Dit verwijdert het gesprek definitief van dit apparaat, inclusief bijlagen. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => {
          if (confirmDeleteId) controller.removeConversation(confirmDeleteId);
        }}
        onClose={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmDeleteAll}
        title="Alle gesprekken verwijderen?"
        message="Dit verwijdert al je chatgesprekken definitief van dit apparaat, inclusief bijlagen. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Alles verwijderen"
        destructive
        onConfirm={controller.removeAllConversations}
        onClose={() => setConfirmDeleteAll(false)}
      />
    </div>
  );
}
