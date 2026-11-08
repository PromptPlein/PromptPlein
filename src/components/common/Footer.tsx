import { HELP_PATH } from '@/lib/shortcuts';
import '@nldd/design-system/page-footer';

export default function Footer() {
  return (
    <nldd-page-footer slot="footer">
      <nldd-page-footer-legal-bar slot="legal-bar">
        <nldd-page-footer-legal-bar-item slot="start" text="Verwerk geen persoonsgegevens"></nldd-page-footer-legal-bar-item>
        <nldd-page-footer-legal-bar-item slot="end" text="Contact" href="/contact"></nldd-page-footer-legal-bar-item>
        <nldd-page-footer-legal-bar-item slot="end" text="Hulp bij toegankelijkheid" href={HELP_PATH}></nldd-page-footer-legal-bar-item>
      </nldd-page-footer-legal-bar>
    </nldd-page-footer>
  );
}
