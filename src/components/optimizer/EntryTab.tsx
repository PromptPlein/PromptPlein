import { type ReactNode } from 'react';

/**
 * One of the two entry choices at the top of Prompt maken. The chosen one is
 * accent-tinted with a check mark, the other stays on the base surface. `icon` is an nldd icon name; a
 * node is rendered as given.
 */
export default function EntryTab({
  active,
  onClick,
  icon,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
}) {
  return (
    <nldd-card
      button
      background={active ? 'accent-tinted' : 'base'}
      accessible-label={active ? `${title}, gekozen` : title}
      onClick={onClick}
    >
      <nldd-container layout="row" gap="12" padding="16" vertical-alignment="center">
        {typeof icon === 'string' ? (
          <nldd-icon icon={icon} size="24" color={active ? 'lintblauw' : 'secondary-content'}></nldd-icon>
        ) : (
          icon
        )}
        <nldd-text size="lg" weight="bold" color={active ? 'accent' : 'content'}>
          {title}
        </nldd-text>
        <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
        {active && <nldd-icon icon="check-mark-circle" size="24" color="lintblauw"></nldd-icon>}
      </nldd-container>
    </nldd-card>
  );
}
