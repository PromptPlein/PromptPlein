import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNlddValue } from '@/lib/nldd';
import { adviseTechnique } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import { isContextPrompt, isSkillCreator } from '@/lib/techniques';
import type { AdvisorAdvies, AdvisorCandidate, AdvisorQuestion, Technique } from '@/types';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
import '@nldd/design-system/divider';
import '@nldd/design-system/icon';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/progress-bar';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

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
  const answerRef = useRef<HTMLElement & { value?: string }>(null);

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
    <nldd-card>
      <nldd-container padding="24" sm-padding="16" gap="16">
        <nldd-container layout="row" gap="12">
          <nldd-icon icon="signpost" size="24" color="oranje"></nldd-icon>
          <nldd-title
            heading-level={2}
            size={5}
            text="De AI zoekt je techniek erbij"
            supporting-text={
              advies
                ? 'Op basis van je antwoorden past deze techniek het best.'
                : `Hooguit ${MAX_QUESTIONS} korte vragen over je taak. Na elk antwoord weegt de AI opnieuw.`
            }
          ></nldd-title>
          <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
          <nldd-icon-button
            appearance="neutral-transparent"
            size="sm"
            icon="dismiss"
            accessible-label="Sluiten en zelf een techniek kiezen"
            onClick={onClose}
          ></nldd-icon-button>
        </nldd-container>

        {error && (
          <nldd-banner variant="warning" text={error}>
            <nldd-button slot="actions" appearance="secondary" text="Opnieuw proberen" onClick={() => void runTurn(turns)}></nldd-button>
          </nldd-banner>
        )}

        {/* The conversation so far: short, so you see what you said and the AI weighs. */}
        {turns.length > 0 && (
          <nldd-container gap="6">
            {turns.map((t, i) => (
              <nldd-text key={i} size="sm" color="secondary">
                {t.question} <strong>{t.answer}</strong>
              </nldd-text>
            ))}
          </nldd-container>
        )}

        {busy && (
          <nldd-inline-dialog
            variant="loading"
            text={turns.length === 0 ? 'De AI kijkt naar je vraagstuk…' : 'De AI weegt je antwoord…'}
          ></nldd-inline-dialog>
        )}

        {/* The open question. */}
        {!busy && !advies && question && (
          <nldd-container gap="12">
            <nldd-title
              heading-level={3}
              size={6}
              overline={`Vraag ${turns.length + 1} van maximaal ${MAX_QUESTIONS}`}
              text={question.tekst}
              supporting-text={question.waarom || undefined}
            ></nldd-title>

            {question.opties.length > 0 && (
              <nldd-container layout="wrap" gap="8">
                {question.opties.map((optie) => (
                  <nldd-button
                    key={optie}
                    appearance="neutral-tinted"
                    size="sm"
                    text={optie}
                    onClick={() => submit(optie)}
                  ></nldd-button>
                ))}
              </nldd-container>
            )}

            <AnswerField fieldRef={answerRef} value={answer} onValue={setAnswer} onSubmit={() => submit(answer)} />
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-button
                appearance="neutral-transparent"
                size="sm"
                text="Sla de rest over en adviseer nu"
                onClick={() => void runTurn(turns, true)}
              ></nldd-button>
              {/* Also clearable mid-conversation: whoever misread the first
                  question should not have to sit out four questions. */}
              {turns.length > 0 && (
                <nldd-button
                  appearance="neutral-transparent"
                  size="sm"
                  start-icon="arrow-2-counter-clockwise"
                  text="Opnieuw beginnen"
                  onClick={restart}
                ></nldd-button>
              )}
              <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
              <nldd-button
                appearance="primary"
                end-icon="arrow-right"
                text="Volgende"
                disabled={!answer.trim() || undefined}
                onClick={() => submit(answer)}
              ></nldd-button>
            </nldd-container>
          </nldd-container>
        )}

        {/* The advice: one technique, plus what came out second. */}
        {!busy && advies && geadviseerd && (
          <nldd-container gap="12">
            <nldd-card
              button
              background="accent-tinted"
              accessible-label={`${geadviseerd.name}: hiermee verder`}
              onClick={() => onChoose(geadviseerd, advies.context)}
            >
              <nldd-container padding="16" gap="6">
                <nldd-container layout="row" gap="6" vertical-alignment="center">
                  <nldd-icon icon="check-mark-circle" size="20" color="oranje"></nldd-icon>
                  <nldd-text size="xs" weight="bold" color="secondary">
                    Prompttechniek
                  </nldd-text>
                </nldd-container>
                <nldd-text size="lg" weight="bold" color="accent">
                  {geadviseerd.name}
                </nldd-text>
                {advies.reden && (
                  <nldd-text size="sm" color="secondary">
                    {advies.reden}
                  </nldd-text>
                )}
                <nldd-container layout="row" gap="6" vertical-alignment="center">
                  <nldd-icon icon="sparkles" size="16" color="accent"></nldd-icon>
                  <nldd-text size="sm" weight="bold" color="accent">
                    Hiermee verder
                  </nldd-text>
                </nldd-container>
              </nldd-container>
            </nldd-card>

            {advies.context && (
              <nldd-text size="xs" color="secondary">
                Je context wordt alvast ingevuld: &ldquo;{advies.context}&rdquo;
              </nldd-text>
            )}

            {alternatieven.length > 0 && (
              <nldd-container gap="8">
                <nldd-text size="sm" weight="bold">
                  Twijfelt de AI? Dit kwam er ook uit
                </nldd-text>
                <nldd-list appearance="box-base" accessible-label="Twijfelt de AI? Dit kwam er ook uit">
                  {alternatieven.map((k) => {
                    const t = byId(k.id)!;
                    return (
                      <nldd-list-item key={k.id} button onClick={() => onChoose(t, advies.context)}>
                        <nldd-text-cell size="sm" text={t.name} supporting-text={k.waarom || undefined}></nldd-text-cell>
                        <nldd-icon-cell icon="chevron-right" size="20"></nldd-icon-cell>
                      </nldd-list-item>
                    );
                  })}
                </nldd-list>
              </nldd-container>
            )}

            <nldd-button-group>
              <nldd-button
                appearance="neutral-transparent"
                size="sm"
                start-icon="undo"
                text="Opnieuw beginnen"
                onClick={restart}
              ></nldd-button>
            </nldd-button-group>
          </nldd-container>
        )}

        {/* The interim weighing. Shown during the conversation on purpose: you
            see your answer shift the ranking, and why another question comes.
            Only after the first answer: before that nothing was weighed, and a
            percentage beside a technique suggests an analysis that is not there. */}
        {!advies && turns.length > 0 && candidates.length > 0 && (
          <nldd-container gap="8">
            <nldd-divider></nldd-divider>
            <nldd-text size="xs" weight="bold" color="secondary">
              Tussenstand
            </nldd-text>
            {redenering && (
              <nldd-text size="sm" color="secondary">
                {redenering}
              </nldd-text>
            )}
            {candidates.map((k) => {
              const t = byId(k.id);
              if (!t) return null;
              return (
                <nldd-progress-bar
                  key={k.id}
                  size="sm"
                  max={100}
                  value={String(Math.max(0, Math.min(100, k.zekerheid)))}
                  color="oranje"
                  text={t.name}
                  value-format="percentage"
                  value-display="inline"
                ></nldd-progress-bar>
              );
            })}
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
  );
}

/** The free answer field; Enter sends, Shift+Enter starts a new line. */
function AnswerField({
  fieldRef,
  value,
  onValue,
  onSubmit,
}: {
  fieldRef: RefObject<HTMLElement & { value?: string }>;
  value: string;
  onValue: (value: string) => void;
  onSubmit: () => void;
}) {
  useNlddValue(fieldRef, value, onValue);
  return (
    <nldd-multi-line-text-field
      ref={fieldRef}
      size="sm"
      rows={2}
      resize="vertical"
      accessible-label="Je eigen antwoord"
      placeholder="Of typ je eigen antwoord…"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
    ></nldd-multi-line-text-field>
  );
}
