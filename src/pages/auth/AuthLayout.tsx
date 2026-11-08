import type { ReactNode } from 'react';
import '@nldd/design-system/container';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/title';

/** Shared layout for the auth pages: the title in the section header, a narrow form column below it. */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <nldd-simple-section>
      <nldd-title slot="header" heading-level={1} size={2} text={title} supporting-text={subtitle}></nldd-title>
      <nldd-container max-width="32rem">
        {children}
        {footer && (
          <>
            <nldd-spacer size="24"></nldd-spacer>
            <nldd-text size="sm" color="secondary">{footer}</nldd-text>
          </>
        )}
      </nldd-container>
    </nldd-simple-section>
  );
}
