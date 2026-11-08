import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import InfoDot from '@/components/common/InfoDot';
import { prefersReducedMotion } from '@/context/AccessibilityContext';
import { MAX_INTAKE_QUESTIONS, splitPromptSections } from '@/lib/chatIntake';
import { useNlddEvent } from '@/lib/nldd';
import { WizardError } from './PromptInterviewParts';
import type { IntakeState } from './useChatIntake';
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/cell';
import '@nldd/design-system/checkbox';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/progress-bar';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';
import '@nldd/design-system/visually-hidden';

const OVER_DOORVRAGEN =
  'Bij het eerste bericht van een nieuwe chat kijkt de AI of hij genoeg weet. Je zet dit uit bij Instellingen, Chat.';

/** Text with its line breaks kept, for nldd-text, which does not keep them itself. */
function withBreaks(text: string) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

function UserBubble({ children }: { children: string }) {
  return (
    <nldd-container horizontal-alignment="right">
      <nldd-visually-hidden>
        <nldd-title heading-level={2} text="Jouw bericht"></nldd-title>
      </nldd-visually-hidden>
      <nldd-container max-width="85%" width="fit-content">
        <nldd-box background="accent-tinted">
          {/* fit-content hier ook, net als in UserMessage: een container is een
              inline-size query container en wordt in een fit-content-ouder anders
              nul breed, met één woord per regel als gevolg. */}
          <nldd-container width="fit-content" padding-inline="16" padding-block="10">
            <nldd-text size="lg" line-height="loose">
              {withBreaks(children)}
            </nldd-text>
          </nldd-container>
        </nldd-box>
      </nldd-container>
    </nldd-container>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <nldd-container layout="row" gap="8" vertical-alignment="center">
      <nldd-activity-indicator size="20" timing="instant" text={label}></nldd-activity-indicator>
      <nldd-text color="secondary">{label}</nldd-text>
    </nldd-container>
  );
}

/** Een balkje per stap of per kopje: gevuld is gedaan of sterk. */
function Bars({ filled, total, tone, label }: { filled: number; total: number; tone: 'blauw' | 'groen'; label: string }) {
  return (
    <nldd-container width="120px">
      <nldd-progress-bar
        size="sm"
        max={total}
        value={String(filled)}
        color={tone === 'groen' ? 'success' : 'accent'}
        value-display="none"
        accessible-label={label}
      ></nldd-progress-bar>
    </nldd-container>
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

/** One answer to tick: a checkbox row, the whole row is the control. */
function OptionRow({
  optie,
  on,
  busy,
  onToggle,
}: {
  optie: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'change', () => onToggle());
  return (
    <nldd-list-item ref={ref} checkbox checked={on || undefined} disabled={busy || undefined}>
      <nldd-cell>
        <nldd-checkbox decorative checked={on || undefined}></nldd-checkbox>
      </nldd-cell>
      <nldd-spacer-cell size="12"></nldd-spacer-cell>
      <nldd-text-cell text={optie}></nldd-text-cell>
    </nldd-list-item>
  );
}

/**
 * De antwoorden bij één vraag. Je vinkt er een of meer aan en kiest Verder. Wie
 * iets anders wil zeggen, kiest Antwoord zelf typen: dan gaat de cursor naar het
 * tekstvak, met wat al was aangevinkt erin.
 */
function QuestionOptions({
  opties,
  label,
  busy,
  onPick,
  onTypeOwn,
}: {
  opties: string[];
  label: string;
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
      <nldd-spacer size="12"></nldd-spacer>
      <nldd-list appearance="box-base" accessible-label={label}>
        {opties.map((optie) => (
          <OptionRow
            key={optie}
            optie={optie}
            on={chosen.includes(optie)}
            busy={busy}
            onToggle={() => toggle(optie)}
          />
        ))}
        <nldd-list-item button onClick={() => onTypeOwn(joinAnswers(picked))}>
          <nldd-icon-cell icon="edit" color="accent"></nldd-icon-cell>
          <nldd-spacer-cell size="12"></nldd-spacer-cell>
          <nldd-text-cell text="Antwoord zelf typen" color="accent"></nldd-text-cell>
          <nldd-icon-cell icon="chevron-right" size="20" color="secondary"></nldd-icon-cell>
        </nldd-list-item>
      </nldd-list>
      <nldd-spacer size="12"></nldd-spacer>
      <nldd-container layout="wrap" gap="12" vertical-alignment="center">
        <nldd-button
          appearance="primary"
          text="Verder"
          disabled={(busy || picked.length === 0) || undefined}
          onClick={() => onPick(joinAnswers(picked))}
        ></nldd-button>
        <nldd-text size="sm" color="secondary">
          {picked.length === 0
            ? 'Kies een of meer antwoorden.'
            : picked.length === 1
              ? '1 antwoord gekozen'
              : `${picked.length} antwoorden gekozen`}
        </nldd-text>
      </nldd-container>
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
  // null: follow the default, open only when the prompt has no kopjes.
  const [showAll, setShowAll] = useState<boolean | null>(null);

  const sections = useMemo(
    () => (draft ? splitPromptSections(draft.prompt, draft.kopjes) : []),
    [draft],
  );
  const sterk = check ? check.kopjes.filter((k) => k.oordeel === 'sterk').length : 0;
  const total = check?.kopjes.length ?? 0;
  const busy = Boolean(loading);
  const promptOpen = showAll ?? sections.length === 0;

  // What is new stands at the bottom, so go there. The document scrolls.
  useEffect(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
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
    <nldd-container gap="20" aria-busy={busy || undefined}>
      <UserBubble>{goal}</UserBubble>

      {intro && (
        <nldd-container>
          <nldd-visually-hidden>
            <nldd-title heading-level={2} text="Antwoord"></nldd-title>
          </nldd-visually-hidden>
          <nldd-text>{intro}</nldd-text>
        </nldd-container>
      )}

      {turns.map((turn, i) => (
        <nldd-container key={i} gap="8">
          <nldd-text size="sm" color="secondary">{turn.question}</nldd-text>
          <UserBubble>{turn.answer}</UserBubble>
        </nldd-container>
      ))}

      {question && (
        <nldd-card accessible-label={question.vraag}>
          <nldd-container padding="16">
            <nldd-container layout="row" gap="8" vertical-alignment="center">
              <nldd-text size="sm" weight="bold" color="secondary">
                Vraag {turns.length + 1} van {MAX_INTAKE_QUESTIONS}
              </nldd-text>
              <Bars
                filled={turns.length + 1}
                total={MAX_INTAKE_QUESTIONS}
                tone="blauw"
                label={`Vraag ${turns.length + 1} van ${MAX_INTAKE_QUESTIONS}`}
              />
              <nldd-spacer size="flexible"></nldd-spacer>
              <InfoDot label="Over doorvragen" text={OVER_DOORVRAGEN} />
            </nldd-container>
            <nldd-spacer size="8"></nldd-spacer>
            <nldd-title heading-level={3} size={4} text={question.vraag}></nldd-title>
            {question.opties.length > 0 ? (
              <QuestionOptions
                key={question.vraag}
                opties={question.opties}
                label={question.vraag}
                busy={busy}
                onPick={onPick}
                onTypeOwn={onTypeOwn}
              />
            ) : (
              <>
                <nldd-spacer size="8"></nldd-spacer>
                <nldd-text size="sm" color="secondary">Typ je antwoord in het tekstvak.</nldd-text>
              </>
            )}
            <nldd-spacer size="12"></nldd-spacer>
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-button appearance="secondary" size="sm" start-icon="paperclip" text="Bestand toevoegen" onClick={onAddFile}></nldd-button>
              {turns.length > 0 && (
                <nldd-button
                  appearance="neutral-transparent"
                  size="sm"
                  start-icon="magic"
                  text="Maak de prompt"
                  disabled={busy || undefined}
                  onClick={onFinishQuestions}
                ></nldd-button>
              )}
              <nldd-spacer size="flexible"></nldd-spacer>
              <nldd-button appearance="accent-transparent" size="sm" text="Sla de vragen over" onClick={onSkip}></nldd-button>
            </nldd-container>
          </nldd-container>
        </nldd-card>
      )}

      {draft && phase === 'voorstel' && (
        <nldd-card accessible-label={draft.framework?.name ?? 'Je prompt'}>
          <nldd-container padding="16" gap="12">
            <nldd-title
              heading-level={3}
              size={4}
              overline="Aanpak"
              text={draft.framework?.name ?? 'Je prompt'}
            >
              {draft.reden && (
                <nldd-container slot="end">
                  <InfoDot label="Waarom deze aanpak" text={draft.reden} />
                </nldd-container>
              )}
            </nldd-title>

            {sections.length > 0 && (
              <nldd-list accessible-label="Kopjes van je prompt">
                {sections.map((section) => {
                  const beoordeeld = check?.kopjes.find((k) => k.kopje === section.kopje);
                  const zwak = beoordeeld?.oordeel === 'zwak';
                  return (
                    <nldd-list-item key={section.kopje}>
                      {beoordeeld ? (
                        <nldd-icon-cell
                          vertical-alignment="top"
                          icon={zwak ? 'circle-dashed' : 'check-mark-circle-filled'}
                          color={zwak ? 'warning' : 'success'}
                        ></nldd-icon-cell>
                      ) : (
                        <nldd-icon-cell vertical-alignment="top" icon="circle-dashed" color="secondary"></nldd-icon-cell>
                      )}
                      <nldd-spacer-cell size="12"></nldd-spacer-cell>
                      <nldd-text-cell
                        vertical-alignment="top"
                        supporting-text={beoordeeld?.kern || section.tekst.split('\n')[0]}
                      >
                        {section.kopje}
                        {beoordeeld && (
                          <nldd-visually-hidden>{zwak ? ', kan beter' : ', sterk'}</nldd-visually-hidden>
                        )}
                      </nldd-text-cell>
                    </nldd-list-item>
                  );
                })}
              </nldd-list>
            )}

            <nldd-container layout="row">
              <nldd-button
                appearance="accent-transparent"
                size="sm"
                end-icon={promptOpen ? 'chevron-up' : 'chevron-down'}
                text={promptOpen ? 'Hele prompt verbergen' : 'Hele prompt lezen'}
                expanded={promptOpen || undefined}
                onClick={() => setShowAll(!promptOpen)}
              ></nldd-button>
            </nldd-container>
            {promptOpen && (
              <nldd-code-viewer wrap language="markdown" max-height="320px">
                {draft.prompt}
              </nldd-code-viewer>
            )}

            {(checking || check) && (
              <nldd-box>
                <nldd-container padding="12">
                  {checking ? (
                    <Waiting label="Ik beoordeel je prompt" />
                  ) : check ? (
                    <>
                      <nldd-container layout="wrap" gap="12" vertical-alignment="center">
                        <nldd-text weight="bold" color="accent">Beoordeling</nldd-text>
                        <Bars filled={sterk} total={total} tone="groen" label={`${sterk} van ${total} sterk`} />
                        <nldd-spacer size="flexible"></nldd-spacer>
                        <nldd-text size="sm">
                          {sterk} van {total} sterk
                        </nldd-text>
                      </nldd-container>
                      <nldd-spacer size="8"></nldd-spacer>
                      {check.verbeterpunt ? (
                        <>
                          <nldd-text>{check.verbeterpunt.vraag}</nldd-text>
                          <nldd-spacer size="8"></nldd-spacer>
                          <nldd-container layout="wrap" gap="8">
                            {check.verbeterpunt.opties.map((optie) => (
                              <nldd-button
                                key={optie}
                                appearance="secondary"
                                size="sm"
                                text={optie}
                                disabled={busy || undefined}
                                onClick={() =>
                                  onImprove(
                                    `Verwerk dit antwoord${
                                      check.verbeterpunt?.kopje
                                        ? ` onder het kopje ${check.verbeterpunt.kopje}`
                                        : ''
                                    }. Vraag: ${check.verbeterpunt?.vraag} Antwoord: ${optie}`,
                                  )
                                }
                              ></nldd-button>
                            ))}
                          </nldd-container>
                        </>
                      ) : (
                        <nldd-container layout="row" gap="6" vertical-alignment="center">
                          <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
                          <nldd-text>Klaar om te versturen.</nldd-text>
                        </nldd-container>
                      )}
                    </>
                  ) : null}
                </nldd-container>
              </nldd-box>
            )}

            <nldd-container layout="wrap" gap="12" vertical-alignment="center">
              <nldd-button appearance="primary" text="Gebruik deze prompt" disabled={busy || undefined} onClick={onUse}></nldd-button>
              <nldd-button appearance="accent-transparent" text="Stuur mijn eigen vraag" onClick={onSkip}></nldd-button>
            </nldd-container>
          </nldd-container>
        </nldd-card>
      )}

      {draft && phase === 'klaar' && (
        <nldd-container gap="4">
          <nldd-box background="base">
            <nldd-container padding-block="6" padding-left="12" padding-right="6" layout="row" gap="12" vertical-alignment="center">
              <nldd-icon icon="check-mark" size="20" color="success"></nldd-icon>
              <nldd-container width="fit-content">
                <nldd-text weight="bold" color="accent">
                  {`${draft.framework?.name ?? 'Je prompt'}${check ? `, ${sterk} van ${total} sterk` : ''}`}
                </nldd-text>
                <nldd-text size="sm" color="secondary">Staat in het tekstvak</nldd-text>
              </nldd-container>
              <nldd-spacer size="flexible"></nldd-spacer>
              <nldd-button appearance="neutral-transparent" size="sm" text="Bekijk" onClick={onReopen}></nldd-button>
            </nldd-container>
          </nldd-box>
          <nldd-container layout="wrap" gap="8">
            <nldd-button appearance="accent-transparent" size="sm" start-icon="sparkles" text="Verder bouwen in Maken" onClick={onBuildInMaken}></nldd-button>
            <nldd-button appearance="accent-transparent" size="sm" start-icon="bookmark" text="Bewaar als prompt" onClick={onSaveAsPrompt}></nldd-button>
          </nldd-container>
        </nldd-container>
      )}

      {loading && <Waiting label={loading} />}
      {error && !loading && <WizardError message={error} onRetry={onRetry} />}
      {error && !loading && phase !== 'klaar' && (
        <nldd-container layout="row">
          <nldd-button appearance="accent-transparent" text="Stuur mijn eigen vraag" onClick={onSkip}></nldd-button>
        </nldd-container>
      )}
      <nldd-visually-hidden role="status" aria-atomic="true">
        {announcement}
      </nldd-visually-hidden>
    </nldd-container>
  );
}
