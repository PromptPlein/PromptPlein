import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FlaskConical, Loader2, Maximize2, Minimize2, Play, Sparkles, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import useChatController from '@/components/chat/useChatController';
import { refinePrompt, suggestRefinements } from '@/services/optimizeService';
import { writeResultSnapshot } from '@/services/handoffService';
import type { AiSettings, ChatSettings } from '@/services/settingsService';
import type { OptimizeResult, Technique } from '@/types';

/**
 * Snelle feedbackpunten. Een klik zet de bijbehorende instructie letterlijk in
 * het feedbackveld, zodat de gebruiker ziet wat er straks naar de AI gaat en de
 * zin nog kan bijschaven. "Verkeerde toon" alleen zegt de AI te weinig; de
 * uitgeschreven instructie zegt wél wat er aan de prompt moet veranderen.
 */
const FEEDBACK_CHIPS: { label: string; instruction: string }[] = [
  {
    label: 'Te lang',
    instruction:
      'Het antwoord is te lang. Zet in de prompt een harde lengtegrens en vraag om alleen de kern, zonder inleiding, herhaling en samenvattende slotzin.',
  },
  {
    label: 'Te kort',
    instruction:
      'Het antwoord is te kort. Vraag in de prompt om een uitgewerkt antwoord: per punt een korte toelichting en een concreet voorbeeld, met een minimale omvang.',
  },
  {
    label: 'Verkeerde toon',
    instruction:
      'De toon klopt niet. Leg in de prompt vast welke toon en aanspreekvorm het antwoord moet hebben, voor welke lezer dat is, en welke toon juist niet past.',
  },
  {
    label: 'Mist context',
    instruction:
      'Er ontbreekt context. Neem in de prompt op wie de lezer is, waar de tekst gebruikt wordt en welke feiten, kaders of voorwaarden verplicht meemoeten.',
  },
  {
    label: 'Te algemeen',
    instruction:
      'Het antwoord blijft te algemeen. Vraag in de prompt om een uitwerking op mijn eigen situatie, met concrete namen, cijfers en voorbeelden, en verbied algemene open deuren.',
  },
  {
    label: 'Verkeerde vorm',
    instruction:
      'De vorm klopt niet. Schrijf in de prompt precies voor hoe het antwoord eruit moet zien: lopende tekst of opsomming, welke kopjes, welke volgorde en of er een tabel of samenvatting bij hoort.',
  },
  {
    label: 'Te veel jargon',
    instruction:
      'Er staat te veel jargon in. Vraag in de prompt om gewone woorden op B1-niveau, korte zinnen, en leg vaktermen die echt nodig zijn bij het eerste gebruik in één zin uit.',
  },
  {
    label: 'Mist voorbeelden',
    instruction:
      'Het antwoord blijft abstract. Vraag in de prompt om bij elk punt een concreet voorbeeld uit mijn praktijk, zodat duidelijk is hoe het er echt uitziet.',
  },
  {
    label: 'Klopt niet',
    instruction:
      'Er staan dingen in die niet kloppen. Leg in de prompt vast dat het antwoord alleen mag steunen op wat ik aanlever, dat het niets mag verzinnen en dat het bij ontbrekende informatie moet zeggen wat het niet weet.',
  },
  {
    label: 'Beantwoordt mijn vraag niet',
    instruction:
      'Het antwoord gaat langs mijn vraag heen. Zet de vraag in de prompt vooraan als de opdracht, benoem wat er beslist beantwoord moet worden, en verbied uitweidingen die daar niet aan bijdragen.',
  },
];

/**
 * Een voorstel op maat: de AI leest de prompt én het testantwoord en benoemt een
 * gebrek dat in dit specifieke antwoord zit. Zelfde vorm als een vast punt, dus
 * aanklikken werkt hetzelfde.
 */
type FeedbackChip = { label: string; instruction: string };

/** localStorage-sleutel voor de zelfgekozen hoogte van het antwoordvenster. */
const HEIGHT_KEY = 'promptTesterHeight';
/** Grenzen van dat venster: klein genoeg voor een laptop, groot genoeg om te lezen. */
const MIN_HEIGHT = 280;
const MAX_HEIGHT = 1000;
/** Stapgrootte van de knoppen "kleiner"/"groter". */
const HEIGHT_STEP = 160;

function clampHeight(px: number): number {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(px)));
}

/**
 * Beginhoogte van het antwoordvenster: ruim genoeg om een echt antwoord te lezen
 * zonder direct te scrollen, maar nooit meer dan het scherm aankan. Een eerder
 * zelf ingestelde hoogte gaat vóór — dat is een voorkeur, geen toevalligheid.
 */
function initialHeight(): number {
  if (typeof window === 'undefined') return 520;
  const saved = Number(window.localStorage.getItem(HEIGHT_KEY));
  if (Number.isFinite(saved) && saved >= MIN_HEIGHT) return clampHeight(saved);
  return clampHeight(Math.min(640, Math.max(420, window.innerHeight * 0.55)));
}

interface TestRoomProps {
  /** De getoonde (actieve) versie van de gegenereerde prompt. */
  result: OptimizeResult;
  /** De techniek van het resultaat — gaat mee in het login-snapshot. */
  technique?: Technique | null;
  /** Chat-instellingen (kill-switch, provider, model) van de beheerder. */
  chatSettings: ChatSettings | null;
  /** Generator-instellingen: de refine draait op de optimizer-provider. */
  aiSettings?: AiSettings;
  /** Context van het aangehaakte chatproject; zie ProjectContextBar. */
  projectContext?: string;
  /**
   * Een verbeterde versie is klaar: de aanroeper voegt hem toe aan de
   * versiegeschiedenis en maakt hem actief. Ontbreekt dit, dan is er alleen
   * testen (geen verbeter-paneel).
   */
  onRefined?: (result: OptimizeResult) => void;
}

/**
 * De prompt tester: een ingebed uitvoergesprek direct onder de gegenereerde prompt.
 * De prompt draait hier meteen (ephemeer — niets wordt bewaard, zie
 * useChatController met `ephemeral`), de gebruiker ziet het echte antwoord en
 * stuurt met feedback een gerichte verbetering aan — de bouw-test-verbeter-lus
 * zonder de pagina te verlaten. Dit is de "Fase 3" waar useChatController
 * destijds als hook voor is gebouwd.
 */
export default function TestRoom({
  result,
  technique,
  chatSettings,
  aiSettings,
  projectContext,
  onRefined,
}: TestRoomProps) {
  const { isAuthenticated, configured } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Het blok zelf, zodat we het na het openklappen in beeld kunnen brengen.
  const panelRef = useRef<HTMLDivElement>(null);

  // Hoogte van het antwoordvenster. De gebruiker kan hem met de knoppen zetten
  // of de onderrand slepen; beide landen hier, zodat de keuze bewaard blijft.
  const [height, setHeight] = useState(initialHeight);
  const answerBoxRef = useRef<HTMLDivElement>(null);

  /**
   * Een handmatige sleep zet de hoogte rechtstreeks op het element. Zonder deze
   * synchronisatie zou de eerstvolgende render (en die volgen elkaar snel op
   * tijdens het streamen) de oude hoogte er weer overheen zetten en het venster
   * terugklappen. We nemen de gesleepte hoogte daarom over als nieuwe waarde.
   */
  useEffect(() => {
    const el = answerBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const measured = el.offsetHeight;
      setHeight((prev) => (Math.abs(prev - measured) > 1 ? clampHeight(measured) : prev));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // De gekozen hoogte onthouden voor een volgende prompt.
  useEffect(() => {
    try {
      window.localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      /* privémodus of vol quotum: de hoogte geldt dan alleen deze sessie */
    }
  }, [height]);

  /**
   * Openen/sluiten. Bij openen scrollen we het blok naar boven in beeld: de
   * tester staat onder een lange prompt, dus de chat die eronder uitklapt valt
   * anders buiten het scherm en lijkt er niets te gebeuren.
   */
  function toggleOpen() {
    setOpen((wasOpen) => {
      if (!wasOpen) {
        // Wachten tot het paneel gerenderd is; anders scrollen we naar de
        // hoogte van de nog ingeklapte kop.
        requestAnimationFrame(() => {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return !wasOpen;
    });
  }

  const enabled = chatSettings?.enabled !== false && configured;
  const controller = useChatController(chatSettings, { ephemeral: true, kind: 'execution' });

  // Welke promptversie als laatste in dit gesprek is gedraaid. Eén automatische
  // run per openklap; een nieuwe (verbeterde) versie draait pas na een klik —
  // geen stille AI-aanroepen bij elke wijziging.
  const testedPromptRef = useRef<string | null>(null);
  const prompt = result.optimized_content;

  const { conversation, streaming, sendInNewConversation } = controller;
  useEffect(() => {
    // Pas starten als álles er is: instellingen (anders no-opt send() en zou de
    // ref de run onterecht als gedaan markeren), gesprek en een niet-lopende
    // stream.
    if (!open || !enabled || !isAuthenticated || !chatSettings) return;
    if (!conversation || streaming) return;
    if (testedPromptRef.current !== null || conversation.messages.length > 0) return;
    testedPromptRef.current = prompt;
    sendInNewConversation(prompt);
  }, [open, enabled, isAuthenticated, chatSettings, conversation, streaming, prompt, sendInNewConversation]);

  // Verbeter-paneel
  const [chips, setChips] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineStream, setRefineStream] = useState('');
  // Voorstellen op maat bij dit testantwoord, plus de sleutel (prompt+antwoord)
  // waarvoor ze zijn opgehaald, zodat elke testrun er precies één ophaalt.
  const [suggestions, setSuggestions] = useState<FeedbackChip[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const suggestedKeyRef = useRef<string | null>(null);
  // Het blok "test de nieuwe versie" na een verbetering, plus de vlag die zegt
  // dat we er net naartoe moeten scrollen.
  const retestRef = useRef<HTMLDivElement>(null);
  const [awaitingRetest, setAwaitingRetest] = useState(false);

  const messages = controller.conversation?.messages ?? [];
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content.trim() && !m.error);
  const untestedVersion = testedPromptRef.current !== null && testedPromptRef.current !== prompt;
  const canRefine = Boolean(onRefined && lastAssistant && !controller.streaming && !refining);
  // De vaste punten en de voorstellen gedragen zich hetzelfde; alleen de rij
  // waarin ze staan verschilt. Voor het aanvullen van ontbrekende instructies
  // bij het versturen tellen ze dus samen.
  const allChips: FeedbackChip[] = [...FEEDBACK_CHIPS, ...suggestions];

  /**
   * Voorstellen op maat ophalen zodra er een afgerond testantwoord ligt. De
   * vaste punten dekken de gebreken die elk antwoord kan hebben; wat er in dít
   * antwoord misgaat weet alleen een lezer die de prompt naast het resultaat
   * legt. Eén ophaalactie per testrun (de sleutel bewaakt dat), en mislukken is
   * stil: de vaste punten staan er nog.
   */
  const answerText = lastAssistant?.content ?? '';
  useEffect(() => {
    if (!onRefined || !answerText || streaming || untestedVersion) return;
    const key = `${prompt} ${answerText}`;
    if (suggestedKeyRef.current === key) return;
    suggestedKeyRef.current = key;
    let cancelled = false;
    setSuggesting(true);
    setSuggestions([]);
    void suggestRefinements({
      prompt,
      testAnswer: answerText,
      knownLabels: FEEDBACK_CHIPS.map((c) => c.label),
      preferredProvider: aiSettings?.provider,
      preferredModel: aiSettings?.model,
      projectContext,
    }).then((res) => {
      setSuggesting(false);
      if (cancelled) return;
      // Dubbelingen met een vast punt vallen af; de AI hoort ze al over te slaan.
      const fixed = new Set(FEEDBACK_CHIPS.map((c) => c.label.toLowerCase()));
      setSuggestions(res.suggestions.filter((s) => !fixed.has(s.label.toLowerCase())));
    });
    return () => {
      cancelled = true;
    };
  }, [onRefined, prompt, answerText, streaming, untestedVersion, aiSettings, projectContext]);

  /**
   * Na een verbetering staat de gebruiker onderaan bij het verbeter-paneel. Breng
   * de test-actie voor de nieuwe versie dan zelf in beeld, zodat niemand hoeft te
   * zoeken waar hij opnieuw kan testen.
   */
  useEffect(() => {
    if (!awaitingRetest || !untestedVersion) return;
    retestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setAwaitingRetest(false);
  }, [awaitingRetest, untestedVersion]);

  function runTest() {
    if (controller.streaming || refining) return;
    setAwaitingRetest(false);
    // De voorstellen horen bij het vorige antwoord; die gelden nu niet meer.
    setSuggestions([]);
    testedPromptRef.current = prompt;
    controller.sendInNewConversation(prompt);
  }

  /**
   * Aan- of uitzetten van een feedbackpunt. De instructie komt als eigen regel
   * in het tekstvak te staan (en gaat er bij uitzetten weer uit), zodat de
   * gebruiker leest wat hij de AI opdraagt in plaats van alleen een pil te zien
   * oplichten.
   */
  function toggleChip(chip: FeedbackChip) {
    const active = chips.includes(chip.label);
    setChips((cur) => (active ? cur.filter((c) => c !== chip.label) : [...cur, chip.label]));
    setFeedbackText((cur) => {
      if (active) {
        const rest = cur
          .split('\n')
          .filter((line) => line.trim() !== chip.instruction)
          .join('\n');
        return rest.trim() ? rest : '';
      }
      if (cur.includes(chip.instruction)) return cur;
      return cur.trim() ? `${cur.trimEnd()}\n${chip.instruction}` : chip.instruction;
    });
  }

  async function submitRefine() {
    if (!canRefine || !onRefined) return;
    const typed = feedbackText.trim();
    // Normaal staan de aangevinkte instructies al in het tekstvak; alleen als de
    // gebruiker ze eruit heeft gehaald vullen we ze hier alsnog aan.
    const missing = allChips
      .filter((c) => chips.includes(c.label) && !typed.includes(c.instruction))
      .map((c) => c.instruction);
    const feedback = [typed, ...missing].filter(Boolean).join('\n');
    if (!feedback) {
      toast.error('Geef aan wat er beter moet: kies een punt of schrijf het kort op.');
      return;
    }
    setRefining(true);
    setRefineStream('');
    const res = await refinePrompt({
      previousPrompt: prompt,
      testAnswer: lastAssistant?.content ?? '',
      feedback,
      preferredProvider: aiSettings?.provider,
      preferredModel: aiSettings?.model,
      projectContext,
      temperature: aiSettings?.temperature,
      onChunk: setRefineStream,
    });
    setRefining(false);
    setRefineStream('');
    if (!res.success) {
      toast.error(res.error ?? 'De prompt kon niet worden verbeterd.');
      return;
    }
    setChips([]);
    setFeedbackText('');
    toast.success('Verbeterde versie klaar. Test hem opnieuw om het verschil te zien.');
    setAwaitingRetest(true);
    onRefined(res);
  }

  /**
   * Inloggen vanuit de prompt tester: bewaar het resultaat éérst als snapshot in
   * sessionStorage, zodat de generator het na de login-roundtrip kan herstellen
   * in plaats van leeg te openen.
   */
  function goLogin() {
    writeResultSnapshot(result, technique?.id ?? null);
    navigate('/auth/login', { state: { from: '/genereren' } });
  }

  return (
    /* Nadrukkelijk oranje omrand blok: de prompt tester is de logische
       vervolgstap na het genereren, maar werd als grijze uitklapregel over het
       hoofd gezien. Dezelfde oranje accentkleur als de generator zelf, met een
       echte knop ernaast in plaats van alleen een chevron. */
    <div
      ref={panelRef}
      className={clsx(
        // scroll-mt houdt het blok vrij van de sticky paginakop bij het scrollen.
        'scroll-mt-24 overflow-hidden rounded-2xl border-2 transition-colors',
        open
          ? 'border-rijksoranje/60 bg-white dark:bg-slate-800'
          : 'border-rijksoranje/60 bg-rijksoranje/5 hover:bg-rijksoranje/10 dark:bg-rijksoranje/10 dark:hover:bg-rijksoranje/15',
      )}
    >
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls="prompt-tester-panel"
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
      >
        <span className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rijksoranje/15 text-rijksoranje">
            <FlaskConical size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-slate-800 dark:text-slate-100">
              Prompt tester
            </span>
            <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">
              Voer je prompt hier meteen uit en zie het echte antwoord. Niet tevreden? Verbeter hem
              met één klik.
            </span>
          </span>
        </span>

        {/* Ziet eruit als een knop, maar de hele kop is de klikzone — vandaar
            span in plaats van een geneste button. */}
        <span
          className={clsx(
            'hidden shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors sm:inline-flex',
            open
              ? 'text-slate-600 hover:text-rijksoranje dark:text-slate-300'
              : 'bg-rijksoranje text-white hover:bg-rijksoranje-dark',
          )}
        >
          {open ? (
            <>
              Verbergen <ChevronDown size={16} className="rotate-180" />
            </>
          ) : (
            <>
              <Play size={16} /> Prompt testen
            </>
          )}
        </span>
        <ChevronDown
          size={20}
          className={clsx(
            'shrink-0 text-rijksoranje transition-transform sm:hidden',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          id="prompt-tester-panel"
          className="animate-fade-in border-t border-rijksoranje/30 dark:border-rijksoranje/25"
        >
          {!enabled ? (
            <p className="px-4 py-4 text-sm text-amber-700 dark:text-amber-400">
              {!configured
                ? 'Er is geen AI-service geconfigureerd in deze omgeving.'
                : 'De beheerder heeft de chat uitgeschakeld; testen kan daardoor nu niet.'}
            </p>
          ) : !isAuthenticated ? (
            <div className="space-y-3 px-4 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Log in om je prompt hier direct te testen. Je gegenereerde prompt blijft bewaard en
                staat na het inloggen weer voor je klaar.
              </p>
              <button type="button" className="opl-btn-primary" onClick={goLogin}>
                Inloggen om te testen
              </button>
            </div>
          ) : !chatSettings ? (
            <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" /> De prompt tester wordt geladen…
            </p>
          ) : (
            <div className="flex flex-col">
              {/* Nieuwe (verbeterde) versie nog niet getest: bied de herstart aan
                  in plaats van hem stilletjes te draaien. */}
              {untestedVersion && !controller.streaming && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-rijksblauw-50/50 px-4 py-2.5 dark:border-slate-700 dark:bg-rijksblauw-500/10">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Dit testgesprek hoort bij een eerdere versie van je prompt.
                  </p>
                  <button
                    type="button"
                    className="opl-btn-secondary shrink-0 px-3 py-1.5 text-xs"
                    onClick={runTest}
                    disabled={refining}
                  >
                    <Play size={14} /> Test deze versie
                  </button>
                </div>
              )}

              {/* Regelbalk voor de leeshoogte: het antwoord is de reden dat je hier
                  bent, dus het moet groot genoeg te maken zijn. */}
              <div className="flex items-center justify-end gap-1.5 border-b border-slate-200 px-4 py-1.5 dark:border-slate-700">
                <span className="mr-auto hidden text-[11px] text-slate-400 dark:text-slate-500 sm:block">
                  Sleep de onderrand van het antwoord om zelf te schalen
                </span>
                <button
                  type="button"
                  onClick={() => setHeight((h) => clampHeight(h - HEIGHT_STEP))}
                  disabled={height <= MIN_HEIGHT}
                  title="Kleiner weergeven"
                  aria-label="Antwoordvenster kleiner maken"
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  <Minimize2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setHeight((h) => clampHeight(h + HEIGHT_STEP))}
                  disabled={height >= MAX_HEIGHT}
                  title="Groter weergeven"
                  aria-label="Antwoordvenster groter maken"
                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-rijksblauw-600 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  <Maximize2 size={15} />
                </button>
              </div>

              {/* Alleen het antwoordvenster schaalt mee; de invoerbalk eronder
                  houdt zijn eigen hoogte, zodat de sleepgreep nooit over de
                  verstuurknop valt. */}
              <div
                ref={answerBoxRef}
                className="flex resize-y flex-col overflow-hidden"
                // min/max ook in CSS, zodat het slepen zelf binnen dezelfde
                // grenzen blijft als de knoppen.
                style={{ height, minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
              >
                <ChatMessageList
                  messages={messages}
                  streaming={controller.streaming}
                  expectedProvider={chatSettings.provider}
                  onRetry={controller.retry}
                />
              </div>

              {/* Verbeter-paneel: pas zichtbaar zodra er een echt testantwoord
                  ligt om feedback op te geven. */}
              {canRefine && !untestedVersion && (
                <div className="space-y-2.5 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Niet tevreden met het resultaat? Verbeter je prompt
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {FEEDBACK_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => toggleChip(chip)}
                        aria-pressed={chips.includes(chip.label)}
                        title={chip.instruction}
                        className={clsx(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          chips.includes(chip.label)
                            ? 'border-rijksblauw-500 bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200'
                            : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300',
                        )}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>

                  {/* Voorstellen op maat: de vaste punten gelden voor elk
                      antwoord, deze gaan over wat er in dít antwoord misgaat.
                      Ze staan in een eigen rij en in de accentkleur, zodat
                      zichtbaar is dat de AI ze bij dit resultaat heeft bedacht. */}
                  {suggesting && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 size={13} className="animate-spin" />
                      De AI leest je prompt naast dit antwoord en zoekt verbeterpunten…
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rijksoranje">
                        <Sparkles size={13} /> Opgevallen in dit antwoord
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => toggleChip(chip)}
                            aria-pressed={chips.includes(chip.label)}
                            title={chip.instruction}
                            className={clsx(
                              'rounded-full border px-2.5 py-1 text-left text-xs transition-colors',
                              chips.includes(chip.label)
                                ? 'border-rijksoranje bg-rijksoranje/15 text-rijksoranje-dark dark:text-rijksoranje'
                                : 'border-rijksoranje/50 text-slate-600 hover:border-rijksoranje hover:bg-rijksoranje/5 dark:text-slate-300',
                            )}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    className="opl-input w-full resize-y text-sm"
                    rows={3}
                    placeholder="Kies hierboven een punt, of schrijf zelf op wat er anders moet. Bijv. 'het antwoord mist de doelgroep ouderen'"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Een punt aanklikken zet de instructie in het tekstvak. Pas hem gerust aan; dit is
                    precies wat de AI meekrijgt.
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="opl-btn-primary px-3 py-1.5 text-xs"
                      onClick={() => void submitRefine()}
                      disabled={!canRefine}
                    >
                      <Wand2 size={14} /> Verbeter prompt
                    </button>
                  </div>
                </div>
              )}

              {/* Na "Verbeter prompt" staat de gebruiker hier onderaan. De
                  vervolgstap hoort dus op dezelfde plek te staan, groot en
                  oranje, en niet als klein regeltje bovenaan het paneel. */}
              {untestedVersion && !controller.streaming && !refining && (
                <div
                  ref={retestRef}
                  className="animate-fade-in flex flex-wrap items-center justify-between gap-3 border-t-2 border-rijksoranje/50 bg-rijksoranje/10 px-4 py-4 dark:bg-rijksoranje/15"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Je prompt is verbeterd. Test hem opnieuw.
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      Het antwoord hierboven komt nog van de vorige versie. Draai de nieuwe versie om
                      te zien of het nu wel klopt.
                    </p>
                  </div>
                  <button type="button" className="opl-btn-accent shrink-0" onClick={runTest}>
                    <Play size={16} /> Test de nieuwe versie
                  </button>
                </div>
              )}

              {/* De herschreven template komt streamend binnen; meelezen scheelt
                  gevoelde wachttijd, net als bij het genereren zelf. */}
              {refining && (
                <div className="space-y-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    Je prompt wordt herschreven op basis van je feedback…
                  </p>
                  {refineStream && (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {refineStream}
                    </pre>
                  )}
                </div>
              )}

              <ChatComposer
                disabled={!enabled || refining}
                streaming={controller.streaming}
                extracting={controller.extracting}
                attachments={[]}
                allowAttachments={false}
                onSend={(text) => void controller.send(text)}
                onStop={controller.stop}
                onAddFile={() => undefined}
                onRemoveAttachment={() => undefined}
                badge={
                  <ChatModelBadge
                    provider={chatSettings.provider}
                    model={chatSettings.model}
                    actualProvider={lastAssistant?.provider}
                  />
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
