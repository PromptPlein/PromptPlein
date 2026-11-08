import { setChatIntakeEnabled, useChatIntakeEnabled } from '@/lib/chatIntake';
import { SwitchRow } from './AccessibilitySettings';
import '@nldd/design-system/form';
import '@nldd/design-system/form-section';

/**
 * Doorvragen bij het eerste bericht van een nieuwe chat aan of uit. Staat in deze
 * browser en vraagt dus geen account, net als de chat zelf.
 */
export default function ChatIntakeSettings() {
  const enabled = useChatIntakeEnabled();
  return (
    <nldd-form>
      <form noValidate onSubmit={(e) => e.preventDefault()}>
        <nldd-form-section text="Doorvragen" supporting-text="Geldt in deze browser.">
          <SwitchRow
            label="Eerst doorvragen bij een nieuwe chat"
            hint="Weet de AI bij het eerste bericht te weinig, dan stelt hij eerst een paar vragen en maakt hij er een prompt van, die je zelf verstuurt."
            checked={enabled}
            onChange={setChatIntakeEnabled}
          />
        </nldd-form-section>
      </form>
    </nldd-form>
  );
}
