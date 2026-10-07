import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Compass, Wand2 } from 'lucide-react';
import GoalDialog from '@/components/optimizer/GoalDialog';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';
import useThinking from '@/lib/useThinking';
import useWebSearch from '@/lib/useWebSearch';
import EntryTab from '@/components/optimizer/EntryTab';
import OwnPromptOptimizer from '@/components/optimizer/OwnPromptOptimizer';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import ProjectContextBar from '@/components/optimizer/ProjectContextBar';
import useChatProjects from '@/components/chat/useChatProjects';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { buildGeneratorContext, type GeneratorContext } from '@/services/chatProjectService';
import {
  consumeGeneratorHandoff,
  consumeProjectHandoff,
  consumeResultSnapshot,
} from '@/services/handoffService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
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
  const { profile, user, isAdmin } = useAuth();

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
  // Denkstand voor het schrijven van de prompt. Eén knop voor beide instappen,
  // en dezelfde stand als in de chat: zie useThinking.
  const [thinking, setThinking] = useThinking();
  // Admin-bepaalde AI-instellingen; gebruikers kiezen niet meer zelf.
  const settingsRef = useRef<AiSettings>(DEFAULT_AI_SETTINGS);
  // Wél state, anders dan de ref hierboven: de knop "Denken" moet opnieuw
  // renderen zodra blijkt dat het ingestelde model niet kan denken.
  const [thinkingUnavailable, setThinkingUnavailable] = useState<string | undefined>();
  const thinkingOn = thinking && !thinkingUnavailable;
  // Zoeken op internet bij het schrijven van de prompt. Voorlopig alleen voor
  // beheerders; de server controleert dat zelf ook, dit verbergt alleen de knop.
  const [webSearch, setWebSearch] = useWebSearch('builder');
  const webSearchOn = isAdmin && webSearch;
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
  // ("Genereer prompt") en de kiezer in de balk zelf.
  const chatProjects = useChatProjects();
  const [projectContext, setProjectContext] = useState<GeneratorContext | null>(null);
  const [projectContextLoading, setProjectContextLoading] = useState(false);
  // Het gekozen project onthouden we los van de context: de schakelaar
  // "bronbestanden mee" moet hem opnieuw kunnen opbouwen.
  const [projectContextId, setProjectContextId] = useState<string | null>(null);

  const loadProjectContext = useCallback(async (projectId: string, includeFiles: boolean) => {
    setProjectContextLoading(true);
    setProjectContextId(projectId);
    try {
      // De AI-instellingen gaan mee omdat het aanhaken van een project nu ook
      // een AI-stap ÍS: het project wordt eerst geanalyseerd (één keer per
      // versie, daarna uit de cache) en pas daarna bouwt de gebruiker.
      const ctx = await buildGeneratorContext(projectId, includeFiles, {
        provider: settingsRef.current.provider,
        model: settingsRef.current.model,
      });
      setProjectContext(ctx);
      // Een project zonder instructie én zonder bestanden levert niets op; dan
      // hangt er niets aan en zegt de balk dat door leeg te blijven.
      if (!ctx) setProjectContextId(null);
    } catch {
      setProjectContext(null);
      setProjectContextId(null);
    } finally {
      setProjectContextLoading(false);
    }
  }, []);

  // Handoff vanaf de projectpagina: één keer per bezoek consumeren.
  const projectHandoffDone = useRef(false);
  useEffect(() => {
    if (projectHandoffDone.current) return;
    const handoff = consumeProjectHandoff();
    if (!handoff) return;
    projectHandoffDone.current = true;
    void loadProjectContext(handoff.projectId, handoff.includeFiles);
  }, [loadProjectContext]);

  const clearProjectContext = useCallback(() => {
    setProjectContext(null);
    setProjectContextId(null);
  }, []);

  const toggleProjectFiles = useCallback(
    (includeFiles: boolean) => {
      if (projectContextId) void loadProjectContext(projectContextId, includeFiles);
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
  }

  const ownActive = entryMode === 'own-prompt';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          <Sparkles className="text-rijksoranje" /> Prompt genereren
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Genereer een herbruikbare prompt. De inhoud vul je zelf aan in je eigen chat.
          Kopieer en plak de prompt telkens wanneer je hem nodig hebt.
        </p>
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
          {/* Segmented control: kies eerst je instap (twee gescheiden knoppen),
              daarna verschijnt de bijbehorende chat naadloos binnen hetzelfde
              oranje-omrande element — zo valt de oranje rand alléén om de chat.
              De tabs (header) gaan in beide flows mee in datzelfde element. */}
          {(() => {
            const tabs = (
              // De projectbalk is de bovenste rij ván de bouwerkaart, niet een
              // los blok erboven: beide flows renderen `header` binnen hun
              // omrande, afgeronde blok, dus de rand loopt om de balk heen en
              // zijn bovenhoeken worden op de kaartronding afgeknipt. Als
              // zwevende strook erboven las hij als een melding náást de bouwer
              // en werd hij overgeslagen.
              <>
                <ProjectContextBar
                  projects={chatProjects.projects}
                  context={projectContext}
                  loading={projectContextLoading}
                  onPick={(id) => void loadProjectContext(id, false)}
                  onClear={clearProjectContext}
                  onToggleFiles={toggleProjectFiles}
                />
                <div
                  role="tablist"
                  aria-label="Kies hoe je wilt starten"
                  className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-slate-700 dark:border-slate-700"
                >
                  <EntryTab
                    active={ownActive}
                    onClick={() => setEntryMode('own-prompt')}
                    icon={<Wand2 size={20} />}
                    title="Optimaliseer je prompt"
                    description="Heb je al een prompt? Wij zoeken het best passende prompt framework, analyseren je prompt en vullen aan wat nog ontbreekt."
                  />
                  <EntryTab
                    active={!ownActive}
                    accent="blauw"
                    onClick={() => setEntryMode('goal')}
                    icon={<Compass size={20} />}
                    title="Start een brainstormsessie"
                    description="Beschrijf wat je wilt bereiken, dan denken we stap voor stap mee naar je doel."
                  />
                </div>
                {/* Denken: geldt voor het schrijven van de prompt aan het eind
                    van beide instappen. Staat hier en niet bij de knop zelf,
                    omdat de doel-flow vanzelf doorloopt naar het schrijven; wie
                    het pas daar mag kiezen, is te laat. */}
                <div className="flex items-center justify-end gap-2 border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Lastige opdracht? Laat het model eerst nadenken.
                  </span>
                  <ThinkingToggle
                    value={thinking}
                    onChange={setThinking}
                    unavailableReason={thinkingUnavailable}
                  />
                  {isAdmin && <WebSearchToggle value={webSearch} onChange={setWebSearch} />}
                </div>
              </>
            );

            // Beide instappen renderen de tabs zelf als header (oranje rand om de
            // chat; het advies en de voor-ingevulde velden staan eronder). De
            // eigen-prompt-flow analyseert een geplakte prompt; de doel-flow voert
            // eerst een gesprek. In beide gevallen kiest de AI het framework en
            // vult zij de velden voor — handmatig vanaf nul bouwen kan niet meer.
            return ownActive ? (
              <OwnPromptOptimizer
                settings={settingsRef.current}
                onResult={handleResult}
                header={tabs}
                initialPrompt={initialPrompt}
                projectContext={projectContext?.text}
                thinking={thinkingOn}
                webSearch={webSearchOn}
              />
            ) : (
              <GoalDialog
                settings={settingsRef.current}
                onResult={handleResult}
                header={tabs}
                projectContext={projectContext?.text}
                thinking={thinkingOn}
                webSearch={webSearchOn}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}
