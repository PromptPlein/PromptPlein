import { useId, useRef, useState, type ReactNode } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { GOAL_EXAMPLES, categoryOf } from '@/data/goalExamples';
import { recommendTechniques } from '@/services/optimizeService';
import { isContextPrompt, isSkillCreator } from '@/lib/techniques';
import { stripMarkdown, copyToClipboard } from '@/lib/utils';
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
  const goalRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(goalRef, goal, onGoalChange);
  const baseId = useId().replace(/:/g, '');

  /** Kopieer een voorbeelddoel naar het klembord. */
  async function copyExample(text: string) {
    try {
      await copyToClipboard(text);
      notify.success('Voorbeeld gekopieerd.');
    } catch {
      notify.error('Kopiëren mislukt.');
    }
  }

  /** Zet een voorbeelddoel direct in het invoerveld om te testen. */
  function applyExample(text: string) {
    onGoalChange(text);
    setShowExamples(false);
    notify.success('Voorbeeld ingevuld.');
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
      notify.error('Beschrijf eerst wat je wilt bereiken.');
      return;
    }
    setLoading(true);
    setUnclearReason(null); // nieuwe poging: oude onduidelijk-melding wissen
    try {
      // Complex-vraagstuk-flow beveelt alleen losse prompttechnieken aan; complete
      // prompt frameworks (family 'context') horen bij de eigen-prompt-flow.
      const candidates = techniques.filter((t) => !isContextPrompt(t) && !isSkillCreator(t));
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
      if (res.error) notify.warning(res.error);
      if (res.recommendations.length === 0) {
        notify('Geen duidelijke match. Kies hieronder zelf een techniek.');
      }
    } catch {
      notify.error('Aanbeveling mislukt. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <nldd-container gap="20">
      {/* The generator block: the goal field, the recommended techniques and,
          after a choice, the template fields. The manual list of techniques
          stays outside it on purpose (see below). */}
      <nldd-card>
        {header}
        <nldd-container padding="20" sm-padding="16" gap="20">
          <nldd-container gap="8">
            <nldd-container layout="row" gap="8" vertical-alignment="center">
              <nldd-text weight="bold">Wat wil je graag bereiken?</nldd-text>
              <nldd-button
                appearance="neutral-transparent"
                size="xs"
                start-icon="info-circle"
                end-icon={showExamples ? 'chevron-up' : 'chevron-down'}
                text="Voorbeelden"
                onClick={() => setShowExamples((v) => !v)}
              ></nldd-button>
              <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
              {/* Clear: only when there is something to clear. */}
              {onClear && goal.trim() && (
                <nldd-tooltip text="Wis je doel en begin opnieuw">
                  <nldd-button
                    appearance="neutral-transparent"
                    size="xs"
                    start-icon="arrow-2-counter-clockwise"
                    text="Opschonen"
                    onClick={handleClear}
                  ></nldd-button>
                </nldd-tooltip>
              )}
            </nldd-container>

            {/* Unfolding panel with example goals. */}
            {showExamples && (
              <nldd-container gap="8">
                <nldd-text size="xs" color="secondary">
                  Voorbeelden van hoe je je doel kunt omschrijven. Klik op een voorbeeld om het in te
                  vullen, of kopieer het.
                </nldd-text>
                <nldd-list appearance="box-tinted" accessible-label="Voorbeelddoelen">
                  {GOAL_EXAMPLES.map((ex, i) => (
                    <nldd-list-item key={ex.title}>
                      <nldd-list-item-segment width="full" button onClick={() => applyExample(ex.goal)}>
                        <nldd-text-cell
                          overline={categoryOf(ex).label}
                          text={ex.title}
                          supporting-text={ex.subtitle}
                        ></nldd-text-cell>
                        <nldd-icon-cell icon="magic" size="20" color="accent"></nldd-icon-cell>
                      </nldd-list-item-segment>
                      <nldd-list-item-segment
                        button
                        accessible-label={`${ex.title}: kopieer voorbeeld`}
                        onClick={() => void copyExample(ex.goal)}
                      >
                        <nldd-icon-cell icon="copy" size="20"></nldd-icon-cell>
                      </nldd-list-item-segment>
                      <nldd-list-item-segment
                        button
                        popovertarget={`${baseId}-doel-${i}`}
                        accessible-label={`${ex.title}: bekijk de doelomschrijving`}
                      >
                        <nldd-icon-cell icon="eye" size="20"></nldd-icon-cell>
                      </nldd-list-item-segment>
                    </nldd-list-item>
                  ))}
                </nldd-list>
                {GOAL_EXAMPLES.map((ex, i) => (
                  <nldd-popover
                    key={ex.title}
                    id={`${baseId}-doel-${i}`}
                    role="region"
                    width="28rem"
                    accessible-label={`Doelomschrijving: ${ex.title}`}
                  >
                    <nldd-container padding="16" gap="8">
                      <nldd-text size="xs" weight="bold" color="secondary">
                        Doelomschrijving
                      </nldd-text>
                      <nldd-text size="sm">{ex.goal}</nldd-text>
                    </nldd-container>
                  </nldd-popover>
                ))}
              </nldd-container>
            )}

            <nldd-multi-line-text-field
              ref={goalRef}
              rows={5}
              resize="vertical"
              accessible-label="Wat wil je graag bereiken?"
              placeholder="Bijv. ik wil een formele e-mail aan een burger vriendelijker en duidelijker laten schrijven"
            ></nldd-multi-line-text-field>
            <nldd-text size="xs" color="secondary">
              We zoeken op basis van je doel de best passende prompttechniek(en) voor je uit.
            </nldd-text>
          </nldd-container>

          <nldd-button-group>
            <nldd-button
              appearance="primary"
              start-icon="magic"
              text="Vind passende technieken"
              loading={loading || undefined}
              loading-text="Technieken zoeken…"
              disabled={loading || !goal.trim() || undefined}
              onClick={() => void handleRecommend()}
            ></nldd-button>
          </nldd-button-group>

          {unclearReason && (
            <nldd-banner
              variant="warning"
              text="Je omschrijving is nog niet duidelijk genoeg"
              supporting-text={stripMarkdown(unclearReason)}
            ></nldd-banner>
          )}

          {recommendations && recommendations.length > 0 && (
            <nldd-container gap="12">
              <nldd-divider></nldd-divider>
              <nldd-text size="sm" weight="medium">
                Aanbevolen technieken. Kies welke je wilt toepassen:
              </nldd-text>
              {recommendations.map((rec, idx) => {
                const technique = techniqueById(rec.id);
                if (!technique) return null;
                const active = technique.id === selectedTechniqueId;
                return (
                  <nldd-card
                    key={rec.id}
                    button
                    background={active ? 'accent-tinted' : 'base'}
                    accessible-label={`${technique.name}${idx === 0 ? ', beste match' : ''}${active ? ', gekozen' : ''}`}
                    onClick={() => onSelectTechnique(technique.id)}
                  >
                    <nldd-container padding="16" gap="8">
                      <nldd-container layout="row" gap="8" vertical-alignment="center">
                        {idx === 0 && <nldd-icon icon="sparkles" size="16" color="oranje"></nldd-icon>}
                        <nldd-text weight="bold" color="accent">
                          {technique.name}
                        </nldd-text>
                        {idx === 0 && <nldd-tag size="sm" color="oranje" text="Beste match"></nldd-tag>}
                        <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
                        {active && <nldd-icon icon="check-mark-circle" size="20" color="accent"></nldd-icon>}
                      </nldd-container>
                      {rec.reason && (
                        <nldd-text size="sm" color="secondary">
                          {stripMarkdown(rec.reason)}
                        </nldd-text>
                      )}
                      {rec.value && (
                        <nldd-box background="accent-tinted">
                          <nldd-container padding="10">
                            <nldd-text size="xs" line-height="loose">
                              <strong>Waarom voor jouw vraagstuk: </strong>
                              {stripMarkdown(rec.value)}
                            </nldd-text>
                          </nldd-container>
                        </nldd-box>
                      )}
                      {technique.strength && (
                        <nldd-text size="xs" color="secondary">
                          <strong>Doel: </strong>
                          {technique.strength}
                        </nldd-text>
                      )}
                      {technique.use_cases && technique.use_cases.length > 0 && (
                        <nldd-container gap="2">
                          {technique.use_cases.slice(0, 3).map((uc, i) => (
                            <nldd-text key={i} size="xs" color="secondary">
                              • {uc}
                            </nldd-text>
                          ))}
                        </nldd-container>
                      )}
                      <nldd-text size="xs" color="secondary">
                        {technique.follow_up_questions.length} in te vullen veld
                        {technique.follow_up_questions.length === 1 ? '' : 'en'}
                      </nldd-text>
                    </nldd-container>
                  </nldd-card>
                );
              })}
            </nldd-container>
          )}

          {/* After a choice the template fields unfold here, inside the block. */}
          {templateBuilder}
        </nldd-container>
      </nldd-card>

      {/* Manual choice, outside the block on purpose: not the generator's advice
          but the full list for whoever wants to pick a technique himself. */}
      {manualList}
    </nldd-container>
  );
}
