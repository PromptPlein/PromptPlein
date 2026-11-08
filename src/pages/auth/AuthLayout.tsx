import type { ReactNode } from 'react';
import PageColumn, { Panel } from '@/components/common/PageColumn';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';

/** Gedeelde opbouw van de inlogpagina's: een smalle kolom in het midden, het formulier op een witte kaart. */
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
    <PageColumn title={title} supporting={subtitle} icon="shield-check-mark" width="30rem">
      <Panel>
        {children}
        {footer && (
          <>
            <nldd-spacer size="24"></nldd-spacer>
            <nldd-text size="sm" color="secondary">{footer}</nldd-text>
          </>
        )}
      </Panel>
    </PageColumn>
  );
}
