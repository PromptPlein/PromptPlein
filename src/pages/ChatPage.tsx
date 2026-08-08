import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FolderOpen, MessageSquare, Play, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatEmptyState from '@/components/chat/ChatEmptyState';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ProjectSettingsModal from '@/components/chat/ProjectSettingsModal';
import ProjectView from '@/components/chat/ProjectView';
import useChatController from '@/components/chat/useChatController';
import useChatProjects from '@/components/chat/useChatProjects';
import useFitHeight from '@/components/chat/useFitHeight';
import SavePromptModal from '@/components/prompts/SavePromptModal';
import { looksLikeMessyPrompt } from '@/lib/promptHeuristics';
import { consumeHandoff, optimizeChatInput } from '@/services/chatService';
import { writeGeneratorHandoff, writeProjectHandoff } from '@/services/handoffService';
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
  const projects = useChatProjects();
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

  // --- Projecten ---
  // `projectPage` is de projectPAGINA: klik je links op een project, dan kom je
  // daar en niet in een gesprek. Zodra je in dat project een chat opent of start,
  // gaat hij weer op null en neemt het gesprek het scherm over.
  const [projectPage, setProjectPage] = useState<string | null>(null);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<string | null>(null);

  const projectList = projects.projects;
  const openProject = projectList.find((p) => p.id === projectPage) ?? null;
  const settingsProject = projectList.find((p) => p.id === settingsProjectId) ?? null;

  const knownProjectIds = useMemo(() => new Set(projectList.map((p) => p.id)), [projectList]);

  // Losse gesprekken = alles wat NIET onder een bestaand project valt. Ook een
  // gesprek dat naar een verwijderd project verwijst hoort hier: anders zou het
  // nergens meer te zien zijn en zou de gebruiker het stilletjes kwijt zijn.
  // Zolang de projecten nog laden filteren we alleen op de vlag zelf, anders
  // knipperen projectgesprekken heel even in deze lijst.
  const looseEntries = useMemo(
    () =>
      controller.index.filter((entry) =>
        projects.loading
          ? !entry.projectId
          : !entry.projectId || !knownProjectIds.has(entry.projectId),
      ),
    [controller.index, knownProjectIds, projects.loading],
  );

  const projectConversations = useMemo(
    () => (projectPage ? controller.index.filter((entry) => entry.projectId === projectPage) : []),
    [controller.index, projectPage],
  );

  const handleOpenProject = useCallback((id: string) => {
    setProjectPage(id);
  }, []);

  const handleNewProject = useCallback(async () => {
    const created = await projects.create('Nieuw project');
    if (!created) return;
    // Meteen door naar de instellingen: een leeg project zonder instructie is
    // nog niets — de gebruiker wil hier zijn projectinstructie kwijt.
    setProjectPage(created.id);
    setSettingsProjectId(created.id);
  }, [projects]);

  const handleNewChatInProject = useCallback(
    (projectId: string) => {
      setProjectPage(null);
      controller.newConversationInProject(projectId);
    },
    [controller],
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      setProjectPage(null);
      controller.selectConversation(id);
    },
    [controller],
  );

  const handleNewConversation = useCallback(() => {
    setProjectPage(null);
    controller.newConversation();
  }, [controller]);

  const handleDeleteProject = useCallback(async () => {
    if (!confirmDeleteProject) return;
    const ok = await projects.remove(confirmDeleteProject);
    if (!ok) return;
    // De lokale gesprekken van dit project blijven bestaan; ze verhuizen vanzelf
    // naar de losse lijst omdat hun projectId nergens meer op slaat.
    if (projectPage === confirmDeleteProject) setProjectPage(null);
    if (settingsProjectId === confirmDeleteProject) setSettingsProjectId(null);
    toast.success('Project verwijderd.');
  }, [confirmDeleteProject, projects, projectPage, settingsProjectId]);

  const activeProject = conversation?.projectId
    ? (projectList.find((p) => p.id === conversation.projectId) ?? null)
    : null;

  // --- Chat → generator: omgekeerde handoff en opslaan als prompt ---
  const navigate = useNavigate();
  const handleImprove = useCallback(
    (text: string) => {
      writeGeneratorHandoff(text);
      navigate('/genereren');
    },
    [navigate],
  );

  // "Genereer prompt" op de projectpagina: het project reist als ID mee naar de
  // bouwer, die de context zelf ophaalt. De context kan tienduizenden tekens
  // zijn en die horen niet in sessionStorage.
  const handleNewPrompt = useCallback(
    (includeFiles: boolean) => {
      if (!projectPage) return;
      writeProjectHandoff(projectPage, includeFiles);
      navigate('/genereren');
    },
    [projectPage, navigate],
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
    /* Gesprekkenlijst en gesprek zitten in ÉÉN kaart: de lijst is geen los
       zwevend blok naast de chat maar hoort er zichtbaar bij, gescheiden door
       niet meer dan een lijn. Geen vaste hoogte — de kaart groeit mee met het
       gesprek tot de hoogte die het venster toelaat (useFitHeight); daarboven
       scrollt alleen de berichtenlijst. */
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
      <div
        ref={cardRef}
        style={cardMaxHeight ? { maxHeight: cardMaxHeight } : undefined}
        className="opl-card flex max-h-[calc(100dvh-13rem)] overflow-hidden lg:max-h-[calc(100dvh-10.5rem)]"
      >
        <ChatSidebar
          entries={looseEntries}
          totalConversations={controller.index.length}
          projects={projectList}
          activeId={projectPage ? null : (conversation?.id ?? null)}
          openProjectId={projectPage}
          disabled={controller.streaming}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onNewProject={() => void handleNewProject()}
          onOpenProject={handleOpenProject}
          onRequestDelete={setConfirmDeleteId}
          onRequestDeleteAll={() => setConfirmDeleteAll(true)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Mobiel: projectkeuze + gesprekswissel + nieuw/verwijderen boven de
              berichtenlijst. Zonder projecten blijft dit precies zoals het was. */}
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 lg:hidden dark:border-slate-700">
            {projectList.length > 0 && (
              <select
                className="opl-input w-32 shrink-0"
                value={projectPage ?? (conversation?.projectId ?? '')}
                disabled={controller.streaming}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) handleOpenProject(value);
                  else setProjectPage(null);
                }}
                aria-label="Kies een project"
              >
                <option value="">Geen project</option>
                {projectList.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}
            <select
              className="opl-input min-w-0 flex-1"
              value={projectPage ? '' : (conversation?.id ?? '')}
              disabled={controller.streaming}
              onChange={(e) => handleSelectConversation(e.target.value)}
              aria-label="Kies een gesprek"
            >
              {(projectPage || (conversation && !activeInIndex)) && (
                <option value={conversation?.id ?? ''}>Nieuw gesprek</option>
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
              onClick={handleNewConversation}
              disabled={controller.streaming}
              aria-label="Nieuw gesprek"
            >
              <Plus size={16} />
            </button>
            {!projectPage && activeInIndex && conversation && (
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

            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-6">
              {openProject ? (
                <FolderOpen size={18} className="text-rijksblauw-500" />
              ) : (
                <MessageSquare size={18} className="text-rijksblauw-500" />
              )}
              <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {openProject
                  ? openProject.name
                  : conversation && messages.length > 0
                    ? conversation.title
                    : 'Chat'}
              </h1>
              {/* Uitvoergesprek: hier draait een gegenereerde prompt (neutrale
                  systeemprompt, geen B1-huisregels) — maak dat zichtbaar. */}
              {!openProject && conversation?.kind === 'execution' && (
                <span
                  className="opl-badge inline-flex shrink-0 items-center gap-1 bg-rijksoranje/10 text-rijksoranje"
                  title="In dit gesprek wordt een gegenereerde prompt uitgevoerd; de prompt bepaalt zelf taal, toon en opmaak."
                >
                  <Play size={11} /> Uitvoering
                </span>
              )}
              {/* Projectgesprek: de instructie van dit project stuurt het
                  antwoord. Klikbaar, want vanuit een gesprek wil je regelmatig
                  even terug naar de instructie of de bronnen. */}
              {!openProject && activeProject && (
                <button
                  type="button"
                  className="opl-badge inline-flex shrink-0 items-center gap-1 bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200"
                  onClick={() => handleOpenProject(activeProject.id)}
                  title={`Dit gesprek draait onder de instructie van project "${activeProject.name}". Klik om het project te openen.`}
                >
                  <FolderOpen size={11} /> {activeProject.name}
                </button>
              )}
            </div>

            {openProject ? (
              <ProjectView
                project={openProject}
                conversations={projectConversations}
                disabled={controller.streaming}
                onNewChat={() => handleNewChatInProject(openProject.id)}
                onNewPrompt={handleNewPrompt}
                onOpenSettings={() => setSettingsProjectId(openProject.id)}
                onSelectConversation={handleSelectConversation}
                onRequestDeleteConversation={setConfirmDeleteId}
                onRequestDeleteProject={() => setConfirmDeleteProject(openProject.id)}
              />
            ) : (
              <>
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
                  projects={projectList}
                  activeProjectId={conversation?.projectId ?? null}
                  onPickProject={controller.attachProject}
                  // Alleen in een nog leeg gesprek: zie ChatController.attachProject.
                  canPickProject={messages.length === 0 && conversation?.kind !== 'execution'}
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
              </>
            )}
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
      <ProjectSettingsModal
        open={settingsProject !== null}
        project={settingsProject}
        onClose={() => setSettingsProjectId(null)}
        onSave={(patch) =>
          settingsProject ? projects.update(settingsProject.id, patch) : Promise.resolve(false)
        }
        onFilesChanged={projects.refresh}
        chatSettings={settings}
      />
      <ConfirmDialog
        open={confirmDeleteProject !== null}
        title="Project verwijderen?"
        message="De instructie en de bronbestanden van dit project worden definitief verwijderd. De gesprekken blijven op dit apparaat staan en gaan verder als gewone gesprekken."
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => void handleDeleteProject()}
        onClose={() => setConfirmDeleteProject(null)}
      />
    </div>
  );
}
