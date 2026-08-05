import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, MessageSquare, Play, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatEmptyState from '@/components/chat/ChatEmptyState';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import useChatController from '@/components/chat/useChatController';
import useFitHeight from '@/components/chat/useFitHeight';
import SavePromptModal from '@/components/prompts/SavePromptModal';
import { looksLikeMessyPrompt } from '@/lib/promptHeuristics';
import { consumeHandoff, optimizeChatInput } from '@/services/chatService';
import { writeGeneratorHandoff } from '@/services/handoffService';
import { getChatSettingsCached, type ChatSettings } from '@/services/settingsService';

/** Permanente afmelding voor de bouw-een-prompt-tip (per apparaat). */
const NUDGE_DISMISSED_KEY = 'opl.ui.chatNudgeDismissed';

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
  // Hoogteplafond van de chatkaart: precies wat het venster overlaat.
  const [cardRef, cardMaxHeight] = useFitHeight<HTMLDivElement>();

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
  // sessionStorage — overleeft ook de login-roundtrip van RequireAuth. Een
  // execute-handoff start een UITVOERgesprek: de prompt draait dan onder de
  // neutrale uitvoer-systeemprompt in plaats van de B1-huisregels.
  const { sendInNewConversation } = controller;
  useEffect(() => {
    if (!user || !settings?.enabled || handoffDone.current) return;
    const handoff = consumeHandoff();
    if (handoff) {
      handoffDone.current = true;
      sendInNewConversation(handoff.prompt, handoff.kind === 'execute' ? 'execution' : undefined);
    }
  }, [user, settings, sendInNewConversation]);

  const conversation = controller.conversation;
  const messages = conversation?.messages ?? [];

  // --- Chat → generator: omgekeerde handoff en opslaan als prompt ---
  const navigate = useNavigate();
  const handleImprove = useCallback(
    (text: string) => {
      writeGeneratorHandoff(text);
      navigate('/genereren');
    },
    [navigate],
  );
  // --- Snel verbeteren van de getypte tekst (het oranje sterretje) ---
  // Lichte herschrijving in het invoerveld zelf; de volledige generator zit
  // achter de nudge en "Bouw hier een prompt van". Faalt de aanroep, dan blijft
  // de tekst van de gebruiker staan met een niet-blokkerende melding.
  const handleOptimizeInput = useCallback(
    async (text: string) => {
      if (!settings) return { text, changed: false };
      const res = await optimizeChatInput({ text, settings });
      if (res.error) toast.error(res.error);
      else if (!res.changed) toast('Je tekst was al duidelijk genoeg.', { icon: '✨' });
      return { text: res.text, changed: res.changed, error: res.error };
    },
    [settings],
  );

  // Inhoud die via "Bewaar als prompt" in de modal staat; null = dicht.
  const [saveContent, setSaveContent] = useState<string | null>(null);
  const handleSaveAsPrompt = useCallback((text: string) => setSaveContent(text), []);

  // --- De bouw-een-prompt-tip (nudge) ---
  // Puur lokale heuristiek, hoogstens één keer per gesprek, nooit in een
  // uitvoergesprek, en definitief uit te zetten. Alleen onder het laatste
  // eigen bericht — verschijnt pas als het antwoord binnen is (niet-streamend).
  const [nudgeMessageId, setNudgeMessageId] = useState<string | null>(null);
  const nudgedConvsRef = useRef<Set<string>>(new Set());
  const [nudgeOptOut, setNudgeOptOut] = useState(() => {
    try {
      return localStorage.getItem(NUDGE_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const lastUser = conversation
      ? [...conversation.messages].reverse().find((m) => m.role === 'user')
      : null;
    // Bestaande tip opruimen zodra hij niet meer onder het laatste bericht staat.
    if (nudgeMessageId && (!lastUser || lastUser.id !== nudgeMessageId)) {
      setNudgeMessageId(null);
    }
    if (nudgeOptOut || !conversation || conversation.kind === 'execution') return;
    if (controller.streaming || !lastUser) return;
    if (nudgedConvsRef.current.has(conversation.id)) return;
    if (!looksLikeMessyPrompt(lastUser.content)) return;
    nudgedConvsRef.current.add(conversation.id);
    setNudgeMessageId(lastUser.id);
  }, [conversation, controller.streaming, nudgeOptOut, nudgeMessageId]);

  const dismissNudge = useCallback(() => {
    setNudgeMessageId(null);
    setNudgeOptOut(true);
    try {
      localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    } catch {
      /* opslag niet beschikbaar — dan geldt de afmelding alleen deze sessie */
    }
  }, []);

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
    /* Geen vaste hoogte: de chatkaart groeit mee met het gesprek tot de hoogte
       die het venster toelaat. `items-start` houdt de zijbalk daarbij op zijn
       eigen hoogte in plaats van meegerekt te worden. */
    <div className="mx-auto flex w-full max-w-6xl items-start gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <ChatSidebar
        entries={controller.index}
        activeId={conversation?.id ?? null}
        maxHeight={cardMaxHeight}
        disabled={controller.streaming}
        onSelect={controller.selectConversation}
        onNew={controller.newConversation}
        onRequestDelete={setConfirmDeleteId}
        onRequestDeleteAll={() => setConfirmDeleteAll(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
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

        {/* Het plafond komt uit useFitHeight; de CSS-waarde is het vangnet voor
            de eerste render. Tot dat plafond bepaalt de inhoud de hoogte —
            daarboven scrollt alleen de berichtenlijst. */}
        <div
          ref={cardRef}
          style={cardMaxHeight ? { maxHeight: cardMaxHeight } : undefined}
          className="opl-card flex max-h-[calc(100dvh-13rem)] flex-col overflow-hidden lg:max-h-[calc(100dvh-10.5rem)]"
        >
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6">
            <MessageSquare size={18} className="text-rijksblauw-500" />
            <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {conversation && messages.length > 0 ? conversation.title : 'Chat'}
            </h1>
            {/* Uitvoergesprek: hier draait een gegenereerde prompt (neutrale
                systeemprompt, geen B1-huisregels) — maak dat zichtbaar. */}
            {conversation?.kind === 'execution' && (
              <span
                className="opl-badge inline-flex shrink-0 items-center gap-1 bg-rijksoranje/10 text-rijksoranje"
                title="In dit gesprek wordt een gegenereerde prompt uitgevoerd; de prompt bepaalt zelf taal, toon en opmaak."
              >
                <Play size={11} /> Uitvoering
              </span>
            )}
          </div>

          {messages.length === 0 ? (
            <div className="min-h-0 flex-auto overflow-y-auto">
              <ChatEmptyState onPick={(text) => void controller.send(text)} />
            </div>
          ) : (
            <ChatMessageList
              messages={messages}
              streaming={controller.streaming}
              expectedProvider={settings?.provider ?? 'mistral'}
              onRetry={controller.retry}
              onImprove={handleImprove}
              onSaveAsPrompt={handleSaveAsPrompt}
              nudgeMessageId={nudgeMessageId}
              onNudgeDismiss={dismissNudge}
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
            // Sterretje alleen tonen als de beheerder de functie aan heeft staan.
            onOptimize={settings?.optimizeEnabled ? handleOptimizeInput : undefined}
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
      <SavePromptModal
        open={saveContent !== null}
        content={saveContent ?? ''}
        onClose={() => setSaveContent(null)}
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
