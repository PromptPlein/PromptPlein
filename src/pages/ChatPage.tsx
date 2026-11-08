import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FolderOpen,
  LogIn,
  Menu,
  MessageSquare,
  Play,
  Plus,
  ShieldCheck,
  Upload,
} from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { AuthLoading } from '@/components/auth/RequireAuth';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Drawer from '@/components/common/Drawer';
import ChatComposer, { type ChatComposerHandle } from '@/components/chat/ChatComposer';
import ChatEmptyState from '@/components/chat/ChatEmptyState';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatContextWizard, { type ContextPrompt } from '@/components/chat/ChatContextWizard';
import ProjectPromptWizard from '@/components/chat/ProjectPromptWizard';
import ProjectSettingsModal from '@/components/chat/ProjectSettingsModal';
import ProjectView from '@/components/chat/ProjectView';
import useChatController from '@/components/chat/useChatController';
import MemoryNoticeBar from '@/components/chat/MemoryNoticeBar';
import useThinking from '@/lib/useThinking';
import useWebSearch from '@/lib/useWebSearch';
import useChatProjects from '@/components/chat/useChatProjects';
import useFitHeight from '@/components/chat/useFitHeight';
import SavePromptModal from '@/components/prompts/SavePromptModal';
import { looksLikeMessyPrompt } from '@/lib/promptHeuristics';
import { consumeHandoff, optimizeChatInput } from '@/services/chatService';
import {
  consumeNewProjectHandoff,
  writeGeneratorHandoff,
  writeProjectHandoff,
} from '@/services/handoffService';
import {
  getAiSettings,
  getChatSettingsCached,
  type AiSettings,
  type ChatSettings,
} from '@/services/settingsService';
import { detectPii, type GuardrailFinding } from '@/services/guardrails';
import GuardrailDialog from '@/components/optimizer/GuardrailDialog';
import { thinkingUnavailableReason } from '@/config/aiModels';

/** Staat in de kaart, zodat hij altijd bij het typen in beeld is. */
const PII_NOTICE = 'Verwerk geen persoonsgegevens.';

/** Permanente afmelding voor de bouw-een-prompt-tip (per apparaat). */
const NUDGE_DISMISSED_KEY = 'opl.ui.chatNudgeDismissed';

/**
 * /chat: rechtstreeks gesprek met het door de admin gekozen model (basis:
 * Mistral). Open voor iedereen, ook zonder account; gesprekken staan
 * uitsluitend in localStorage (ingelogd per account, anders in de gastbak).
 * Projecten vragen wél een account, want die staan in de database.
 */
export default function ChatPage() {
  // Eerst weten of er een sessie is: anders start de controller in de gastbak
  // en springt hij een tel later naar het account.
  const { loading } = useAuth();
  if (loading) return <AuthLoading />;
  return <ChatPageInner />;
}

function ChatPageInner() {
  const { configured, user } = useAuth();
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  // Denkstand: de knop in de invoerbalk zet hem, de controller stuurt hem mee.
  const [thinking, setThinking] = useThinking();
  const [webSearch, setWebSearch] = useWebSearch();
  // De stand van de knop telt alleen als de beheerder zoeken aan heeft staan.
  // Zet hij het uit terwijl iemand de knop nog aan had, dan zoekt die beurt niet
  // alsnog stiekem mee.
  const webSearchOn = webSearch && settings?.webSearchEnabled === true;
  // Denken kan alleen met een model dat het aankan. Heeft de beheerder een ander
  // model gekozen, dan gaat de stand van de knop niet mee: de server zou hem
  // toch negeren, en zo klopt wat de gebruiker ziet met wat er gebeurt.
  const thinkingUnavailable = settings
    ? thinkingUnavailableReason(settings.provider, settings.model)
    : undefined;
  const thinkingOn = thinking && !thinkingUnavailable;
  const controller = useChatController(settings, { thinking: thinkingOn, webSearch: webSearchOn });
  const projects = useChatProjects();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  // De lijst met chats en projecten op schermen zonder zijbalk.
  const [listOpen, setListOpen] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const handoffDone = useRef(false);
  // Hoogteplafond van de chatkaart: precies wat het venster overlaat.
  const [cardRef, cardMaxHeight] = useFitHeight<HTMLDivElement>();
  // Greep op de invoerbalk, zodat een startsjabloon zijn tekst in het veld kan
  // zetten in plaats van hem meteen te versturen.
  const composerRef = useRef<ChatComposerHandle>(null);

  useEffect(() => {
    let active = true;
    void getChatSettingsCached().then((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);

  // Handoff vanuit de generator ("Kopiëren in chat"): prompt klaargezet in
  // sessionStorage, zodat hij niet naar andere tabs lekt. Een
  // compose-handoff verstuurt niets: de prompt komt in het invoerveld te staan,
  // zodat de gebruiker hem eerst kan aanvullen. Het gesprek is wel meteen een
  // UITVOERgesprek, dus bij versturen draait hij onder de neutrale
  // uitvoer-systeemprompt in plaats van de B1-huisregels.
  const { sendInNewConversation, newConversation } = controller;
  useEffect(() => {
    if (!settings?.enabled || handoffDone.current) return;
    const handoff = consumeHandoff();
    if (!handoff) return;
    handoffDone.current = true;
    if (handoff.kind === 'compose') {
      newConversation('execution');
      composerRef.current?.fill(handoff.prompt);
      return;
    }
    sendInNewConversation(handoff.prompt, handoff.kind === 'execute' ? 'execution' : undefined);
  }, [settings, sendInNewConversation, newConversation]);

  const conversation = controller.conversation;
  const messages = conversation?.messages ?? [];

  // Elke nieuwe chat, en elke andere chat die je opent, begint zonder denken en
  // zoeken: de gebruiker zet ze zelf aan voor dit gesprek.
  const conversationId = conversation?.id;
  useEffect(() => {
    setThinking(false);
    setWebSearch(false);
  }, [conversationId, setThinking, setWebSearch]);

  // --- Privacycheck vóór versturen ---
  // Dezelfde check op persoonsgegevens als in de bouwer, met de instelling uit
  // Beheer. Een bijlage wordt één keer gecontroleerd, bij het eerste bericht
  // nadat hij is toegevoegd; daarna gaat hij elke beurt mee zonder nieuwe
  // vraag. De verboden onderwerpen van de bouwer gelden hier bewust niet: in
  // een gesprek over beleid vallen die woorden te vaak terecht.
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  useEffect(() => {
    let active = true;
    void getAiSettings().then((s) => {
      if (active) setAiSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);
  const checkedAttachments = useRef(new Set<string>());
  const [pendingSend, setPendingSend] = useState<{
    text: string;
    findings: GuardrailFinding[];
    attachmentIds: string[];
    replaceId?: string;
  } | null>(null);

  /** Met `replaceId` vervangt de tekst dat eigen bericht in plaats van erachter te komen. */
  function guardedSend(text: string, replaceId?: string) {
    const fresh = (conversation?.attachments ?? []).filter(
      (a) => !checkedAttachments.current.has(a.id),
    );
    const findings = aiSettings?.pii.enabled
      ? detectPii([text, ...fresh.map((a) => a.text)].join('\n'))
      : [];
    if (findings.length > 0) {
      setPendingSend({ text, findings, attachmentIds: fresh.map((a) => a.id), replaceId });
      return;
    }
    fresh.forEach((a) => checkedAttachments.current.add(a.id));
    if (replaceId) controller.editMessage(replaceId, text);
    else void controller.send(text);
  }

  // --- Projecten ---
  // `projectPage` is de projectPAGINA: klik je links op een project, dan kom je
  // daar en niet in een gesprek. Zodra je in dat project een chat opent of start,
  // gaat hij weer op null en neemt het gesprek het scherm over.
  const [projectPage, setProjectPage] = useState<string | null>(null);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ projectId: string; isNew: boolean } | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<string | null>(null);

  const projectList = projects.projects;
  const openProject = projectList.find((p) => p.id === projectPage) ?? null;
  const settingsProject = projectList.find((p) => p.id === settingsProjectId) ?? null;
  const wizardProject = projectList.find((p) => p.id === wizard?.projectId) ?? null;

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

  // Chatten kan zonder account; alleen een project vraagt er een, want dat
  // staat in de database. De projectknop blijft staan en stuurt naar het
  // inlogscherm, met /chat als terugkeeradres.
  const navigate = useNavigate();
  const requireLogin = useCallback(
    (reason: string) => {
      toast(reason);
      navigate('/auth/login', { state: { from: '/chat' } });
    },
    [navigate],
  );

  const handleOpenProject = useCallback((id: string) => {
    setProjectPage(id);
  }, []);

  // Een zojuist aangemaakt project dat nog nooit is opgeslagen: bestaat al in de
  // database (de instellingen hebben een id nodig voor bestanden), maar is voor
  // de gebruiker nog een leeg formulier. Annuleert hij, dan hoort het weer weg —
  // anders vult de zijbalk zich met regels "Nieuw project" die niets bevatten.
  // Een ref en geen state: opslaan en sluiten gebeuren in dezelfde tick, en dan
  // is een state-waarde in de sluitfunctie nog de oude.
  const draftProjectRef = useRef<string | null>(null);

  const handleNewProject = useCallback(async () => {
    if (!user) {
      requireLogin('Log in om een project te maken.');
      return;
    }
    const created = await projects.create('Nieuw project');
    if (!created) return;
    // Meteen de keuze: een leeg project zonder instructie is nog niets, dus de
    // gebruiker laat er een maken of stelt het zelf in.
    draftProjectRef.current = created.id;
    setProjectPage(created.id);
    setWizard({ projectId: created.id, isNew: true });
  }, [user, requireLogin, projects]);

  // Handoff vanuit de bouwer ("Nieuw project" bij de context): daar staat de
  // knop, hier woont de handeling. De gebruiker landt dus niet op een chatpagina
  // waar hij opnieuw moet zoeken, maar in het formulier waar hij voor kwam.
  const newProjectDone = useRef(false);
  useEffect(() => {
    if (!user || newProjectDone.current) return;
    newProjectDone.current = true;
    if (!consumeNewProjectHandoff()) return;
    void handleNewProject();
  }, [user, handleNewProject]);

  /** Opslaan gelukt = het is een echt project geworden; niet meer opruimen. */
  const handleSaveProject = useCallback(
    async (patch: { name: string; instructions: string }) => {
      if (!settingsProjectId) return false;
      const ok = await projects.update(settingsProjectId, patch);
      if (ok) draftProjectRef.current = null;
      return ok;
    },
    [settingsProjectId, projects],
  );

  // Alleen een nooit opgeslagen, nog helemaal leeg project wordt opgeruimd; alles
  // wat de gebruiker erin heeft gezet, haalt de ref al weg.
  const discardDraftProject = useCallback(
    (id: string | null) => {
      if (!id || draftProjectRef.current !== id) return;
      draftProjectRef.current = null;
      setProjectPage((cur) => (cur === id ? null : cur));
      void projects.remove(id);
    },
    [projects],
  );

  const [composerEnlarged, setComposerEnlarged] = useState(false);

  // Het contextvenster: `goal` is wat er al in het tekstvak stond.
  const [contextWizard, setContextWizard] = useState<{
    startAt: 'context' | 'taak';
    goal: string;
  } | null>(null);

  const handleOpenContext = useCallback((startAt: 'context' | 'taak') => {
    setContextWizard({ startAt, goal: composerRef.current?.getText().trim() ?? '' });
  }, []);

  const handleApplyContext = useCallback(
    (projectId: string | null) => {
      setContextWizard(null);
      controller.applyContext(projectId, false);
      composerRef.current?.focus();
    },
    [controller],
  );

  const handleContextPrompt = useCallback(
    ({ draft, projectId }: ContextPrompt) => {
      setContextWizard(null);
      controller.applyContext(projectId, true);
      composerRef.current?.fillPrompt(draft.prompt, {
        framework: draft.framework?.name,
        reden: draft.reden,
      });
    },
    [controller],
  );

  const handleSaveWizard = useCallback(
    async (patch: { name: string; instructions: string }) => {
      if (!wizard) return false;
      const ok = await projects.update(wizard.projectId, patch);
      if (!ok) return false;
      draftProjectRef.current = null;
      setWizard(null);
      toast.success('Je prompt staat in het project.');
      return true;
    },
    [wizard, projects],
  );

  const handleCloseWizard = useCallback(() => {
    const id = wizard?.projectId ?? null;
    setWizard(null);
    discardDraftProject(id);
  }, [wizard, discardDraftProject]);

  const handleCloseSettings = useCallback(() => {
    const id = settingsProjectId;
    setSettingsProjectId(null);
    discardDraftProject(id);
  }, [settingsProjectId, discardDraftProject]);

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
    // Stond je al in een lege chat, dan verandert er verder niets en doet het
    // effect bij composerDisabled niets.
    composerRef.current?.focus();
  }, [controller]);

  const handleDeleteProject = useCallback(async () => {
    if (!confirmDeleteProject) return;
    const ok = await projects.remove(confirmDeleteProject);
    if (!ok) return;
    // De lokale gesprekken van dit project blijven bestaan; ze verhuizen vanzelf
    // naar de losse lijst omdat hun projectId nergens meer op slaat.
    if (projectPage === confirmDeleteProject) setProjectPage(null);
    if (settingsProjectId === confirmDeleteProject) setSettingsProjectId(null);
    if (draftProjectRef.current === confirmDeleteProject) draftProjectRef.current = null;
    toast.success('Project verwijderd.');
  }, [confirmDeleteProject, projects, projectPage, settingsProjectId]);

  const activeProject = conversation?.projectId
    ? (projectList.find((p) => p.id === conversation.projectId) ?? null)
    : null;

  // --- Chat → generator: omgekeerde handoff en opslaan als prompt ---
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

  // Een projectchat staat in deze browser, maar de projectinstructie en de
  // bronbestanden staan in de database en zijn alleen voor de ingelogde
  // eigenaar te lezen. Uitgelogd zou zo'n gesprek stil verdergaan als gewone
  // chat; daarom blijft het leesbaar, maar verder chatten vraagt inloggen.
  const projectNeedsLogin = !user && Boolean(conversation?.projectId);

  // Vast, zodat de berichtrijen (gememoïseerd) niet bij elk streamfragment
  // opnieuw tekenen.
  const sendMessage = controller.send;
  const handleRepair = useCallback(
    (text: string) => {
      if (projectNeedsLogin) requireLogin('Log in om verder te gaan in deze projectchat.');
      else void sendMessage(text);
    },
    [projectNeedsLogin, requireLogin, sendMessage],
  );

  const composerDisabled =
    !configured || !settings || settings.enabled === false || projectNeedsLogin;

  // In een lege chat is typen het enige wat er te doen is: de cursor staat dan
  // meteen in het tekstvak, ook voor wie met het toetsenbord werkt. Dat wacht tot
  // het vak aan staat, en een open venster houdt de focus zelf.
  const emptyChatReady = messages.length === 0 && !openProject && !composerDisabled;
  useEffect(() => {
    if (!emptyChatReady) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    // Op een aanraakscherm zou dit meteen het toetsenbord over de pagina leggen,
    // nog voor je iets gelezen hebt, en de schermlezer van zijn plek halen.
    if (window.matchMedia('(pointer: coarse)').matches) return;
    composerRef.current?.focus();
  }, [emptyChatReady, conversationId]);

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

  /* Waar blijven je chats? De scheiding tussen projecten (database) en chats (dit
     apparaat) is de belangrijkste privacy-afspraak van deze pagina. Eén korte
     belofte in beeld, de rest achter het infobolletje; ernaast de twee knoppen
     waarmee je je chats als bestand meeneemt. Het bestand gaat nergens heen:
     opbouwen en inlezen gebeurt in de browser. */
  const storagePromise = (
    <>
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-3 pr-1 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <ShieldCheck size={15} className="shrink-0 text-rijksblauw-700 dark:text-rijksblauw-200" />
        Chats blijven in deze browser
        <InfoDot
          label="Uitleg over waar chats en projecten staan"
          text={
            'Chats staan alleen in deze browser, ook zonder account en na uitloggen. Wis je de browsergegevens of wissel je van pc, dan zie je ze daar niet.\nProjecten staan bij je account in de database.\nMet Bewaren en Terugzetten neem je je chats mee als bestand.'
          }
        />
      </span>
      <button
        type="button"
        className="opl-btn-ghost !px-2.5 !py-1.5"
        onClick={controller.exportHistory}
        disabled={controller.streaming || controller.index.length === 0}
        title="Download al je chats als één bestand op dit apparaat"
      >
        <Download size={15} /> Bewaren
      </button>
      <button
        type="button"
        className="opl-btn-ghost !px-2.5 !py-1.5"
        onClick={() => restoreInputRef.current?.click()}
        disabled={controller.streaming}
        title="Zet een eerder bewaard bestand terug op dit apparaat"
      >
        <Upload size={15} /> Terugzetten
      </button>
    </>
  );

  const sidebarProps = {
    entries: looseEntries,
    totalConversations: controller.index.length,
    projects: projectList,
    activeId: projectPage ? null : (conversation?.id ?? null),
    openProjectId: projectPage,
    disabled: controller.streaming,
  };

  return (
    /* Gesprekkenlijst en gesprek zitten in ÉÉN kaart: de lijst is geen los
       zwevend blok naast de chat maar hoort er zichtbaar bij, gescheiden door
       niet meer dan een lijn. De kaart vult altijd het hele venster
       (useFitHeight): zo blijft de leesruimte zo groot mogelijk en houdt het
       tekstvak tijdens een gesprek een vaste plek. Alleen de berichtenlijst
       scrollt. Op de telefoon vervalt de kaart en loopt de chat tot de rand. */
    <div className="mx-auto w-full max-w-6xl sm:px-6 sm:py-4 lg:px-8 laag:!py-0">
      <div
        ref={cardRef}
        style={cardMaxHeight ? { height: cardMaxHeight } : undefined}
        className="opl-card opl-chat-kaart flex h-[calc(100dvh-14rem)] overflow-hidden max-sm:rounded-none max-sm:border-0 max-sm:shadow-none"
      >
        <ChatSidebar
          {...sidebarProps}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onNewProject={() => void handleNewProject()}
          onOpenProject={handleOpenProject}
          onRequestDelete={setConfirmDeleteId}
          onRequestDeleteAll={() => setConfirmDeleteAll(true)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="opl-chat-titel flex items-center gap-2 border-b border-slate-200 px-2 py-1 dark:border-slate-700 sm:px-6 sm:py-3 lg:px-6 laag:!py-0">
              {/* Zonder zijbalk: de lijst met chats en projecten schuift in. */}
              <button
                type="button"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-rijksblauw-700 hover:bg-slate-100 disabled:opacity-40 dark:text-rijksblauw-200 dark:hover:bg-slate-700 lg:hidden"
                onClick={() => setListOpen(true)}
                disabled={controller.streaming}
                aria-label="Chats en projecten"
              >
                <Menu size={20} />
              </button>
              {openProject ? (
                <FolderOpen size={18} className="hidden text-rijksblauw-500 lg:block" />
              ) : (
                <MessageSquare size={18} className="hidden text-rijksblauw-500 lg:block" />
              )}
              <h1 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
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
                  title="In deze chat wordt een gegenereerde prompt uitgevoerd; de prompt bepaalt zelf taal, toon en opmaak."
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
                  title={`Deze chat draait onder de instructie van project "${activeProject.name}". Klik om het project te openen.`}
                >
                  <FolderOpen size={11} /> {activeProject.name}
                </button>
              )}
              {!openProject && conversation && messages.length > 0 && (
                <button
                  type="button"
                  className="ml-auto shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  onClick={() => controller.exportConversation(conversation.id)}
                  disabled={controller.streaming}
                  aria-label="Bewaar deze chat als bestand"
                  title="Bewaar deze chat als bestand op dit apparaat"
                >
                  <Download size={16} />
                </button>
              )}
              <button
                type="button"
                className={clsx(
                  'flex h-9 shrink-0 items-center justify-center rounded-lg px-2 text-rijksblauw-700 hover:bg-slate-100 disabled:opacity-40 dark:text-rijksblauw-200 dark:hover:bg-slate-700 lg:hidden',
                  !(!openProject && conversation && messages.length > 0) && 'ml-auto',
                )}
                onClick={handleNewConversation}
                disabled={controller.streaming}
                aria-label="Nieuwe chat"
                title="Nieuwe chat"
              >
                <Plus size={20} />
              </button>
            </div>

            {openProject ? (
              <>
                <ProjectView
                  project={openProject}
                  conversations={projectConversations}
                  disabled={controller.streaming}
                  onNewChat={() => handleNewChatInProject(openProject.id)}
                  onNewPrompt={handleNewPrompt}
                  onMakeInstruction={() => setWizard({ projectId: openProject.id, isNew: false })}
                  onOpenSettings={() => setSettingsProjectId(openProject.id)}
                  onSelectConversation={handleSelectConversation}
                  onRequestDeleteConversation={setConfirmDeleteId}
                  onRequestDeleteProject={() => setConfirmDeleteProject(openProject.id)}
                />
                <p className="border-t border-slate-200 px-4 py-2 text-center text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200 sm:px-6">
                  {PII_NOTICE}
                </p>
              </>
            ) : (
              /* Leeg gesprek: begroeting en tekstvak staan samen in het midden
                 (mt-auto en mb-auto, die laten bij een klein venster de
                 bovenkant bereikbaar). Na het eerste bericht neemt de lijst de
                 ruimte in en zakt het tekstvak naar zijn vaste plek. Het blijft
                 hetzelfde element, dus de cursor raakt niet kwijt. */
              <div
                className={clsx(
                  'flex min-h-0 flex-auto flex-col',
                  messages.length === 0 && 'overflow-y-auto',
                )}
              >
                {messages.length === 0 ? (
                  // Een vergroot tekstvak vraagt de hele ruimte: dan geen begroeting.
                  !composerEnlarged && (
                    <div className="mt-auto">
                      {/* Geen startsjablonen meer: een leeg gesprek wijst alleen
                          het invoerveld aan. */}
                      <ChatEmptyState />
                    </div>
                  )
                ) : (
                  <ChatMessageList
                    messages={messages}
                    streaming={controller.streaming}
                    phase={controller.phase}
                    onRetry={
                      projectNeedsLogin
                        ? () => requireLogin('Log in om verder te gaan in deze projectchat.')
                        : controller.retry
                    }
                    onContinue={
                      projectNeedsLogin
                        ? () => requireLogin('Log in om verder te gaan in deze projectchat.')
                        : controller.continueLast
                    }
                    onRepair={handleRepair}
                    onEdit={composerDisabled ? undefined : (id, text) => guardedSend(text, id)}
                    onImprove={handleImprove}
                    onSaveAsPrompt={handleSaveAsPrompt}
                    nudgeMessageId={nudgeMessageId}
                    onNudgeDismiss={dismissNudge}
                  />
                )}

                {projectNeedsLogin && (
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <span>
                      Deze chat hoort bij een project. Log in om verder te gaan met de
                      projectinstructies.
                    </span>
                    <button
                      type="button"
                      className="opl-btn-primary !px-3 !py-1.5 text-xs"
                      onClick={() => requireLogin('Log in om verder te gaan in deze projectchat.')}
                    >
                      <LogIn size={14} /> Inloggen
                    </button>
                  </div>
                )}

                <div
                  className={
                    messages.length > 0 ? undefined : composerEnlarged ? 'my-auto' : 'mb-auto'
                  }
                >
                  {/* Wat het geheugen deed, op de plek waar je typt. */}
                  <MemoryNoticeBar
                    notice={controller.memoryNotice}
                    onDismiss={controller.dismissMemoryNotice}
                    onLogin={() => requireLogin('Log in om dit in je geheugen op te slaan.')}
                  />
                  <ChatComposer
                    ref={composerRef}
                    disabled={composerDisabled}
                    disabledPlaceholder={
                      projectNeedsLogin ? 'Log in om verder te chatten in dit project' : undefined
                    }
                    streaming={controller.streaming}
                    extracting={controller.extracting}
                    attachments={conversation?.attachments ?? []}
                    onSend={guardedSend}
                    onRoutekaart={(text) => void controller.addRoutekaart(text)}
                    onStop={controller.stop}
                    onAddFile={(file) => void controller.addAttachment(file)}
                    onRemoveAttachment={controller.removeAttachment}
                    // Sterretje alleen tonen als de beheerder de functie aan heeft staan.
                    onOptimize={settings?.optimizeEnabled ? handleOptimizeInput : undefined}
                    onContext={handleOpenContext}
                    activeProjectName={activeProject?.name}
                    thinking={thinking}
                    onToggleThinking={setThinking}
                    thinkingUnavailable={thinkingUnavailable}
                    // Wereldbol alleen tonen als de beheerder zoeken aan heeft staan.
                    webSearch={webSearch}
                    onToggleWebSearch={settings?.webSearchEnabled ? setWebSearch : undefined}
                    // Leeg gesprek: het invoerveld is het enige aanknopingspunt op
                    // het scherm en wordt daarom groter en blauw omrand getoond.
                    prominent={messages.length === 0}
                    notice={PII_NOTICE}
                    // Geen uitvoergesprek: daar staan zulke woorden in de prompt die getest wordt.
                    memoryHint={conversation?.kind !== 'execution'}
                    onEnlargedChange={setComposerEnlarged}
                    badge={
                      settings ? (
                        <ChatModelBadge provider={settings.provider} model={settings.model} />
                      ) : undefined
                    }
                  />
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Onder de kaart, en dus ook tijdens een lopend gesprek zichtbaar. Op de
          telefoon telt elke regel: daar staat dit in de lijst met chats. */}
      <div
        data-fit-below
        className="mt-3 hidden flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm sm:flex laag:hidden"
      >
        {storagePromise}
      </div>
      <input
        ref={restoreInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void controller.importHistory(file);
        }}
      />

      <Drawer open={listOpen} onClose={() => setListOpen(false)} title="Chats en projecten">
        <ChatSidebar
          {...sidebarProps}
          inDrawer
          onSelect={(id) => {
            setListOpen(false);
            handleSelectConversation(id);
          }}
          onNew={() => {
            setListOpen(false);
            handleNewConversation();
          }}
          onNewProject={() => {
            setListOpen(false);
            void handleNewProject();
          }}
          onOpenProject={(id) => {
            setListOpen(false);
            handleOpenProject(id);
          }}
          onRequestDelete={setConfirmDeleteId}
          onRequestDeleteAll={() => setConfirmDeleteAll(true)}
          footer={
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
              {storagePromise}
            </div>
          }
        />
      </Drawer>

      {pendingSend && aiSettings && (
        <GuardrailDialog
          action="versturen"
          findings={pendingSend.findings}
          piiWarning={aiSettings.pii.warning}
          onConfirm={() => {
            pendingSend.attachmentIds.forEach((id) => checkedAttachments.current.add(id));
            setPendingSend(null);
            if (pendingSend.replaceId) {
              controller.editMessage(pendingSend.replaceId, pendingSend.text);
            } else {
              void controller.send(pendingSend.text);
            }
          }}
          onCancel={() => {
            // Het invoerveld is bij versturen al leeggemaakt; zet de tekst terug.
            composerRef.current?.fill(pendingSend.text);
            setPendingSend(null);
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Chat verwijderen?"
        message="Dit verwijdert de chat definitief van dit apparaat, inclusief bijlagen. Dit kan niet ongedaan worden gemaakt."
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
        title="Alle chats verwijderen?"
        message="Dit verwijdert al je chats definitief van dit apparaat, inclusief bijlagen. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Alles verwijderen"
        destructive
        onConfirm={controller.removeAllConversations}
        onClose={() => setConfirmDeleteAll(false)}
      />
      {contextWizard && (
        <ChatContextWizard
          startAt={contextWizard.startAt}
          initialGoal={contextWizard.goal}
          projects={projectList}
          activeProjectId={conversation?.projectId ?? null}
          chatStarted={messages.length > 0}
          attachments={conversation?.attachments ?? []}
          settings={settings}
          isLoggedIn={Boolean(user)}
          onLogin={() => {
            setContextWizard(null);
            requireLogin('Log in om je projecten te gebruiken.');
          }}
          onNewProject={() => {
            setContextWizard(null);
            void handleNewProject();
          }}
          onApplyProject={handleApplyContext}
          onPrompt={handleContextPrompt}
          onClose={() => setContextWizard(null)}
        />
      )}
      {wizardProject && (
        <ProjectPromptWizard
          key={wizardProject.id}
          projectName={wizardProject.name}
          isNewProject={Boolean(wizard?.isNew)}
          settings={settings}
          onManual={() => {
            setWizard(null);
            setSettingsProjectId(wizardProject.id);
          }}
          onClose={handleCloseWizard}
          onSave={handleSaveWizard}
        />
      )}
      <ProjectSettingsModal
        open={settingsProject !== null}
        project={settingsProject}
        onClose={handleCloseSettings}
        onSave={handleSaveProject}
        onFilesChanged={() => {
          // Er staat nu een bronbestand in: dit is geen leeg formulier meer, ook
          // niet als de gebruiker daarna op annuleren drukt.
          draftProjectRef.current = null;
          projects.refresh();
        }}
        chatSettings={settings}
        checkPii={aiSettings?.pii.enabled ?? true}
      />
      <ConfirmDialog
        open={confirmDeleteProject !== null}
        title="Project verwijderen?"
        message="De instructie en de bronbestanden van dit project worden definitief verwijderd. De chats blijven op dit apparaat staan en gaan verder als gewone chats."
        confirmLabel="Verwijderen"
        destructive
        onConfirm={() => void handleDeleteProject()}
        onClose={() => setConfirmDeleteProject(null)}
      />
    </div>
  );
}
