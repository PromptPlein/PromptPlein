import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Bookmark,
  Check,
  ChevronRight,
  Loader2,
  Paperclip,
  Pencil,
  Sparkles,
  Wand2,
} from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { prefersReducedMotion } from '@/context/AccessibilityContext';
import { MAX_INTAKE_QUESTIONS, splitPromptSections } from '@/lib/chatIntake';
import { WizardError } from './PromptInterviewParts';
import type { IntakeState } from './useChatIntake';

const OVER_DOORVRAGEN =
  'Bij het eerste bericht van een nieuwe chat kijkt de AI of hij genoeg weet. Je zet dit uit bij Instellingen, Chat.';

const CARD =
  'overflow-hidden rounded-xl border border-t-4 border-slate-200 border-t-rijksoranje bg-white dark:border-slate-700 dark:border-t-rijksoranje dark:bg-slate-800';

/** Een antwoord om aan te vinken: je mag er meer kiezen. */
const OPTION =
  'flex min-h-[2.75rem] w-full cursor-pointer items-center gap-3 rounded-lg border border-rijksblauw-500 bg-white px-3.5 py-2 text-left font-semibold text-rijksblauw-500 transition-colors hover:bg-rijksblauw-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-rijksblauw-500 has-[:focus-visible]:ring-offset-2 has-[:checked]:bg-rijksblauw-50 has-[:disabled]:opacity-50 dark:border-rijksblauw-300 dark:bg-transparent dark:text-rijksblauw-100 dark:hover:bg-rijksblauw-500/20 dark:has-[:checked]:bg-rijksblauw-500/20 dark:has-[:focus-visible]:ring-offset-slate-800';

/** Zelf typen: geen antwoord, maar de weg naar het tekstvak. */
const TYPE_OWN =
  'flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-lg border border-dashed border-rijksblauw-500 px-3.5 py-2 text-left font-semibold text-rijksblauw-500 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-2 dark:border-rijksblauw-300 dark:text-rijksblauw-100 dark:hover:bg-rijksblauw-500/20 dark:focus-visible:ring-offset-slate-800';

const CHIP =
  'min-h-[2.75rem] rounded-lg border border-rijksblauw-500 bg-white px-3 py-1.5 text-left text-sm font-semibold text-rijksblauw-500 transition-colors hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:opacity-50 dark:border-rijksblauw-300 dark:bg-transparent dark:text-rijksblauw-100 dark:hover:bg-rijksblauw-500/20';

const LINK =
  'opl-raak inline-flex items-center gap-1.5 rounded text-sm font-semibold text-rijksblauw-500 underline underline-offset-2 hover:text-rijksblauw-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 disabled:opacity-50 dark:text-rijksblauw-200 dark:hover:text-white';

function UserBubble({ children }: { children: string }) {
  return (
    <div className="flex justify-end">
      <h2 className="sr-only">Jouw bericht</h2>
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-rijksblauw-50 px-4 py-2.5 text-base leading-7 text-slate-900 dark:bg-rijksblauw-500/15 dark:text-slate-100">
        {children}
      </p>
    </div>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      <Loader2 size={18} className="shrink-0 animate-spin" /> {label}
    </p>
  );
}

/** Een balkje per stap of per kopje: gevuld is gedaan of sterk. */
function Bars({ filled, total, tone }: { filled: number; total: number; tone: 'blauw' | 'groen' }) {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={clsx(
            'h-1.5 w-5 rounded-sm',
            i < filled
              ? tone === 'groen'
                ? 'bg-rijksgroen'
                : 'bg-rijksblauw-700 dark:bg-rijksblauw-300'
              : 'bg-slate-200 dark:bg-slate-600',
          )}
        />
      ))}
    </span>
  );
}

/** "a", "a en b", "a, b en c": zo leest het antwoord als een zin. */
function joinAnswers(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  // Midden in de zin een kleine letter, behalve bij een afkorting als AVG.
  const rest = parts
    .slice(1)
    .map((p) => (/^\p{Lu}\p{Ll}/u.test(p) ? p[0].toLowerCase() + p.slice(1) : p));
  const all = [parts[0], ...rest];
  return `${all.slice(0, -1).join(', ')} en ${all[all.length - 1]}`;
}

/**
 * De antwoorden bij één vraag. Je vinkt er een of meer aan en kiest Verder. Wie
 * iets anders wil zeggen, kiest Antwoord zelf typen: dan gaat de cursor naar het
 * tekstvak, met wat al was aangevinkt erin.
 */
function QuestionOptions({
  opties,
  labelledBy,
  busy,
  onPick,
  onTypeOwn,
}: {
  opties: string[];
  labelledBy: string;
  busy: boolean;
  onPick: (answer: string) => void;
  onTypeOwn: (start: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (optie: string) =>
    setChosen((cur) => (cur.includes(optie) ? cur.filter((o) => o !== optie) : [...cur, optie]));
  // In de volgorde van de lijst, niet in de volgorde van aanklikken.
  const picked = opties.filter((o) => chosen.includes(o));

  return (
    <>
      <fieldset className="mt-3 grid gap-2" aria-labelledby={labelledBy}>
        {opties.map((optie) => (
          <label key={optie} className={OPTION}>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 cursor-pointer rounded accent-rijksblauw-500 focus:outline-none"
              checked={chosen.includes(optie)}
              disabled={busy}
              onChange={() => toggle(optie)}
            />
            <span className="min-w-0">{optie}</span>
          </label>
        ))}
        <button type="button" className={TYPE_OWN} onClick={() => onTypeOwn(joinAnswers(picked))}>
          <span className="flex items-center gap-3">
            <Pencil size={18} className="shrink-0" /> Antwoord zelf typen
          </span>
          <ChevronRight size={18} className="shrink-0" />
        </button>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          className="opl-btn-primary"
          disabled={busy || picked.length === 0}
          onClick={() => onPick(joinAnswers(picked))}
        >
          Verder
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {picked.length === 0
            ? 'Kies een of meer antwoorden.'
            : picked.length === 1
              ? '1 antwoord gekozen'
              : `${picked.length} antwoorden gekozen`}
        </span>
      </div>
    </>
  );
}

/**
 * Doorvragen bij het eerste bericht van een nieuwe chat, op de plek van het
 * gesprek. Dit zijn geen berichten: niets hiervan komt in de opgeslagen chat. Pas
 * de prompt die de medewerker verstuurt, is het eerste bericht.
 *
 * De vragen beantwoord je door een of meer antwoorden aan te vinken, of door zelf
 * te typen in het tekstvak. Dat tekstvak blijft onderaan staan, met de paperclip
 * voor een bestand.
 */
export default function ChatIntake({
  state,
  onPick,
  onTypeOwn,
  onFinishQuestions,
  onSkip,
  onImprove,
  onUse,
  onReopen,
  onRetry,
  onAddFile,
  onSaveAsPrompt,
  onBuildInMaken,
}: {
  state: IntakeState;
  onPick: (answer: string) => void;
  /** Naar het tekstvak, met wat al was aangevinkt erin. */
  onTypeOwn: (start: string) => void;
  onFinishQuestions: () => void;
  onSkip: () => void;
  onImprove: (feedback: string) => void;
  onUse: () => void;
  onReopen: () => void;
  onRetry: () => void;
  onAddFile: () => void;
  onSaveAsPrompt: () => void;
  onBuildInMaken: () => void;
}) {
  const { goal, phase, begrip, turns, question, draft, check, checking, loading, error } = state;
  const questionId = useId();
  const proposalId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(
    () => (draft ? splitPromptSections(draft.prompt, draft.kopjes) : []),
    [draft],
  );
  const sterk = check ? check.kopjes.filter((k) => k.oordeel === 'sterk').length : 0;
  const total = check?.kopjes.length ?? 0;
  const busy = Boolean(loading);

  // Wat er nieuw bij komt, staat onderaan: daar heen. Alleen de lijst scrolt,
  // niet de pagina eromheen (dat zou scrollIntoView wel doen).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [turns.length, question, phase, loading, checking]);

  // Een aparte statusregel, zodat een schermlezer hoort wat er veranderde.
  const announcement = loading
    ? loading
    : question
      ? `Vraag ${turns.length + 1}: ${question.vraag}`
      : phase === 'voorstel' && !checking
        ? 'Je prompt staat klaar. Lees hem na en kies Gebruik deze prompt.'
        : phase === 'klaar'
          ? 'De prompt staat in het tekstvak.'
          : '';

  const intro =
    begrip &&
    (turns.length > 0 || question
      ? `${begrip} Eerst een paar korte vragen.`
      : `${begrip} Ik maak er een prompt van.`);

  return (
    <div
      ref={scrollRef}
      data-chat-lijst
      tabIndex={0}
      role="region"
      aria-label="Gesprek"
      aria-busy={busy}
      // Relative: anders telt de onzichtbare statusregel mee met de hoogte van de pagina.
      className="opl-scroll-slim relative min-h-0 flex-auto overflow-y-auto px-4 py-4 [scrollbar-gutter:stable_both-edges] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rijksblauw-500 sm:px-6"
    >
      <div className="mx-auto max-w-[60ch] space-y-5">
        <UserBubble>{goal}</UserBubble>

        {intro && (
          <div>
            <h2 className="sr-only">Antwoord</h2>
            <p className="text-base leading-7 text-slate-800 dark:text-slate-100">{intro}</p>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <p className="text-sm text-slate-500 dark:text-slate-400">{turn.question}</p>
            <UserBubble>{turn.answer}</UserBubble>
          </div>
        ))}

        {question && (
          <section aria-labelledby={questionId} className={clsx(CARD, 'p-4')}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                Vraag {turns.length + 1} van {MAX_INTAKE_QUESTIONS}
              </span>
              <Bars filled={turns.length + 1} total={MAX_INTAKE_QUESTIONS} tone="blauw" />
              <span className="ml-auto">
                <InfoDot label="Over doorvragen" text={OVER_DOORVRAGEN} />
              </span>
            </div>
            <h3
              id={questionId}
              className="mt-2 text-lg font-bold leading-snug text-rijksblauw-700 dark:text-rijksblauw-200"
            >
              {question.vraag}
            </h3>
            {question.opties.length > 0 ? (
              <QuestionOptions
                key={question.vraag}
                opties={question.opties}
                labelledBy={questionId}
                busy={busy}
                onPick={onPick}
                onTypeOwn={onTypeOwn}
              />
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Typ je antwoord in het tekstvak.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" className="opl-btn-secondary !px-3 !py-1.5" onClick={onAddFile}>
                <Paperclip size={16} /> Bestand toevoegen
              </button>
              {turns.length > 0 && (
                <button
                  type="button"
                  className="opl-btn-ghost !px-3 !py-1.5"
                  disabled={busy}
                  onClick={onFinishQuestions}
                >
                  <Wand2 size={16} /> Maak de prompt
                </button>
              )}
              <button type="button" className={clsx(LINK, 'sm:ml-auto')} onClick={onSkip}>
                Sla de vragen over
              </button>
            </div>
          </section>
        )}

        {draft && phase === 'voorstel' && (
          <section aria-labelledby={proposalId} className={CARD}>
            <div className="flex flex-wrap items-center gap-x-1.5 px-4 pt-3">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                Aanpak
              </span>
              <h3
                id={proposalId}
                className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
              >
                {draft.framework?.name ?? 'Je prompt'}
              </h3>
              {draft.reden && <InfoDot label="Waarom deze aanpak" text={draft.reden} />}
            </div>

            {sections.length > 0 && (
              <ul className="space-y-2 px-4 py-3">
                {sections.map((section) => {
                  const beoordeeld = check?.kopjes.find((k) => k.kopje === section.kopje);
                  const zwak = beoordeeld?.oordeel === 'zwak';
                  return (
                    <li key={section.kopje} className="flex items-start gap-2.5 text-[0.9375rem] leading-6">
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded',
                          !beoordeeld && 'bg-slate-100 dark:bg-slate-700',
                          beoordeeld && !zwak && 'bg-rijksgroen text-white',
                          zwak && 'border-2 border-dashed border-rijksoranje',
                        )}
                      >
                        {beoordeeld && !zwak && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {section.kopje}
                        </span>
                        {beoordeeld && (
                          <span className="sr-only">{zwak ? ', kan beter' : ', sterk'}</span>
                        )}{' '}
                        <span className="line-clamp-2 text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]">
                          {beoordeeld?.kern || section.tekst.split('\n')[0]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <details className="group px-4 pb-3" open={sections.length === 0}>
              <summary className={clsx(LINK, 'cursor-pointer list-none')}>
                <span className="group-open:hidden">Hele prompt lezen</span>
                <span className="hidden group-open:inline">Hele prompt verbergen</span>
              </summary>
              <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
                {draft.prompt}
              </div>
            </details>

            {(checking || check) && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                {checking ? (
                  <Waiting label="Ik beoordeel je prompt" />
                ) : check ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                        Beoordeling
                      </span>
                      <Bars filled={sterk} total={total} tone="groen" />
                      <span className="ml-auto text-sm text-slate-700 dark:text-slate-200">
                        {sterk} van {total} sterk
                      </span>
                    </div>
                    {check.verbeterpunt ? (
                      <>
                        <p className="mt-2 text-[0.9375rem] text-slate-800 dark:text-slate-100">
                          {check.verbeterpunt.vraag}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {check.verbeterpunt.opties.map((optie) => (
                            <button
                              key={optie}
                              type="button"
                              className={CHIP}
                              disabled={busy}
                              onClick={() =>
                                onImprove(
                                  `Verwerk dit antwoord${
                                    check.verbeterpunt?.kopje
                                      ? ` onder het kopje ${check.verbeterpunt.kopje}`
                                      : ''
                                  }. Vraag: ${check.verbeterpunt?.vraag} Antwoord: ${optie}`,
                                )
                              }
                            >
                              {optie}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 flex items-center gap-1.5 text-[0.9375rem] text-slate-800 dark:text-slate-100">
                        <Check size={16} className="shrink-0 text-rijksgroen" /> Klaar om te
                        versturen.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button type="button" className="opl-btn-primary" disabled={busy} onClick={onUse}>
                Gebruik deze prompt
              </button>
              <button type="button" className={LINK} onClick={onSkip}>
                Stuur mijn eigen vraag
              </button>
            </div>
          </section>
        )}

        {draft && phase === 'klaar' && (
          <div className="space-y-1">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 py-1.5 pl-3 pr-1.5 dark:border-slate-700">
              <Check size={20} className="shrink-0 text-rijksgroen" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
                  {draft.framework?.name ?? 'Je prompt'}
                  {check ? `, ${sterk} van ${total} sterk` : ''}
                </span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">
                  Staat in het tekstvak
                </span>
              </span>
              <button type="button" className="opl-btn-ghost !px-3 !py-1.5" onClick={onReopen}>
                Bekijk
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4">
              <button type="button" className={LINK} onClick={onBuildInMaken}>
                <Sparkles size={16} /> Verder bouwen in Maken
              </button>
              <button type="button" className={LINK} onClick={onSaveAsPrompt}>
                <Bookmark size={16} /> Bewaar als prompt
              </button>
            </div>
          </div>
        )}

        {loading && <Waiting label={loading} />}
        {error && !loading && <WizardError message={error} onRetry={onRetry} />}
        {error && !loading && phase !== 'klaar' && (
          <button type="button" className={LINK} onClick={onSkip}>
            Stuur mijn eigen vraag
          </button>
        )}
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  );
}
