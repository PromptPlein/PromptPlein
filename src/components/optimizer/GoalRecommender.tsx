import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ClipboardCopy, Eraser, Info, Loader2, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import HoverPreview from '@/components/common/HoverPreview';
import { GOAL_EXAMPLES, categoryOf } from '@/data/goalExamples';
import { recommendTechniques } from '@/services/optimizeService';
import { isContextPrompt } from '@/lib/techniques';
import { stripMarkdown } from '@/lib/utils';
import type { TechniqueRecommendation } from '@/types';

// De voorbeelddoelen staan in data/goalExamples.ts, gedeeld met de doel-instap
// van de generator: dezelfde voorbeelden, waar je ze ook tegenkomt.

interface GoalRecommenderProps {
  /** Huidig geselecteerde techniek (zodat de gekozen kaart actief blijft). */
  selectedTechniqueId: string | null;
  /** Aangeroepen wanneer de gebruiker een aanbevolen techniek kiest. */
  onSelectTechnique: (id: string) => void;
  /** Huidige doelomschrijving (gecontroleerd door de pagina, voor de templatetitel). */
  goal: string;
  /** Aangeroepen wanneer de doelomschrijving wijzigt. */
  onGoalChange: (goal: string) => void;
  /**
   * Opschonen: wist het doel én alle voortgang. Aangeleverd door de pagina, die
   * de bewaarde tekst en de afgeleide state (techniek, antwoorden) beheert. Is
   * dit niet meegegeven, dan wordt de knop niet getoond.
   */
  onClear?: () => void;
  /** De instap-tabs; vallen bovenin het oranje generator-blok. */
  header?: ReactNode;
  /**
   * De "Bouw je template"-velden die ná een keuze verschijnen. Vallen binnen de
   * oranje rand, onder de aanbevelingen — zodat het veld zich daar uitbreidt.
   */
  templateBuilder?: ReactNode;
  /**
   * De volledige, handmatige techniekenlijst. Valt bewust BUITEN de oranje rand,
   * als losse kaart eronder — dit is geen advies van de generator maar een eigen
   * keuze.
   */
  manualList?: ReactNode;
}

/**
 * Slimme flow voor wie nog niet weet welke techniek te gebruiken.
 * De gebruiker beschrijft het doel; daarna worden passende technieken
 * aanbevolen waaruit de gebruiker er één kiest.
 */
export default function GoalRecommender({
  selectedTechniqueId,
  onSelectTechnique,
  goal,
  onGoalChange,
  onClear,
  header,
  templateBuilder,
  manualList,
}: GoalRecommenderProps) {
  const { techniques, techniqueById } = useReferenceData();
  const [loading, setLoading] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [recommendations, setRecommendations] = useState<TechniqueRecommendation[] | null>(null);
  // Terugkoppeling bij onzin-input: geen aanbevelingen, wél uitleg.
  const [unclearReason, setUnclearReason] = useState<string | null>(null);

  /** Kopieer een voorbeelddoel naar het klembord. */
  async function copyExample(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Voorbeeld gekopieerd.');
    } catch {
      toast.error('Kopiëren mislukt.');
    }
  }

  /** Zet een voorbeelddoel direct in het invoerveld om te testen. */
  function useExample(text: string) {
    onGoalChange(text);
    setShowExamples(false);
    toast.success('Voorbeeld ingevuld.');
  }

  /** Opschonen: wis de lokale aanbevelingen/meldingen én laat de pagina de rest leegmaken. */
  function handleClear() {
    setRecommendations(null);
    setUnclearReason(null);
    setShowExamples(false);
    onClear?.();
  }

  async function handleRecommend() {
    if (!goal.trim()) {
      toast.error('Beschrijf eerst wat je wilt bereiken.');
      return;
    }
    setLoading(true);
    setUnclearReason(null); // nieuwe poging: oude onduidelijk-melding wissen
    try {
      // Complex-vraagstuk-flow beveelt alleen losse prompttechnieken aan; complete
      // prompt frameworks (family 'context') horen bij de eigen-prompt-flow.
      const candidates = techniques.filter((t) => !isContextPrompt(t));
      const res = await recommendTechniques({ goal: goal.trim(), techniques: candidates });
      // Clarity-gate: het doel was onzin → toon uitleg i.p.v. willekeurige technieken.
      if (res.unclear) {
        setRecommendations(null);
        setUnclearReason(
          res.reason?.trim() ||
            'Je omschrijving is nog niet duidelijk genoeg. Beschrijf concreet wat je wilt bereiken.',
        );
        return;
      }
      setRecommendations(res.recommendations);
      if (res.error) toast(res.error, { icon: '⚠️' });
      if (res.recommendations.length === 0) {
        toast('Geen duidelijke match. Kies hieronder zelf een techniek.', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Aanbeveling mislukt. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  // Zodra er technieken zijn aanbevolen, groeit de oranje omranding mee om het
  // hele advies — chat + aanbevelingen + (na een keuze) de template-velden.
  const expanded = Boolean(recommendations);

  return (
    <div className="space-y-5">
      {/* Generator-blok = het advies vanuit de prompt generator: de chat + de
          aanbevolen technieken + (na een keuze) de template-velden. De oranje rand
          omsluit dit hele blok; de handmatige techniekenlijst valt er bewust
          buiten (zie onder). */}
      {/* Blauwe rand: deze doel-flow hoort bij de blauwe instap-tab ("Help mij
          met een prompt…"), zodat de gekozen optie duidelijk herkenbaar is. */}
      <div className="overflow-hidden rounded-2xl border-2 border-rijksblauw-500/60 shadow-sm dark:border-rijksblauw-500/50">
        {/* Chatdeel: de tabs (header) + het doelveld + de zoekknop. Bij een advies
            krijgt dit een scheidingslijn onder zich binnen hetzelfde blok. */}
        <div
          className={clsx(
            'overflow-hidden',
            expanded && 'border-b border-slate-200 dark:border-slate-700',
          )}
        >
          {header}
          <div className="space-y-5 bg-white p-5 dark:bg-slate-800 sm:p-6">
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="opl-label mb-0" htmlFor="goal-input">
            Wat wil je graag bereiken?
          </label>
          <button
            type="button"
            onClick={() => setShowExamples((v) => !v)}
            aria-expanded={showExamples}
            aria-controls="goal-examples"
            title="Bekijk voorbeelden"
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
          {/* Opschonen — alleen tonen als er iets te wissen valt. */}
          {onClear && goal.trim() && (
            <button
              type="button"
              onClick={handleClear}
              title="Wis je doel en begin opnieuw"
              className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-slate-700 transition-colors hover:text-rijksoranje dark:text-slate-200 dark:hover:text-rijksoranje"
            >
              <Eraser size={15} />
              <span>Opschonen</span>
            </button>
          )}
        </div>

        {/* Uitklapbaar paneel met voorbeelddoelen per prompttechniek. */}
        {showExamples && (
          <div
            id="goal-examples"
            className="animate-fade-in mb-3 space-y-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Voorbeelden van hoe je je doel kunt omschrijven. Klik op een voorbeeld om het in te
              vullen, of kopieer het.
            </p>
            {GOAL_EXAMPLES.map((ex) => {
              const CategoryIcon = categoryOf(ex).icon;
              return (
              // De doelomschrijving zelf staat niet op het kaartje; hover of
              // "Gebruik" laat hem zien.
              <HoverPreview key={ex.title} label="Doelomschrijving" text={ex.goal}>
              <div className="group rounded-lg border border-slate-200 bg-white p-2.5 transition-colors hover:border-rijksblauw-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rijksblauw-500/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rijksblauw-600 dark:text-rijksblauw-300">
                      <CategoryIcon size={12} className="shrink-0" />
                      {categoryOf(ex).label}
                    </span>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {ex.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ex.subtitle}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => void copyExample(ex.goal)}
                      title="Kopieer voorbeeld"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300"
                    >
                      <ClipboardCopy size={13} /> Kopieer
                    </button>
                    <button
                      type="button"
                      onClick={() => useExample(ex.goal)}
                      title="Gebruik dit voorbeeld in het invoerveld"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-rijksblauw-600 transition-colors hover:bg-rijksblauw-50 dark:text-rijksblauw-300 dark:hover:bg-rijksblauw-500/15"
                    >
                      <Wand2 size={13} /> Gebruik
                    </button>
                  </div>
                </div>
              </div>
              </HoverPreview>
              );
            })}
          </div>
        )}

        <textarea
          id="goal-input"
          className="opl-input min-h-[120px] resize-y"
          value={goal}
          placeholder="Bijv. ik wil een formele e-mail aan een burger vriendelijker en duidelijker laten schrijven"
          onChange={(e) => onGoalChange(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          We zoeken op basis van je doel de best passende prompttechniek(en) voor je uit.
        </p>
      </div>

      <button
        type="button"
        className="opl-btn-primary"
        onClick={handleRecommend}
        disabled={loading || !goal.trim()}
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Technieken zoeken…
          </>
        ) : (
          <>
            <Wand2 size={18} /> Vind passende technieken
          </>
        )}
      </button>
          </div>
        </div>

        {/* Adviesdeel binnen het generator-blok: de aanbevolen technieken en — na
            een keuze — de template-velden. Bij een advies witte achtergrond met
            padding, zodat het naadloos onder de chat binnen dezelfde oranje rand
            valt. */}
        <div className={clsx(expanded ? 'space-y-5 bg-white p-5 dark:bg-slate-800 sm:p-6' : 'space-y-5')}>
      {unclearReason && (
        <div
          role="alert"
          className="animate-fade-in flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Je omschrijving is nog niet duidelijk genoeg</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300/90">{stripMarkdown(unclearReason)}</p>
          </div>
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Aanbevolen technieken. Kies welke je wilt toepassen:
          </p>
          {recommendations.map((rec, idx) => {
            const technique = techniqueById(rec.id);
            if (!technique) return null;
            const active = technique.id === selectedTechniqueId;
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => onSelectTechnique(technique.id)}
                aria-pressed={active}
                className={clsx(
                  'flex w-full flex-col rounded-xl border p-4 text-left shadow-sm transition-all duration-150',
                  'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40',
                  active
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15'
                    : 'border-slate-200 bg-white hover:border-rijksblauw-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                    {idx === 0 && <Sparkles size={15} className="text-rijksoranje" />}
                    {technique.name}
                    {idx === 0 && (
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
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {stripMarkdown(rec.reason)}
                  </span>
                )}
                {rec.value && (
                  <span className="mt-2 rounded-lg border border-rijksoranje/30 bg-rijksoranje/5 p-2.5 text-xs leading-relaxed text-slate-600 dark:border-rijksoranje/20 dark:bg-rijksoranje/10 dark:text-slate-300">
                    <span className="font-semibold text-rijksoranje">Waarom voor jouw vraagstuk: </span>
                    {stripMarkdown(rec.value)}
                  </span>
                )}
                {technique.strength && (
                  <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-600 dark:text-slate-300">Doel: </span>
                    {technique.strength}
                  </span>
                )}
                {technique.use_cases && technique.use_cases.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-500 dark:text-slate-400">
                    {technique.use_cases.slice(0, 3).map((uc, i) => (
                      <li key={i}>{uc}</li>
                    ))}
                  </ul>
                )}
                <span className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  {technique.follow_up_questions.length} in te vullen veld
                  {technique.follow_up_questions.length === 1 ? '' : 'en'}
                </span>
              </button>
            );
          })}
        </div>
      )}

          {/* Na een keuze: de template-velden breiden zich hier uit, binnen de rand. */}
          {templateBuilder}
        </div>
      </div>

      {/* Handmatige keuze — bewust BUITEN de oranje rand: niet het advies van de
          generator, maar de volledige lijst voor wie zelf een techniek wil kiezen. */}
      {manualList}
    </div>
  );
}
