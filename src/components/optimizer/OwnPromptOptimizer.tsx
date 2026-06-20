import { useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Compass,
  Info,
  Loader2,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import { analyzePrompt, generatePrompt, recommendFramework } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import type {
  AnalyzeResult,
  OptimizeResult,
  Technique,
  TechniqueRecommendation,
} from '@/types';

interface OwnPromptOptimizerProps {
  /** Admin-bepaalde AI-instellingen (provider, systeemprompt, toon, temperatuur). */
  settings: AiSettings;
  /** Aangeroepen met het geoptimaliseerde resultaat + de gekozen techniek. */
  onResult: (result: OptimizeResult, technique: Technique) => void;
}

/** Voorbeeldprompts per raamwerk; uitklapbaar als hulp/inspiratie en om te testen. */
const PROMPT_EXAMPLES: { framework: string; prompt: string }[] = [
  {
    framework: 'CRISPE',
    prompt:
      'Maak een advies voor een gemeente die AI wil inzetten om interne werkprocessen te verbeteren. Neem de huidige situatie, rollen, risico’s, stappen, randvoorwaarden en het gewenste eindresultaat mee.',
  },
  {
    framework: 'RAISE',
    prompt:
      'Herschrijf deze interne instructietekst voor ambtenaren naar duidelijke en praktische taal. Gebruik de aangeleverde tekst als basis en zorg dat medewerkers direct weten wat ze moeten doen.',
  },
  {
    framework: 'CO-STAR',
    prompt:
      'Schrijf een korte intranettekst voor rijksambtenaren over een nieuwe training veilig werken met AI. De tekst moet duidelijk maken waarom deelname belangrijk is, voor wie de training bedoeld is en wat deelnemers eraan hebben.',
  },
  {
    framework: 'CRAFT',
    prompt:
      'Maak een zakelijke memo voor het managementteam over de invoering van een nieuwe AI-tool binnen de organisatie. Gebruik een professionele toon en lever de output op als korte managementsamenvatting met vervolgstappen.',
  },
  {
    framework: 'CREATE',
    prompt:
      'Bedenk drie creatieve campagne-ideeën om ambtenaren enthousiast te maken voor een programma over digitale vaardigheden. Geef elk idee een titel, een korte slogan en een praktische uitwerking.',
  },
  {
    framework: 'REACT',
    prompt:
      'Controleer een conceptbeleidstekst stap voor stap op duidelijkheid, AVG-risico’s en toepasbaarheid voor ambtenaren. Beoordeel de belangrijkste aandachtspunten, voer verbeteringen door, controleer het resultaat en geef een korte terugkoppeling.',
  },
];

/**
 * Flow om een EIGEN prompt te optimaliseren. De gebruiker plakt zijn prompt en
 * laat de AI bepalen welk prompt framework (CARE, CRISP, …) het beste past.
 * Uit de aanbevelingen (1–3) kiest de gebruiker er één. Daarna analyseren we de
 * prompt tegen de eisen van dat raamwerk, tonen we wat nog ontbreekt als extra
 * invulvelden, en genereren we de volledig geoptimaliseerde prompt.
 */
export default function OwnPromptOptimizer({ settings, onResult }: OwnPromptOptimizerProps) {
  const { techniques, techniqueById } = useReferenceData();
  const frameworks = techniques.filter(isContextPrompt);

  const [ownPrompt, setOwnPrompt] = useState('');
  const [showExamples, setShowExamples] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<TechniqueRecommendation[] | null>(null);
  const [recommendSummary, setRecommendSummary] = useState('');
  const [techniqueId, setTechniqueId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Anker voor het analyse-/laadblok zodat we er na een keuze naartoe scrollen.
  const analysisRef = useRef<HTMLDivElement>(null);

  const technique = frameworks.find((t) => t.id === techniqueId) ?? null;

  /** Reset alles wat van de (oude) prompt afhangt: aanbevelingen, keuze, analyse. */
  function resetDownstream() {
    setRecommendations(null);
    setRecommendSummary('');
    setTechniqueId(null);
    setAnalysis(null);
    setAnswers({});
  }

  /** Kopieer een voorbeeldprompt naar het klembord. */
  async function copyExample(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Voorbeeld gekopieerd.');
    } catch {
      toast.error('Kopiëren mislukt.');
    }
  }

  /** Zet een voorbeeldprompt direct in het invoerveld om te testen. */
  function useExample(text: string) {
    setOwnPrompt(text);
    resetDownstream(); // nieuwe inhoud = oude aanbeveling/analyse vervalt
    setShowExamples(false);
    toast.success('Voorbeeld ingevuld.');
  }

  /** Stap 1: laat de AI op basis van de geplakte prompt het beste framework kiezen. */
  async function handleRecommend() {
    if (!ownPrompt.trim()) {
      toast.error('Plak eerst je eigen prompt.');
      return;
    }
    setRecommending(true);
    // Een nieuwe zoekopdracht maakt de vorige keuze en analyse ongeldig.
    setTechniqueId(null);
    setAnalysis(null);
    setAnswers({});
    try {
      const res = await recommendFramework({
        ownPrompt: ownPrompt.trim(),
        frameworks,
        preferredProvider: settings.provider,
      });
      setRecommendations(res.recommendations);
      setRecommendSummary(res.summary);
      if (res.error) toast(res.error, { icon: '⚠️' });
      if (res.recommendations.length === 0) {
        toast('Geen duidelijke match. Kies hieronder zelf een framework.', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Aanbeveling mislukt. Probeer het opnieuw.');
    } finally {
      setRecommending(false);
    }
  }

  /** Stap 2: gebruiker kiest één aanbevolen framework → meteen analyseren. */
  async function handleSelectFramework(id: string) {
    setTechniqueId(id);
    setAnalysis(null);
    setAnswers({});
    const chosen = frameworks.find((t) => t.id === id);
    if (!chosen) return;
    // Wacht tot het laadblok is gerenderd en scroll het rustig in beeld.
    requestAnimationFrame(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    void runAnalyze(chosen);
  }

  /** Stap 3: toets de eigen prompt aan de velden van het gekozen framework. */
  async function runAnalyze(chosen: Technique) {
    setAnalyzing(true);
    try {
      const res = await analyzePrompt({
        ownPrompt: ownPrompt.trim(),
        technique: chosen,
        preferredProvider: settings.provider,
      });
      setAnalysis(res);
      // Begin met lege antwoorden voor elk ontbrekend veld.
      setAnswers(Object.fromEntries(res.missing.map((m) => [m.id, ''])));
      if (res.error) toast(res.error, { icon: '⚠️' });
    } catch {
      toast.error('Analyse mislukt. Probeer het opnieuw.');
    } finally {
      setAnalyzing(false);
    }
  }

  /** Stap 4: genereer de volledig uitgewerkte, geoptimaliseerde prompt. */
  async function handleGenerate() {
    if (!technique) return;
    setGenerating(true);
    try {
      const res = await generatePrompt({
        technique,
        promptContent: ownPrompt.trim() || '[BESCHRIJF HIER WAT JE WILT BEREIKEN]',
        followUpAnswers: answers,
        preferredProvider: settings.provider,
        systemPrompt: settings.systemPrompt.trim() || undefined,
        toneInstruction: settings.toneInstruction.trim() || undefined,
        temperature: settings.temperature,
      });
      onResult(res, technique);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Optimaliseren mislukt');
    } finally {
      setGenerating(false);
    }
  }

  if (frameworks.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Er zijn nog geen prompt frameworks beschikbaar. Vraag een beheerder er één toe te voegen.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Eigen prompt plakken */}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="opl-label mb-0" htmlFor="own-prompt-input">
            Jouw eigen prompt
          </label>
          <button
            type="button"
            onClick={() => setShowExamples((v) => !v)}
            aria-expanded={showExamples}
            aria-controls="prompt-examples"
            title="Bekijk voorbeeldprompts"
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors',
              showExamples
                ? 'text-rijksblauw-700 dark:text-rijksblauw-200'
                : 'text-slate-400 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:text-rijksblauw-300',
            )}
          >
            <Info size={15} />
            <span>Voorbeelden</span>
          </button>
        </div>

        {/* Uitklapbaar paneel met voorbeeldprompts per raamwerk. */}
        {showExamples && (
          <div
            id="prompt-examples"
            className="animate-fade-in mb-3 space-y-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Voorbeeldprompts om te testen. Klik op het voorbeeld om het in te vullen, of kopieer
              het.
            </p>
            {PROMPT_EXAMPLES.map((ex) => (
              <div
                key={ex.framework}
                className="group rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">{ex.framework}</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void copyExample(ex.prompt)}
                      title="Kopieer voorbeeld"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300"
                    >
                      <ClipboardCopy size={13} /> Kopieer
                    </button>
                    <button
                      type="button"
                      onClick={() => useExample(ex.prompt)}
                      title="Gebruik dit voorbeeld in het invoerveld"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-rijksblauw-600 transition-colors hover:bg-rijksblauw-50 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/15"
                    >
                      <Wand2 size={13} /> Gebruik
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {ex.prompt}
                </p>
              </div>
            ))}
          </div>
        )}

        <textarea
          id="own-prompt-input"
          className="opl-input min-h-[120px] resize-y font-mono text-[13px]"
          value={ownPrompt}
          placeholder="Plak hier de prompt die je wilt optimaliseren…"
          onChange={(e) => {
            setOwnPrompt(e.target.value);
            resetDownstream(); // gewijzigde prompt = aanbeveling en analyse vervallen
          }}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          We analyseren je prompt en zoeken automatisch het best passende prompt framework voor je
          uit.
        </p>
      </div>

      {/* 2. Beste framework laten zoeken op basis van de prompt */}
      <button
        type="button"
        className="opl-btn-primary"
        onClick={handleRecommend}
        disabled={recommending || analyzing || !ownPrompt.trim()}
      >
        {recommending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Beste framework zoeken…
          </>
        ) : (
          <>
            <Compass size={18} /> Zoek het beste prompt framework
          </>
        )}
      </button>

      {/* 3. Aanbevolen frameworks — kies er één om toe te passen */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-3">
          {recommendSummary && (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {recommendSummary}
            </p>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {recommendations.length === 1
              ? 'Dit framework past het beste bij jouw prompt. Kies het om verder te gaan:'
              : 'Deze frameworks passen het beste bij jouw prompt. Kies welke je wilt toepassen:'}
          </p>
          {recommendations.map((rec, idx) => {
            const fw = techniqueById(rec.id);
            if (!fw) return null;
            const active = fw.id === techniqueId;
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => void handleSelectFramework(fw.id)}
                aria-pressed={active}
                className={clsx(
                  'flex w-full flex-col rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                    {idx === 0 && <Sparkles size={15} className="text-rijksoranje" />}
                    {fw.name}
                    {idx === 0 && recommendations.length > 1 && (
                      <span className="opl-badge bg-rijksoranje/15 text-rijksoranje">
                        Beste match
                      </span>
                    )}
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-white">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                {rec.reason && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{rec.reason}</span>
                )}
                {rec.value && (
                  <span className="mt-2 rounded-lg border border-rijksoranje/30 bg-rijksoranje/5 p-2.5 text-xs leading-relaxed text-slate-600 dark:border-rijksoranje/20 dark:bg-rijksoranje/10 dark:text-slate-300">
                    <span className="font-semibold text-rijksoranje">Waarom voor jouw vraagstuk: </span>
                    {rec.value}
                  </span>
                )}
                {fw.strength && (
                  <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Doel: </span>
                    {fw.strength}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Anker voor het laad-/analyseblok; hier scrollen we na een keuze naartoe. */}
      <div ref={analysisRef} className="scroll-mt-24">
        {/* 4. Mooi laadscherm: de AI denkt na over wat de prompt nog mist. */}
        {analyzing && (
          <div className="animate-fade-in overflow-hidden rounded-2xl border border-rijksblauw-200 bg-white shadow-sm dark:border-rijksblauw-500/30 dark:bg-slate-800">
            {/* Geanimeerde accentbalk bovenaan */}
            <div className="h-1 w-full overflow-hidden bg-rijksblauw-100 dark:bg-rijksblauw-500/20">
              <div className="h-full w-1/3 animate-loading-bar bg-gradient-to-r from-rijksblauw-400 via-rijksoranje to-rijksblauw-600" />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rijksblauw-400/30" />
                  <Search size={18} className="relative" />
                </span>
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                    Je prompt wordt geanalyseerd
                    <Loader2 size={15} className="animate-spin text-rijksblauw-500" />
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    We kijken welke onderdelen van{' '}
                    <span className="font-medium text-rijksblauw-700 dark:text-rijksblauw-200">
                      {technique?.name}
                    </span>{' '}
                    nog ontbreken in je prompt…
                  </p>
                </div>
              </div>

              {/* Skeleton-placeholders: suggereren de vragen die zo verschijnen. */}
              <div className="mt-5 space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="skeleton h-3.5 w-1/3 rounded" />
                    <div className="skeleton h-16 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. Feedback + ontbrekende velden */}
        {analysis && !analyzing && (
          <div className="animate-fade-in space-y-4 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          {analysis.summary && (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {analysis.summary}
            </p>
          )}

          {analysis.missing.length === 0 ? (
            <p className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Check size={16} /> Je prompt bevat alle benodigde onderdelen voor{' '}
              {technique?.name}. Je kunt direct optimaliseren.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Vul hieronder de ontbrekende informatie aan. Wat je leeg laat, blijft een
                plaatshouder in de uiteindelijke prompt.
              </p>
              {analysis.missing.map((m) => (
                <div key={m.id}>
                  <label className="opl-label" htmlFor={`missing-${m.id}`}>
                    {m.label}
                  </label>
                  {m.question && (
                    <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{m.question}</p>
                  )}
                  <textarea
                    id={`missing-${m.id}`}
                    className="opl-input min-h-[80px] resize-y"
                    value={answers[m.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [m.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          </div>
        )}
      </div>

      {/* 6. Genereren — pas zichtbaar na een analyse */}
      {analysis && !analyzing && (
        <div className="flex justify-end">
          <button
            type="button"
            className="opl-btn-primary px-6 py-2.5"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Optimaliseren…
              </>
            ) : (
              <>
                <Sparkles size={18} /> Genereren en optimaliseren prompt
              </>
            )}
          </button>
        </div>
      )}

      {!recommendations && !recommending && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Wand2 size={13} /> Laat eerst het beste framework zoeken; daarna vul je aan en
          optimaliseer je.
        </p>
      )}
    </div>
  );
}
