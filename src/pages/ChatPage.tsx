import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InfoDot from '@/components/common/InfoDot';
import { useNavigate } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useNlddEvent } from '@/lib/nldd';
import { useAuth } from '@/context/AuthContext';
import { AuthLoading } from '@/components/auth/RequireAuth';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatComposer, { type ChatComposerHandle } from '@/components/chat/ChatComposer';
import ChatEmptyState from '@/components/chat/ChatEmptyState';
import ChatMessageList, { type ChatMessageListHandle } from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatContextWizard, { type ContextPrompt } from '@/components/chat/ChatContextWizard';
import ChatIntake from '@/components/chat/ChatIntake';
import useChatIntake from '@/components/chat/useChatIntake';
import ProjectPromptWizard from '@/components/chat/ProjectPromptWizard';
import ProjectSettingsModal from '@/components/chat/ProjectSettingsModal';
import ProjectView from '@/components/chat/ProjectView';
import useChatController from '@/components/chat/useChatController';
import MemoryNoticeBar from '@/components/chat/MemoryNoticeBar';
import useThinking from '@/lib/useThinking';
import useWebSearch from '@/lib/useWebSearch';
import useChatProjects from '@/components/chat/useChatProjects';
import SavePromptModal from '@/components/prompts/SavePromptModal';
import { looksLikeMessyPrompt } from '@/lib/promptHeuristics';
import { shouldJudgeFirstMessage, useChatIntakeEnabled } from '@/lib/chatIntake';
import { isConversationActive } from '@/lib/conversationMode';
import { useReferenceData } from '@/context/ReferenceDataContext';
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
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/container';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/page';
import '@nldd/design-system/sidebar-section';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/title';
import '@nldd/design-system/tooltip';
import '@nldd/design-system/top-title-bar';
import '@nldd/design-system/visually-hidden';

/** Staat in de kaart, zodat hij altijd bij het typen in beeld is. */
const PII_NOTICE = 'Verwerk geen persoonsgegevens.';

/** Zoveel tekst per bijlage leest het doorvragen mee, net als de context prompt. */
const MAX_INTAKE_ATTACHMENT_EXCERPT = 6_000;

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
  const handoffDone = useRef(false);
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
    findings: GuardrailFinding[];
    attachmentIds: string[];
    proceed: () => void;
    /** Bij annuleren terug in het tekstvak. */
    refill?: string;
  } | null>(null);

  /**
   * Eerst de controle, dan `proceed`. Ook het doorvragen loopt hierdoor: een
   * bijlage die tussendoor is toegevoegd, gaat pas als bronmateriaal naar de AI
   * nadat hij is gecontroleerd.
   */
  function runGuarded(text: string, proceed: () => void, refill?: string) {
    const fresh = (conversation?.attachments ?? []).filter(
      (a) => !checkedAttachments.current.has(a.id),
    );
    const findings = aiSettings?.pii.enabled
      ? detectPii([text, ...fresh.map((a) => a.text)].join('\n'))
      : [];
    if (findings.length > 0) {
      setPendingSend({ findings, attachmentIds: fresh.map((a) => a.id), proceed, refill });
      return;
    }
    fresh.forEach((a) => checkedAttachments.current.add(a.id));
    proceed();
  }

  /** Met `replaceId` vervangt de tekst dat eigen bericht in plaats van erachter te komen. */
  function guardedSend(text: string, replaceId?: string) {
    runGuarded(
      text,
      () => (replaceId ? controller.editMessage(replaceId, text) : dispatch(text)),
      text,
    );
  }

  // --- Doorvragen bij het eerste bericht ---
  // Mist er iets, dan maakt de chat er eerst een prompt van en vraagt hij bij een
  // heel summier bericht eerst door. Uit te zetten bij Instellingen, Chat.
  const { techniques } = useReferenceData();
  const intakeEnabled = useChatIntakeEnabled();
  const attachmentsRef = useRef(conversation?.attachments ?? []);
  attachmentsRef.current = conversation?.attachments ?? [];
  const intake = useChatIntake({
    settings,
    techniques,
    getMaterial: () =>
      attachmentsRef.current
        .map((a) => `Bijlage "${a.name}":\n${a.text.slice(0, MAX_INTAKE_ATTACHMENT_EXCERPT)}`)
        .join('\n\n'),
    onPassThrough: (goal) => void controller.send(goal),
    // Net als de context prompt: hij komt in het tekstvak en draait als uitvoering.
    onUse: (draft) => {
      controller.applyContext(null, true);
      composerRef.current?.fillPrompt(draft.prompt, {
        framework: draft.framework?.name,
        reden: draft.reden,
      });
    },
  });
  const intakeState = intake.state;
  const resetIntake = intake.reset;
  useEffect(() => {
    resetIntake();
  }, [conversationId, resetIntake]);
  useEffect(() => {
    if (messages.length > 0 && intakeState) resetIntake();
  }, [messages.length, intakeState, resetIntake]);
  const chatActive = messages.length > 0 || intakeState !== null;

  /** Waar een verstuurd bericht heen gaat: het doorvragen, of gewoon de chat. */
  function dispatch(text: string) {
    if (intakeState) {
      if (intakeState.phase === 'vragen' && intakeState.question) {
        intake.answer(text);
        return;
      }
      if (intakeState.phase === 'voorstel') {
        intake.improve(text);
        return;
      }
      // De gemaakte prompt, of iets nieuws: dit is het echte eerste bericht.
      resetIntake();
      void controller.send(text);
      return;
    }
    if (
      intakeEnabled &&
      messages.length === 0 &&
      conversation &&
      conversation.kind !== 'execution' &&
      !conversation.projectId &&
      // Een gesprek met de stem loopt door; een vraagkaart zou het stilleggen.
      !isConversationActive() &&
      shouldJudgeFirstMessage(text)
    ) {
      intake.start(text);
      return;
    }
    void controller.send(text);
  }

  const intakePlaceholder =
    intakeState?.phase === 'vragen'
      ? 'Of typ je eigen antwoord'
      : intakeState?.phase === 'voorstel'
        ? 'Of zeg wat er anders moet'
        : undefined;
  /** De prompt zoals hij nu in het tekstvak staat, ook als de gebruiker hem al aanpaste. */
  const intakePrompt = () =>
    composerRef.current?.getText().trim() || intakeState?.draft?.prompt || '';

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
      notify(reason);
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
      resetIntake();
      controller.applyContext(projectId, false);
      composerRef.current?.focus();
    },
    [controller, resetIntake],
  );

  const handleContextPrompt = useCallback(
    ({ draft, projectId }: ContextPrompt) => {
      setContextWizard(null);
      resetIntake();
      controller.applyContext(projectId, true);
      composerRef.current?.fillPrompt(draft.prompt, {
        framework: draft.framework?.name,
        reden: draft.reden,
      });
    },
    [controller, resetIntake],
  );

  const handleSaveWizard = useCallback(
    async (patch: { name: string; instructions: string }) => {
      if (!wizard) return false;
      const ok = await projects.update(wizard.projectId, patch);
      if (!ok) return false;
      draftProjectRef.current = null;
      setWizard(null);
      notify.success('Je prompt staat in het project.');
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
    notify.success('Project verwijderd.');
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
      if (res.error) notify.error(res.error);
      else if (!res.changed) notify('Je tekst was al duidelijk genoeg.', { icon: '✨' });
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

  // --- Layout: de zijbalk en de titelbalk ---
  // Onder lg is de zijbalk een sheet; de terugknop van de titelbalk opent hem.
  const sectionRef = useRef<HTMLElement & { collapsed?: boolean; show?: () => void; hide?: () => void }>(null);
  const titleBarRef = useRef<HTMLElement>(null);
  const listRef = useRef<ChatMessageListHandle>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showJump, setShowJump] = useState(false);
  useNlddEvent<CustomEvent<{ collapsed: boolean }>>(sectionRef, 'collapse-change', (e) =>
    setCollapsed(Boolean(e.detail?.collapsed)),
  );
  useEffect(() => {
    // The section reflects its state once it has measured itself.
    const el = sectionRef.current;
    if (!el) return;
    const sync = () => setCollapsed(el.hasAttribute('collapsed'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ['collapsed'] });
    return () => observer.disconnect();
  }, [configured, settings?.enabled]);
  useNlddEvent(titleBarRef, 'back', () => sectionRef.current?.show?.());
  /** Een keuze in de zijbalk sluit de sheet, zodat je ziet wat je koos. */
  const closeList = useCallback(() => {
    if (sectionRef.current?.hasAttribute('collapsed')) sectionRef.current.hide?.();
  }, []);

  /** Een bewaard bestand terugzetten. Het bestand blijft in de browser. */
  const pickRestoreFile = useCallback(() => {
    // A file picker opens only from a real input, and the design system has none
    // without its own visible surface: this one is made on the spot and not shown.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void controller.importHistory(file);
    };
    input.click();
  }, [controller]);

  // Chat uitgezet door de beheerder of geen backend: nette melding.
  if (!configured || (settings && !settings.enabled)) {
    return (
      <nldd-simple-section>
        <nldd-title heading-level={1} size={3} text="De chat is niet beschikbaar"></nldd-title>
        <nldd-spacer size="16"></nldd-spacer>
        <nldd-banner
          variant="warning"
          text={
            !configured
              ? 'Er is geen AI-service geconfigureerd in deze omgeving.'
              : 'De beheerder heeft de chat tijdelijk uitgeschakeld.'
          }
        ></nldd-banner>
      </nldd-simple-section>
    );
  }

  /* Waar blijven je chats? De scheiding tussen projecten (database) en chats (dit
     apparaat) is de belangrijkste privacy-afspraak van deze pagina. Eén korte
     belofte in beeld, de rest achter het infobolletje; ernaast de twee knoppen
     waarmee je je chats als bestand meeneemt. Het bestand gaat nergens heen:
     opbouwen en inlezen gebeurt in de browser. */
  const storagePromise = (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-text size="sm" color="secondary">
        Chats blijven in deze browser.
      </nldd-text>
      <InfoDot
        label="Uitleg over waar chats en projecten staan"
        text={
          'Chats staan alleen in deze browser, ook zonder account en na uitloggen. Wis je de browsergegevens of wissel je van pc, dan zie je ze daar niet.\nProjecten staan bij je account in de database.\nMet Bewaren en Terugzetten (onder Meer bij Chats) neem je je chats mee als bestand.'
        }
      />
    </nldd-container>
  );

  const chatTitle = conversation && messages.length > 0 ? conversation.title : 'Chat';
  const barTitle = openProject ? openProject.name : chatTitle;
  // Het tekstvak staat onder het gesprek zodra er een gesprek is; in een lege chat
  // staat het in het midden, onder de begroeting.
  const composerPinned = chatActive;

  return (
    <>
      {/* Gesprekkenlijst en gesprek horen bij elkaar: op een breed scherm staat de
          lijst ernaast, smaller schuift hij in als sheet. Het document scrolt; de
          titelbalk blijft staan (sticky-header). */}
      <nldd-sidebar-section
        ref={sectionRef}
        sidebar-label="Chats en projecten"
        width="full"
        sm-padding-top="8"
      >
        <nldd-container slot="sidebar" padding="12">
          <ChatSidebar
            entries={looseEntries}
            totalConversations={controller.index.length}
            projects={projectList}
            activeId={projectPage ? null : (conversation?.id ?? null)}
            openProjectId={projectPage}
            disabled={controller.streaming}
            onSelect={(id) => {
              closeList();
              handleSelectConversation(id);
            }}
            onNew={() => {
              closeList();
              handleNewConversation();
            }}
            onNewProject={() => {
              closeList();
              void handleNewProject();
            }}
            onOpenProject={(id) => {
              closeList();
              handleOpenProject(id);
            }}
            onRequestDelete={setConfirmDeleteId}
            onRequestDeleteAll={() => setConfirmDeleteAll(true)}
            onExport={controller.exportHistory}
            onImport={pickRestoreFile}
            canExport={!controller.streaming && controller.index.length > 0}
            footer={storagePromise}
          />
        </nldd-container>

        <nldd-page
          sticky-header
          background="base"
          landmarks="region"
          accessible-label="Chat"
        >
          {/* The bar always shows the title, as an h2: the h1 with the same words
              stays in the content for RouteFocus and the heading structure. On a
              narrow screen the back button opens the list of chats and projects. */}
          <nldd-top-title-bar
            ref={titleBarRef}
            slot="header"
            text={barTitle}
            heading-level={2}
            // The project page shows its name as the h1; the bar takes it over
            // once that heading scrolls away.
            collapse-anchor={openProject ? 'chat-titel' : undefined}
            back-text={collapsed && !controller.streaming ? 'Chats' : undefined}
          >
              {!openProject && conversation && messages.length > 0 && (
                <nldd-icon-button
                  slot="toolbar"
                  appearance="neutral-transparent"
                  icon="download"
                  text="Bewaar deze chat als bestand op dit apparaat"
                  disabled={controller.streaming || undefined}
                  onClick={() => controller.exportConversation(conversation.id)}
                ></nldd-icon-button>
              )}
              {collapsed && (
                <nldd-icon-button
                  slot="toolbar"
                  appearance="neutral-transparent"
                  icon="plus"
                  text="Nieuwe chat"
                  disabled={controller.streaming || undefined}
                  onClick={handleNewConversation}
                ></nldd-icon-button>
              )}
          </nldd-top-title-bar>

          {openProject && (
            <nldd-simple-section>
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
              <nldd-text slot="footer" size="sm" color="secondary">
                {PII_NOTICE}
              </nldd-text>
            </nldd-simple-section>
          )}

          {/* Leeg gesprek: begroeting en tekstvak staan samen in het midden, met
              evenveel ruimte erboven als eronder. Na het eerste bericht neemt het
              gesprek de ruimte in en zakt het tekstvak naar zijn vaste plek onderaan.
              Het blijft hetzelfde element, dus de cursor raakt niet kwijt. */}
          {!openProject && (
            <nldd-simple-section
              width="60ch"
              grow
              vertical-alignment={composerPinned ? undefined : 'bottom'}
            >
              {/* The title bar shows these words already; the h1 is for the
                  heading structure and RouteFocus. */}
              <nldd-visually-hidden>
                <nldd-title id="chat-titel" heading-level={1} text={chatTitle}></nldd-title>
              </nldd-visually-hidden>
              {/* Uitvoergesprek: hier draait een gegenereerde prompt (neutrale
                  systeemprompt, geen B1-huisregels); maak dat zichtbaar. */}
              {(conversation?.kind === 'execution' || activeProject) && (
                  <nldd-container layout="wrap" gap="4">
                    {conversation?.kind === 'execution' && (
                      <nldd-tooltip text="In deze chat wordt een gegenereerde prompt uitgevoerd; de prompt bepaalt zelf taal, toon en opmaak.">
                        <nldd-tag size="sm" color="oranje" icon="media-play" text="Uitvoering"></nldd-tag>
                      </nldd-tooltip>
                    )}
                    {/* Projectgesprek: de instructie van dit project stuurt het
                        antwoord. Klikbaar, want vanuit een gesprek wil je regelmatig
                        even terug naar de instructie of de bronnen. */}
                    {activeProject && (
                      <nldd-tooltip
                        text={`Deze chat draait onder de instructie van project "${activeProject.name}". Klik om het project te openen.`}
                      >
                        <nldd-button
                          size="xs"
                          appearance="neutral-tinted"
                          start-icon="folder-open"
                          text={activeProject.name}
                          onClick={() => handleOpenProject(activeProject.id)}
                        ></nldd-button>
                      </nldd-tooltip>
                    )}
                  </nldd-container>
              )}
              <nldd-spacer size="16"></nldd-spacer>

              {intakeState && messages.length === 0 ? (
                <ChatIntake
                  state={intakeState}
                  onPick={(answer) => runGuarded('', () => intake.answer(answer))}
                  onTypeOwn={(start) => {
                    const composer = composerRef.current;
                    if (!composer) return;
                    // Wat er al staat, blijft staan; anders komen de vinkjes erin.
                    if (start && !composer.getText().trim()) composer.fill(`${start}, `);
                    else composer.focus();
                  }}
                  onFinishQuestions={() => runGuarded('', intake.finishQuestions)}
                  onSkip={() => runGuarded('', intake.skip)}
                  onImprove={intake.improve}
                  onUse={intake.use}
                  onReopen={intake.reopen}
                  onRetry={() => runGuarded('', intake.retry)}
                  onAddFile={() => composerRef.current?.openFilePicker()}
                  onSaveAsPrompt={() => handleSaveAsPrompt(intakePrompt())}
                  onBuildInMaken={() => handleImprove(intakePrompt())}
                />
              ) : messages.length === 0 ? (
                // Een vergroot tekstvak vraagt de hele ruimte: dan geen begroeting.
                // Geen startsjablonen meer: een leeg gesprek wijst alleen het
                // invoerveld aan.
                !composerEnlarged && <ChatEmptyState />
              ) : (
                <ChatMessageList
                  ref={listRef}
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
                  onShowJumpChange={setShowJump}
                />
              )}
            </nldd-simple-section>
          )}

          {!openProject && (
            /* nldd-page 0.18.0 cannot pin this in a sticky footer while the document
               scrolls: in root scroll mode the footer reads --context-inset-bottom
               inside .page__scroll, which already includes its own height, so it
               floats one footer height above the bottom and covers the answer. Until
               that is fixed in the design system the composer follows the
               conversation. */
            <nldd-container
              data-chat-composer
              padding-inline="16"
              padding-block="12"
              horizontal-alignment="center"
            >
              <nldd-container max-width="60ch" gap="8">
                {showJump && (
                  <nldd-container horizontal-alignment="center">
                    <nldd-button
                      size="sm"
                      appearance="secondary"
                      start-icon="arrow-down"
                      text="Naar beneden"
                      onClick={() => listRef.current?.jumpToEnd()}
                    ></nldd-button>
                  </nldd-container>
                )}

                {projectNeedsLogin && (
                  <nldd-banner
                    size="sm"
                    variant="warning"
                    text="Deze chat hoort bij een project. Log in om verder te gaan met de projectinstructies."
                  >
                    <nldd-button
                      slot="actions"
                      appearance="primary"
                      start-icon="login"
                      text="Inloggen"
                      onClick={() => requireLogin('Log in om verder te gaan in deze projectchat.')}
                    ></nldd-button>
                  </nldd-banner>
                )}

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
                  placeholder={intakePlaceholder}
                  // Ook terwijl het doorvragen loopt: dan stopt Stop die stap.
                  streaming={controller.streaming || intake.busy}
                  extracting={controller.extracting}
                  attachments={conversation?.attachments ?? []}
                  onSend={guardedSend}
                  onRoutekaart={(text) => void controller.addRoutekaart(text)}
                  onStop={() => {
                    if (!intake.busy) {
                      controller.stop();
                      return;
                    }
                    const back = intake.stop();
                    if (back) composerRef.current?.fill(back);
                  }}
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
                  // het scherm en wordt daarom groter getoond.
                  prominent={!chatActive}
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
              </nldd-container>
            </nldd-container>
          )}
          {/* In a fresh chat the same room goes below the composer as above the
              greeting, which puts the two in the middle. */}
          {!openProject && !composerPinned && <nldd-spacer size="flexible"></nldd-spacer>}
        </nldd-page>
      </nldd-sidebar-section>

      {pendingSend && aiSettings && (
        <GuardrailDialog
          action="versturen"
          findings={pendingSend.findings}
          piiWarning={aiSettings.pii.warning}
          onConfirm={() => {
            pendingSend.attachmentIds.forEach((id) => checkedAttachments.current.add(id));
            setPendingSend(null);
            pendingSend.proceed();
          }}
          onCancel={() => {
            // Het invoerveld is bij versturen al leeggemaakt; zet de tekst terug.
            if (pendingSend.refill) composerRef.current?.fill(pendingSend.refill);
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
    </>
  );
}
