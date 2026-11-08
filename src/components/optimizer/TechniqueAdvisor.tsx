import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Compass,
  Eraser,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from '@/components/common/icons';
import { adviseTechnique } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import { isContextPrompt, isSkillCreator } from '@/lib/techniques';
import type { AdvisorAdvies, AdvisorCandidate, AdvisorQuestion, Technique } from '@/types';

/** Zelfde budget als in de edge function; alleen voor de voortgangsregel. */
const MAX_QUESTIONS = 4;

/**
 * De antwoordopties bij de allereerste vraag, vast in de code.
 *
 * Bij vraag 1 zonder startpunt weet de AI nog niets, en dan verzint hij
 * werkwoorden: "een tekst schrijven", "een advies geven", "een analyse maken".
 * Die kosten een beurt en leveren niets op, want élke techniek kan daaronder
 * vallen. De opties hieronder noemen daarom niet wat de gebruiker máákt maar de
 * situatie waarin hij zit, en juist de situatie bepaalt de techniek: dat er al
 * geslaagde voorbeelden liggen, dat de vorm vastligt, dat er tegen criteria
 * beoordeeld wordt, dat een fout duur is.
 *
 * Bewust in gewone werktaal en zonder techniek-namen: wie wist welke techniek
 * hij nodig had, had deze knop niet aangeklikt. Vanaf vraag 2 verzint de AI de
 * opties weer zelf, want dan heeft hij context en kan hij scherper zijn dan
 * welke vaste lijst ook.
 */
const OPENING_OPTIONS = [
  // -> werken met voorbeelden (er ligt al geslaagd werk om na te volgen)
  'een tekst zoals we die altijd sturen',
  // -> gestructureerde uitvoer (de vorm ligt vast)
  'een stuk in ons vaste sjabloon',
  // -> toetsen aan een kader (er wordt gescoord tegen criteria)
  'iets beoordelen tegen vaste criteria',
  // -> het werk laten natrekken (een fout is duur)
  'een concept nakijken op fouten',
  // -> binden aan bronnen (het antwoord moet uit de stukken komen)
  'vragen beantwoorden uit een dossier',
  // -> eerst uitzoomen (de oplossing ligt vast, het probleem niet)
  'uitzoeken of we het juiste probleem oplossen',
];

interface TechniqueAdvisorProps {
  /**
   * De volledige lijst; de adviseur filtert er zelf de losse technieken uit.
   * Prompt frameworks (CARE, CRISPE, CO-STAR) doen bewust niet mee: dit scherm
   * gaat alleen over de vraag welke TECHNIEK bij het vraagstuk past.
   */
  techniques: Technique[];
  settings: AiSettings;
  /** Wat de gebruiker eventueel al had opgeschreven; scheelt een vraag. */
  start?: string;
  /**
   * De gebruiker neemt het advies over: dit doet precies hetzelfde als zelf op
   * de techniek klikken, met de context uit het gesprek er alvast bij.
   */
  onChoose: (technique: Technique, context: string) => void;
  onClose: () => void;
}

/**
 * Adviseert welke prompttechniek of welk framework past bij het vraagstuk van
 * de gebruiker, via een kort gesprek van hoogstens vier vragen.
 *
 * Waarom een gesprek en geen keuzemenu: de lijst telt bijna twintig technieken
 * die elkaar op één punt tegelijk uitsluiten. Welke vraag onderscheid maakt
 * hangt dus af van wat de vorige antwoorden al hebben laten afvallen. De AI
 * weegt daarom na élk antwoord opnieuw (zie de tussenstand onderin) en leidt de
 * volgende vraag af uit het verschil tussen de overgebleven kandidaten. Blijft
 * het na een antwoord dicht bij elkaar, dan gaat de volgende vraag dieper op
 * datzelfde punt in plaats van naar een nieuw onderwerp.
 *
 * Het gesprek gaat nooit over prompt-engineering: de gebruiker beschrijft zijn
 * werk, de AI vertaalt dat naar een techniek. Wie wist welke techniek hij nodig
 * had, had deze knop niet aangeklikt.
 */
export default function TechniqueAdvisor({
  techniques,
  settings,
  start,
  onChoose,
  onClose,
}: TechniqueAdvisorProps) {
  // Alleen losse technieken. Filteren bij de bron in plaats van het antwoord
  // achteraf opschonen: wat de AI niet in zijn lijst ziet, kan hij ook niet
  // adviseren, en hij verspilt er geen vraag aan.
  const options = techniques.filter((t) => !isContextPrompt(t) && !isSkillCreator(t));

  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [question, setQuestion] = useState<AdvisorQuestion | null>(null);
  const [candidates, setCandidates] = useState<AdvisorCandidate[]>([]);
  const [redenering, setRedenering] = useState('');
  const [advies, setAdvies] = useState<AdvisorAdvies | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // React draait effects in ontwikkelmodus dubbel; zonder deze vlag zou het
  // gesprek met twee openingsvragen tegelijk beginnen.
  const startedRef = useRef(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Eén beurt: stuur het gesprek tot nu toe op en verwerk wat er terugkomt:
   * een volgende vraag of het advies.
   */
  async function runTurn(next: { question: string; answer: string }[], finish = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await adviseTechnique({
        start: start?.trim() || undefined,
        turns: next,
        techniques: options,
        finish,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success) {
        setError(res.error ?? 'Het advies kon niet worden opgehaald.');
        return;
      }
      setRedenering(res.redenering);
      setCandidates(res.kandidaten);
      if (res.klaar && res.advies) {
        setAdvies(res.advies);
        setQuestion(null);
      } else if (res.vraag) {
        // Bij de openingsvraag zonder startpunt vervangen we de opties van de
        // AI door de vaste set (zie OPENING_OPTIONS): op dat moment weet het
        // model nog niets en levert het alleen werkwoorden op. De vraagtekst
        // zelf blijft van de AI. Vanaf vraag 2 verandert er niets.
        const opening = next.length === 0 && !start?.trim();
        setQuestion(opening ? { ...res.vraag, opties: OPENING_OPTIONS } : res.vraag);
        setAnswer('');
        requestAnimationFrame(() => answerRef.current?.focus());
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runTurn([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Beantwoord de openstaande vraag en laat de AI opnieuw wegen. */
  function submit(text: string) {
    const value = text.trim();
    if (!value || !question || busy) return;
    const next = [...turns, { question: question.tekst, answer: value }];
    setTurns(next);
    setQuestion(null);
    void runTurn(next);
  }

  /** Opnieuw beginnen met een leeg gesprek. */
  function restart() {
    setTurns([]);
    setQuestion(null);
    setCandidates([]);
    setRedenering('');
    setAdvies(null);
    setAnswer('');
    void runTurn([]);
  }

  const byId = (id: string) => options.find((t) => t.id === id) ?? null;
  const geadviseerd = advies ? byId(advies.id) : null;
  // De alternatieven zijn de overige kandidaten uit de laatste weging: wie het
  // advies niet vertrouwt ziet meteen wat er als tweede uit kwam, in plaats van
  // terug te moeten naar een lijst van twintig.
  const alternatieven = advies
    ? candidates.filter((k) => k.id !== advies.id && byId(k.id)).slice(0, 2)
    : [];

  return (
    <section className="animate-fade-in scroll-mt-24 overflow-hidden rounded-2xl border border-pleingroen/40 bg-white shadow-sm dark:border-pleingroen/30 dark:bg-slate-800">
      <div className="h-1 w-full bg-pleingroen" />
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pleingroen text-slate-950">
              <Compass size={14} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                De AI zoekt je techniek erbij
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {advies
                  ? 'Op basis van je antwoorden past deze techniek het best.'
                  : `Hooguit ${MAX_QUESTIONS} korte vragen over je taak. Na elk antwoord weegt de AI opnieuw.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Sluiten en zelf een techniek kiezen"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p>{error}</p>
              <button
                type="button"
                className="mt-1 font-medium underline"
                onClick={() => void runTurn(turns)}
              >
                Opnieuw proberen
              </button>
            </div>
          </div>
        )}

        {/* Het gesprek tot nu toe: kort, zodat je ziet wat je hebt gezegd en de
            AI dus op meeweegt. */}
        {turns.length > 0 && (
          <ol className="mb-4 space-y-1.5">
            {turns.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="text-slate-500 dark:text-slate-400">{t.question}</span>{' '}
                <span className="font-medium text-slate-800 dark:text-slate-100">{t.answer}</span>
              </li>
            ))}
          </ol>
        )}

        {busy && (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            <Loader2 size={16} className="animate-spin text-pleingroen" />
            {turns.length === 0 ? 'De AI kijkt naar je vraagstuk…' : 'De AI weegt je antwoord…'}
          </p>
        )}

        {/* De openstaande vraag. */}
        {!busy && !advies && question && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-pleingroen">
              Vraag {turns.length + 1} van maximaal {MAX_QUESTIONS}
            </p>
            <p className="mt-1 text-base font-medium text-slate-800 dark:text-slate-100">
              {question.tekst}
            </p>
            {question.waarom && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{question.waarom}</p>
            )}

            {question.opties.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {question.opties.map((optie) => (
                  <button
                    key={optie}
                    type="button"
                    onClick={() => submit(optie)}
                    className="rounded-full border border-rijksblauw-200 bg-rijksblauw-50/60 px-3 py-1.5 text-sm text-rijksblauw-700 transition-colors hover:border-pleingroen hover:bg-pleingroen/10 hover:text-pleingroen dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10 dark:text-rijksblauw-200 dark:hover:border-pleingroen/60 dark:hover:text-pleingroen"
                  >
                    {optie}
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={answerRef}
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(answer);
                }
              }}
              placeholder="Of typ je eigen antwoord…"
              className="opl-input mt-3 resize-y text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <button
                  type="button"
                  className="text-sm font-medium text-slate-500 hover:text-pleingroen hover:underline dark:text-slate-400"
                  onClick={() => void runTurn(turns, true)}
                >
                  Sla de rest over en adviseer nu
                </button>
                {/* Ook midden in het gesprek te wissen: wie merkt dat hij de
                    eerste vraag verkeerd las, moet niet vier vragen hoeven
                    uitzitten om er vanaf te komen. */}
                {turns.length > 0 && (
                  <button
                    type="button"
                    onClick={restart}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-pleingroen hover:underline dark:text-slate-400"
                  >
                    <Eraser size={14} /> Opnieuw beginnen
                  </button>
                )}
              </div>
              <button
                type="button"
                className="opl-btn-primary"
                disabled={!answer.trim()}
                onClick={() => submit(answer)}
              >
                Volgende <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Het advies: één techniek, plus wat er als tweede uit kwam. */}
        {!busy && advies && geadviseerd && (
          <div>
            <button
              type="button"
              onClick={() => onChoose(geadviseerd, advies.context)}
              className="w-full rounded-xl border-2 border-pleingroen bg-pleingroen/5 p-4 text-left transition-colors hover:bg-pleingroen/10 dark:bg-pleingroen/10"
            >
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pleingroen text-slate-950">
                  <Check size={12} />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-pleingroen">
                  Prompttechniek
                </span>
              </span>
              <span className="mt-1.5 block text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
                {geadviseerd.name}
              </span>
              {advies.reden && (
                <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">
                  {advies.reden}
                </span>
              )}
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-pleingroen">
                <Sparkles size={15} /> Hiermee verder
              </span>
            </button>

            {advies.context && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Je context wordt alvast ingevuld: &ldquo;{advies.context}&rdquo;
              </p>
            )}

            {alternatieven.length > 0 && (
              <div className="mt-4">
                <p className="opl-label mb-2">Twijfelt de AI? Dit kwam er ook uit</p>
                <div className="space-y-2">
                  {alternatieven.map((k) => {
                    const t = byId(k.id)!;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => onChoose(t, advies.context)}
                        className="w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-pleingroen/50 hover:bg-pleingroen/5 dark:border-slate-700 dark:hover:border-pleingroen/40"
                      >
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {t.name}
                        </span>
                        {k.waarom && (
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                            {k.waarom}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={restart}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-pleingroen hover:underline dark:text-slate-400"
            >
              <RotateCcw size={14} /> Opnieuw beginnen
            </button>
          </div>
        )}

        {/* De tussenstand van de weging. Staat er bewust bij tijdens het
            gesprek: zo zie je je antwoord de rangschikking verschuiven, en
            waarom er nog een vraag komt.

            Pas ná het eerste antwoord: bij de openingsvraag heeft de gebruiker
            nog niets verteld, dus is er niets gewogen. Het model vult die kolom
            dan met een gok, en een percentage naast een techniek suggereert een
            analyse die er nog niet is. */}
        {!advies && turns.length > 0 && candidates.length > 0 && (
          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Tussenstand
            </p>
            {redenering && (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{redenering}</p>
            )}
            <ul className="mt-2 space-y-1.5">
              {candidates.map((k) => {
                const t = byId(k.id);
                if (!t) return null;
                return (
                  <li key={k.id} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 truncate text-sm text-slate-700 dark:text-slate-200">
                      {t.name}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <span
                        className="block h-full rounded-full bg-pleingroen"
                        style={{ width: `${Math.max(4, k.zekerheid)}%` }}
                      />
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {k.zekerheid}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
