import type { ReactNode } from 'react';

/** Shared, centered layout for the auth pages. */
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
    <nldd-container max-width="28rem" padding-inline="16" padding-block="64" sm-padding-block="32" class="mx-auto">
      <nldd-icon icon="shield-check-mark" size="56" color="lintblauw" box></nldd-icon>
      <nldd-spacer size="16"></nldd-spacer>
      <nldd-title heading-level={1} size={2} text={title} supporting-text={subtitle}></nldd-title>
      <nldd-spacer size="24"></nldd-spacer>
      {children}
      {footer && (
        <>
          <nldd-spacer size="16"></nldd-spacer>
          <nldd-text size="sm" color="secondary">{footer}</nldd-text>
        </>
      )}
      <nldd-spacer size="24"></nldd-spacer>
      <nldd-link
        href="/"
        size="sm"
        start-icon="arrow-left"
        text="Terug naar de app"
      ></nldd-link>
    </nldd-container>
  );
}
