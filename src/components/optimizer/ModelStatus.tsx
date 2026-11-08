import { providerShortLabel } from '@/config/aiModels';

interface ModelStatusProps {
  /**
   * De providers die zijn geprobeerd, in volgorde. De laatste is degene die nu
   * werkt; alles daarvóór is een poging die niet lukte en waarna is teruggevallen.
   */
  models: string[];
  /** De provider die het antwoord daadwerkelijk levert. */
  winner?: string | null;
  /** Wat het model aan het doen is, bijv. "vult je velden in". */
  verb?: string;
  /** Kept for callers; layout comes from the surrounding container. */
  className?: string;
}

/**
 * Shows which model is working on the answer right now.
 *
 * Only the ACTIVE model, not the chain behind it. One model works at a time,
 * the administrator's, and when it fails the next takes over. That switch is
 * reported in one line; the failed attempt gets no block of its own.
 */
export default function ModelStatus({ models, winner, verb }: ModelStatusProps) {
  // A provider that delivers but is not in the list (an older server that only
  // sends 'meta') still belongs there.
  const lanes = winner && !models.includes(winner) ? [...models, winner] : models;
  if (lanes.length === 0) return null;

  // Who works now: the delivering provider, else the last one tried.
  const current = winner ?? lanes[lanes.length - 1];
  const switched = lanes.length > 1;
  const delivering = Boolean(winner);

  return (
    <nldd-container gap="8">
      <nldd-text size="xs" weight="medium" color="secondary">
        {providerShortLabel(current)} {winner ? (verb ?? 'levert het antwoord') : 'is aan het werk'}
        {switched && ', overgestapt na een storing'}
      </nldd-text>
      <nldd-card background={delivering ? 'base' : 'accent-tinted'}>
        <nldd-container padding="8" gap="6">
          <nldd-container layout="row" gap="8" vertical-alignment="center">
            <nldd-text size="xs" weight="bold" color={delivering ? 'success' : 'accent'}>
              {providerShortLabel(current)}
            </nldd-text>
            <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
            {delivering ? (
              <nldd-container layout="row" gap="4" vertical-alignment="center" width="fit-content">
                <nldd-icon icon="check-mark" size="16" color="success"></nldd-icon>
                <nldd-text size="xxs" color="success">
                  schrijft
                </nldd-text>
              </nldd-container>
            ) : (
              <nldd-activity-indicator size="16" show-text text="bezig"></nldd-activity-indicator>
            )}
          </nldd-container>
          {delivering ? (
            <nldd-progress-bar
              size="sm"
              value="100"
              max={100}
              color="success"
              value-display="none"
              accessible-label={`${providerShortLabel(current)} schrijft`}
            ></nldd-progress-bar>
          ) : (
            <nldd-progress-bar
              size="sm"
              indeterminate
              value-display="none"
              accessible-label={`${providerShortLabel(current)} is bezig`}
            ></nldd-progress-bar>
          )}
        </nldd-container>
      </nldd-card>
    </nldd-container>
  );
}
