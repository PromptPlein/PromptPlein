import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/card';
import '@nldd/design-system/container';
/** The place of one card that is still loading. */
export function SkeletonCard() {
  return (
    <nldd-card>
      <nldd-container padding="20" min-height="8rem">
        <nldd-activity-indicator></nldd-activity-indicator>
      </nldd-container>
    </nldd-card>
  );
}

/**
 * The place of a grid of cards that is still loading: one indicator over the
 * room the cards will take, not a spinner per card.
 */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  const rows = Math.max(1, Math.ceil(count / 3));
  return (
    <nldd-container min-height={`${rows * 10}rem`}>
      <nldd-activity-indicator text="Laden"></nldd-activity-indicator>
    </nldd-container>
  );
}
