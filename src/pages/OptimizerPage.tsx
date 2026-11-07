import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Compass, Wand2 } from '@/components/common/icons';
import GoalDialog from '@/components/optimizer/GoalDialog';
import DailyBackground from '@/components/common/DailyBackground';
import InfoDot from '@/components/common/InfoDot';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';
import useThinking from '@/lib/useThinking';
import useWebSearch from '@/lib/useWebSearch';
import EntryTab from '@/components/optimizer/EntryTab';
import OwnPromptOptimizer from '@/components/optimizer/OwnPromptOptimizer';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import ProjectContextPicker, {
  type ProjectContextSlot,
} from '@/components/optimizer/ProjectContextPicker';
import useChatProjects from '@/components/chat/useChatProjects';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import {
  buildGeneratorContext,
  type GeneratorContext,
  type GeneratorFileSelection,
} from '@/services/chatProjectService';
import {
  consumeGeneratorHandoff,
  consumeProjectHandoff,
  consumeResultSnapshot,
} from '@/services/handoffService';
import {
  getAiSettings,
  getChatSettingsCached,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
} from '@/services/settingsService';
import { thinkingUnavailableReason } from '@/config/aiModels';
import { activityIdentifier } from '@/lib/utils';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import type { OptimizeResult, Technique } from '@/types';

/**
 * Welke instap actief is. Beide zijn automatisch: de gebruiker levert inhoud
 * (een eigen prompt of een doel), de AI kiest het passende framework en vult de
 * velden voor. Een framework "vanaf nul" handmatig invullen kan bewust niet
 * meer — er is geen instap zonder analyse.
 */
type EntryMode = 'own-prompt' | 'goal';

export default function OptimizerPage() {
  const { promptId } = useParams<{ promptId?: string }>();
  // De ingelogde gebruiker, zodat analytics-events op naam/e-mail worden gelogd
  // en een beheerder in "Recente activiteit" ziet wie iets deed (niet "Anoniem").
  const { profile, user } = useAuth();

  // Bronprompt uit de bibliotheek (/genereren/:promptId). De tekst gaat als
  // startwaarde naar de eigen-prompt-flow, die hem analyseert en er een
  // framework bij aanbeveelt; het id koppelt de optimalisatie aan die prompt.
  const [sourcePromptId, setSourcePromptId] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  // De doel-flow (GoalDialog) beheert dit veld zelf via dezelfde 'goal'-sleutel;
  // de pagina leest het alleen nog als titel-fallback in het resultaat.
  const [goal] = usePersistentDraft('goal');
  // Standaard staat de eigen-prompt-flow open: dat is het meest gebruikte startpunt.
  const [entryMode, setEntryMode] = useState<EntryMode>('own-prompt');
  // Denkstand voor het schrijven van de prompt. Eén knop voor beide instappen.
  // Staat bij elke nieuwe prompt uit: zie useThinking.
  const [thinking, setThinking] = useThinking();
  // Admin-bepaalde AI-instellingen; gebruikers kiezen niet meer zelf.
  const settingsRef = useRef<AiSettings>(DEFAULT_AI_SETTINGS);
  // Wél state, anders dan de ref hierboven: de knop "Denken" moet opnieuw
  // renderen zodra blijkt dat het ingestelde model niet kan denken.
  const [thinkingUnavailable, setThinkingUnavailable] = useState<string | undefined>();
  const thinkingOn = thinking && !thinkingUnavailable;
  // Zoeken op internet bij het invullen en schrijven van de prompt. Voor
  // iedereen, net als in de chat, zolang zoeken in Beheer, AI-instellingen
  // aanstaat.
  const [webSearch, setWebSearch] = useWebSearch('builder');
  const [searchAvailable, setSearchAvailable] = useState(false);
  const webSearchOn = searchAvailable && webSearch;
  // Versiegeschiedenis van het resultaat: v1 is de gegenereerde prompt, elke
  // verbeter-ronde uit de Testkamer voegt een versie toe. Alleen in-memory;
  // "Opnieuw" wist de historie. Het getoonde resultaat is de actieve versie.
  const [versions, setVersions] = useState<OptimizeResult[]>([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const result = versions[activeVersion] ?? null;
  // De techniek waarmee het getoonde resultaat is gemaakt (komt uit de flow mee).
  const [resultTechnique, setResultTechnique] = useState<Technique | null>(null);
  // 'input' = invoerpaneel zichtbaar, 'transition' = uitfaden, 'output' = resultaat
  const [phase, setPhase] = useState<'input' | 'transition' | 'output'>('input');
  // Voor het herstellen van een resultaat-snapshot (login vanuit de Testkamer).
  const { techniqueById } = useReferenceData();

  // ── Projectcontext ────────────────────────────────────────────────────────
  // Welk chatproject levert de achtergrond voor deze prompt? Zonder die
  // achtergrond schrijft de bouwer een algemene prompt: hij kent het onderwerp
  // van de gebruiker (zijn plugin, zijn merk, zijn applicatie) niet.
  //
  // De context wordt HIER geladen en als platte tekst doorgegeven aan alle
  // AI-stappen in de boom. Twee ingangen: de handoff vanaf de projectpagina
  // ("Genereer prompt") en de knop "Context" boven het tekstvak.
  const chatProjects = useChatProjects();
  const [projectContext, setProjectContext] = useState<GeneratorContext | null>(null);
  const [projectContextLoading, setProjectContextLoading] = useState(false);
  // Het gekozen project onthouden we los van de context: hij is er al terwijl de
  // analyse nog loopt, en een andere bronkeuze bouwt de context opnieuw op.
  const [projectContextId, setProjectContextId] = useState<string | null>(null);
  // Een analyse duurt tientallen seconden. Wie intussen wisselt of loskoppelt,
  // mag niet alsnog het antwoord van de vorige keuze aangehaakt krijgen.
  const projectRequest = useRef(0);

  const loadProjectContext = useCallback(
    async (projectId: string, selection: GeneratorFileSelection) => {
      const request = ++projectRequest.current;
      setProjectContextLoading(true);
      setProjectContextId(projectId);
      setProjectContext((current) => (current?.id === projectId ? current : null));
      try {
        // De AI-instellingen gaan mee omdat het aanhaken van een project nu ook
        // een AI-stap ÍS: het project wordt eerst geanalyseerd (één keer per
        // versie, daarna uit de cache) en pas daarna bouwt de gebruiker.
        const ctx = await buildGeneratorContext(projectId, selection, {
          provider: settingsRef.current.provider,
          model: settingsRef.current.model,
        });
        if (request !== projectRequest.current) return;
        setProjectContext(ctx);
        // Een project zonder instructie én zonder bestanden levert niets op; dan
        // hangt er niets aan en blijft de rij boven het tekstvak leeg.
        if (!ctx) setProjectContextId(null);
      } catch {
        if (request !== projectRequest.current) return;
        setProjectContext(null);
        setProjectContextId(null);
      } finally {
        if (request === projectRequest.current) setProjectContextLoading(false);
      }
    },
    [],
  );

  // Handoff vanaf de projectpagina: één keer per bezoek consumeren.
  const projectHandoffDone = useRef(false);
  useEffect(() => {
    if (projectHandoffDone.current) return;
    const handoff = consumeProjectHandoff();
    if (!handoff) return;
    projectHandoffDone.current = true;
    void loadProjectContext(handoff.projectId, handoff.includeFiles ? 'all' : []);
  }, [loadProjectContext]);

  const pickProject = useCallback(
    (projectId: string) => {
      // Normaal begint een project met alleen de instructie. Zonder instructie
      // zou dat niets opleveren en liet het project zich niet aanhaken, dus dan
      // gaan de bronnen mee en kan de gebruiker er daarna uit weghalen.
      const project = chatProjects.projects.find((p) => p.id === projectId);
      void loadProjectContext(projectId, project?.instructions.trim() ? [] : 'all');
    },
    [chatProjects.projects, loadProjectContext],
  );

  const clearProjectContext = useCallback(() => {
    projectRequest.current += 1;
    setProjectContextLoading(false);
    setProjectContext(null);
    setProjectContextId(null);
  }, []);

  const selectProjectFiles = useCallback(
    (fileIds: string[]) => {
      if (projectContextId) void loadProjectContext(projectContextId, fileIds);
    },
    [projectContextId, loadProjectContext],
  );

  // Laad de bronprompt als er via de URL een prompt is meegegeven.
  useEffect(() => {
    if (!promptId) return;
    let active = true;
    getPrompt(promptId)
      .then((p) => {
        if (!active) return;
        if (p) {
          setInitialPrompt(p.content);
          setSourcePromptId(p.id);
          // Een bronprompt hoort thuis in de eigen-prompt-flow.
          setEntryMode('own-prompt');
        }
      });
    return () => {
      active = false;
    };
  }, [promptId]);

  // Laad de door de admin ingestelde AI-instellingen (geldt voor alle gebruikers).
  useEffect(() => {
    let active = true;
    getAiSettings().then((s) => {
      if (!active) return;
      settingsRef.current = s;
      setThinkingUnavailable(thinkingUnavailableReason(s.provider, s.model));
    });
    // Of zoeken aanstaat, staat bij de chatinstellingen in Beheer.
    void getChatSettingsCached().then((s) => {
      if (active) setSearchAvailable(s.webSearchEnabled);
    });
    return () => {
      active = false;
    };
  }, []);

  // Twee sessionStorage-instromen (één keer, bij mount):
  // 1. Resultaat-snapshot: wie vanuit de Testkamer ging inloggen, krijgt zijn
  //    gegenereerde prompt hier terug in plaats van een lege generator.
  // 2. Omgekeerde handoff ("Verbeter in generator" in de chat): het chatbericht
  //    start als eigen prompt in de own-prompt-flow.
  // Niet bij een bibliotheekroute (/genereren/:promptId): die bron wint.
  const snapTechniqueIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (promptId) return;
    const snap = consumeResultSnapshot();
    if (snap) {
      snapTechniqueIdRef.current = snap.techniqueId;
      setVersions([snap.result]);
      setActiveVersion(0);
      setPhase('output');
      return;
    }
    const handoffText = consumeGeneratorHandoff();
    if (handoffText) {
      setInitialPrompt(handoffText);
      setEntryMode('own-prompt');
    }
    // Bewust alleen bij mount: latere promptId-wijzigingen zijn navigaties
    // binnen de generator en mogen een al geconsumeerd snapshot niet herhalen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // De techniek uit het snapshot alsnog koppelen zodra de referentiedata er is
  // (die laadt asynchroon; zonder techniek werkt het resultaat ook, alleen de
  // standaardtitel en de categorie-suggestie missen dan context).
  useEffect(() => {
    if (!snapTechniqueIdRef.current || resultTechnique) return;
    const t = techniqueById(snapTechniqueIdRef.current);
    if (t) setResultTechnique(t);
  }, [techniqueById, resultTechnique]);

  /**
   * Resultaat van de eigen-prompt-flow óf de doel-flow: toon het via dezelfde
   * uitvoer-fase. Een aanwezig `recipe` markeert een plan-run: dan loggen we
   * `flow:'plan-wizard'` met het aantal stappen en bewaren we het recept bij een
   * optimalisatie (herleidbaarheid/herhaling).
   */
  function handleResult(res: OptimizeResult, usedTechnique: Technique) {
    const isPlanWizard = Boolean(res.recipe);
    // De doel-flow levert een `dialogue` mee (het gevoerde gesprek); zo blijft in
    // de analytics zichtbaar via welke instap de prompt tot stand kwam.
    const flow = isPlanWizard ? 'plan-wizard' : res.dialogue ? 'goal' : 'own-prompt';
    void trackEvent({
      event_type: 'optimization_run',
      user_identifier: activityIdentifier(profile, user?.email),
      // Alleen gevuld als de gebruiker vanaf een bibliotheekprompt binnenkwam.
      prompt_id: sourcePromptId,
      technique_id: usedTechnique.id,
      metadata: {
        provider: res.provider,
        flow,
        ...(res.recipe ? { steps: res.recipe.plan.steps.length } : {}),
        ...(res.dialogue ? { answered: res.dialogue.transcript.length } : {}),
      },
    });
    // Bewaar de optimalisatie als er een recept bij zit (plan-run) of als hij bij
    // een bestaande bibliotheekprompt hoort. Best-effort: faal de UX niet.
    if (res.recipe || sourcePromptId) {
      void saveOptimization({
        prompt_id: sourcePromptId,
        technique_id: usedTechnique.id,
        optimized_content: res.optimized_content,
        follow_up_answers: {},
        ...(res.recipe ? { recipe: res.recipe } : {}),
      }).catch(() => {
        /* opslaan is best-effort; faal de UX niet */
      });
    }
    setResultTechnique(usedTechnique);
    setPhase('transition');
    setTimeout(() => {
      setVersions([res]);
      setActiveVersion(0);
      setPhase('output');
    }, 400);
  }

  function handleReset() {
    setVersions([]);
    setActiveVersion(0);
    setResultTechnique(null);
    snapTechniqueIdRef.current = null;
    setPhase('input');
    // Een nieuwe prompt begint zonder denken en zoeken; de gebruiker zet ze zelf aan.
    setThinking(false);
    setWebSearch(false);
  }

  const ownActive = entryMode === 'own-prompt';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* De bewegende achtergrond van de dag. Alle inhoud staat op een dekkend
          paneel: deze pagina heeft veel tussenstappen en meldingen die los op
          de pagina staan, en die moeten op elke achtergrond leesbaar blijven. */}
      <DailyBackground />
      <div className="rounded-2xl bg-slate-100 p-4 shadow-lg sm:p-6 dark:bg-slate-900">
      <div className="mb-5 flex items-center gap-1">
        <h1 className="text-3xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Prompt maken
        </h1>
        <InfoDot
          label="Uitleg over prompt maken"
          text={
            'Je maakt een herbruikbare prompt. De AI kiest de aanpak en vult alvast in; jij vult aan.\nHeb je nog geen tekst? Bij Ik heb een idee denken we eerst met je mee.'
          }
        />
      </div>

      {phase === 'output' && result ? (
        <div className="opl-card p-6">
          <OptimizedOutput
            result={result}
            technique={resultTechnique}
            goal={goal}
            onReset={handleReset}
            versions={versions}
            activeVersion={activeVersion}
            onSelectVersion={setActiveVersion}
          />
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-700 ${
            phase === 'transition' ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          {/* Twee tabbladen boven het invulvlak. Denken en Internet staan bij de
              knop waarmee je start: ze gelden voor het invullen én het bouwen. */}
          {(() => {
            const tabs = (
              <div role="tablist" aria-label="Hoe begin je?" className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                <EntryTab
                  active={ownActive}
                  onClick={() => setEntryMode('own-prompt')}
                  icon={<Wand2 size={22} />}
                  title="Ik heb al een prompt"
                />
                <EntryTab
                  active={!ownActive}
                  onClick={() => setEntryMode('goal')}
                  icon={<Compass size={22} />}
                  title="Ik heb een idee"
                />
              </div>
            );
            const toggles = (
              <>
                <ThinkingToggle
                  value={thinking}
                  onChange={setThinking}
                  unavailableReason={thinkingUnavailable}
                />
                {searchAvailable && <WebSearchToggle value={webSearch} onChange={setWebSearch} />}
                <InfoDot
                  label="Uitleg over denken en internet"
                  text={
                    searchAvailable
                      ? 'Denken: grondiger, wel trager. Alleen bij een lastige opdracht.\nInternet: de AI zoekt eerst op internet en noemt de bronnen.'
                      : 'Denken: grondiger, wel trager. Alleen bij een lastige opdracht.'
                  }
                />
              </>
            );

            // De projectcontext staat bij het tekstvak en niet in de kop: beide
            // instappen hebben een eigen veld, dus geven ze hun tekst hier door.
            const renderProjectContext = ({ text, stripMention, className }: ProjectContextSlot) => (
              <ProjectContextPicker
                projects={chatProjects.projects}
                context={projectContext}
                activeProjectId={projectContextId}
                loading={projectContextLoading}
                text={text}
                onStripMention={stripMention}
                onPick={pickProject}
                onClear={clearProjectContext}
                onSelectFiles={selectProjectFiles}
                className={className}
              />
            );

            // Beide instappen renderen de tabs zelf, boven hun eigen vlak. De
            // eigen-prompt-flow leest een geplakte prompt; de doel-flow voert eerst
            // een gesprek. In beide gevallen kiest de AI het framework en vult zij
            // de velden voor. Niemand kiest hier zelf; dat kan op /technieken.
            return ownActive ? (
              <OwnPromptOptimizer
                settings={settingsRef.current}
                onResult={handleResult}
                header={tabs}
                toggles={toggles}
                initialPrompt={initialPrompt}
                projectContext={projectContext?.text}
                renderProjectContext={renderProjectContext}
                thinking={thinkingOn}
                webSearch={webSearchOn}
              />
            ) : (
              <GoalDialog
                settings={settingsRef.current}
                onResult={handleResult}
                header={tabs}
                toggles={toggles}
                projectContext={projectContext?.text}
                renderProjectContext={renderProjectContext}
                thinking={thinkingOn}
                webSearch={webSearchOn}
              />
            );
          })()}
        </div>
      )}
      </div>
    </div>
  );
}
