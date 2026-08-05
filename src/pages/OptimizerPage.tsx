import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Compass, Wand2 } from 'lucide-react';
import GoalDialog from '@/components/optimizer/GoalDialog';
import EntryTab from '@/components/optimizer/EntryTab';
import OwnPromptOptimizer from '@/components/optimizer/OwnPromptOptimizer';
import OptimizedOutput from '@/components/optimizer/OptimizedOutput';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { getPrompt, saveOptimization } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { consumeGeneratorHandoff, consumeResultSnapshot } from '@/services/handoffService';
import { getAiSettings, DEFAULT_AI_SETTINGS, type AiSettings } from '@/services/settingsService';
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
  // Admin-bepaalde AI-instellingen; gebruikers kiezen niet meer zelf.
  const settingsRef = useRef<AiSettings>(DEFAULT_AI_SETTINGS);
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
      if (active) settingsRef.current = s;
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

  /**
   * Een verbeter-ronde uit de Testkamer leverde een nieuwe versie op: achteraan
   * toevoegen en meteen actief maken. `versions.length` is hier de index van de
   * nieuwe versie — de Testkamer is single-flight, dus er lopen nooit twee
   * verbeter-rondes tegelijk.
   */
  function handleRefined(res: OptimizeResult) {
    void trackEvent({
      event_type: 'optimization_run',
      user_identifier: activityIdentifier(profile, user?.email),
      prompt_id: sourcePromptId,
      technique_id: resultTechnique?.id,
      metadata: { provider: res.provider, flow: 'refine', version: versions.length + 1 },
    });
    setVersions((cur) => [...cur, res]);
    setActiveVersion(versions.length);
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
            onRefined={handleRefined}
            aiSettings={settingsRef.current}
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
              <div
                role="tablist"
                aria-label="Kies hoe je wilt starten"
                className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-slate-700 dark:border-slate-700"
              >
                <EntryTab
                  active={ownActive}
                  onClick={() => setEntryMode('own-prompt')}
                  icon={<Wand2 size={20} />}
                  title="Optimaliseer jouw eigen prompt"
                  description="Heb je al een prompt? Wij zoeken het best passende prompt framework, analyseren je prompt en vullen aan wat nog ontbreekt."
                />
                <EntryTab
                  active={!ownActive}
                  accent="blauw"
                  onClick={() => setEntryMode('goal')}
                  icon={<Compass size={20} />}
                  title="Help mij met het bereiken van mijn doel"
                  description="Beschrijf wat je wilt bereiken, dan vinden we de techniek waarmee je je prompt opbouwt."
                />
              </div>
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
              />
            ) : (
              <GoalDialog
                settings={settingsRef.current}
                onResult={handleResult}
                header={tabs}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}
