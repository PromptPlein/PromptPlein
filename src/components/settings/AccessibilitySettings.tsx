import { useEffect, useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import {
  DEVICE_VOICE,
  NATURAL_VOICE,
  SPEECH_RATES,
  useAccessibility,
  useSpeechVoice,
  type AnswerDone,
  type TextScale,
} from '@/context/AccessibilityContext';
import { useAuth } from '@/context/AuthContext';
import {
  listDutchVoices,
  speak,
  speechSupported,
  stopSpeaking,
  subscribeVoices,
  useSpeakingId,
  type SpeechVoiceOption,
} from '@/lib/speech';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/cell';
import '@nldd/design-system/dropdown';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/form-section';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/keyboard-shortcut';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/radio-button';
import '@nldd/design-system/segmented-control';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/switch-field';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';

const TEXT_SCALES: { value: TextScale; label: string }[] = [
  { value: 'normaal', label: 'Normaal' },
  { value: 'groot', label: 'Groot' },
  { value: 'extra-groot', label: 'Extra groot' },
];

const ANSWER_DONE: { value: AnswerDone; label: string; hint: string }[] = [
  { value: 'niets', label: 'Niets doen', hint: 'Je leest het antwoord zelf.' },
  {
    value: 'schermlezer',
    label: 'Mijn schermlezer leest het voor',
    hint: 'Voor wie NVDA, JAWS of VoiceOver gebruikt.',
  },
  {
    value: 'voorlezen',
    label: 'PromptPlein leest het hardop voor',
    hint: 'Met de stem hieronder. Escape stopt het voorlezen.',
  },
];

const RATE_LABELS: Record<number, string> = {
  0.75: 'Langzaam',
  1: 'Normaal',
  1.25: 'Snel',
  1.5: 'Heel snel',
};

const SAMPLE = 'Dit is de stem die je antwoorden voorleest in PromptPlein.';

/**
 * One setting that turns on or off: an nldd-switch-field, with its explanation as
 * the help text of the field.
 */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => onChange(Boolean(e.detail?.checked)));
  return (
    <nldd-form-field>
      <nldd-switch-field ref={ref} label={label} checked={checked || undefined}></nldd-switch-field>
      {hint && <nldd-form-field-help-text>{hint}</nldd-form-field-help-text>}
    </nldd-form-field>
  );
}

/**
 * Instellingen voor toegankelijkheid. Openbaar, net als de chat: wie geen account
 * heeft, moet dit ook kunnen aanzetten. De keuzes gelden meteen en staan in deze
 * browser, dus een gedeelde pc onthoudt ze per browserprofiel.
 *
 * Alles is met gewone formuliervelden gebouwd: die werken vanzelf met het
 * toetsenbord en met schermlezers.
 */
export default function AccessibilitySettings() {
  const { settings, update, reset, speechOn } = useAccessibility();
  const { isAuthenticated } = useAuth();
  const speechVoice = useSpeechVoice();
  const [voices, setVoices] = useState<SpeechVoiceOption[]>(() => listDutchVoices());
  const canSpeak = speechSupported();
  const trying = useSpeakingId() === 'voorbeeld';

  useEffect(() => {
    const refresh = () => setVoices(listDutchVoices());
    refresh();
    return subscribeVoices(refresh);
  }, []);

  useEffect(() => stopSpeaking, []);

  const hasLocalVoice = voices.some((voice) => voice.local);
  const chosenVoice = voices.find((voice) => voice.uri === speechVoice);

  function tryVoice() {
    const result = speak('voorbeeld', SAMPLE, {
      voice: speechVoice,
      rate: settings.speechRate,
    });
    if (result === 'geen-stem') notify.error('Kies eerst een stem.');
  }

  const scaleRef = useRef<HTMLElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const voiceRef = useRef<HTMLElement>(null);
  const rateRef = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value: string }>>(scaleRef, 'change', (e) => {
    const value = e.detail?.value as TextScale | undefined;
    if (value && TEXT_SCALES.some((scale) => scale.value === value)) update({ textScale: value });
  });
  useNlddEvent<CustomEvent<{ checked: boolean }>>(answerRef, 'change', (e) => {
    const value = (e.target as HTMLElement | null)?.dataset.value as AnswerDone | undefined;
    if (value && e.detail?.checked) update({ answerDone: value });
  });
  useNlddEvent<CustomEvent<{ value: string }>>(voiceRef, 'change', (e) => {
    const value = e.detail?.value ?? (e.target as HTMLSelectElement | null)?.value;
    if (value) update({ speechVoice: value });
  });
  useNlddEvent<CustomEvent<{ value: string }>>(rateRef, 'change', (e) => {
    const value = Number(e.detail?.value ?? (e.target as HTMLSelectElement | null)?.value);
    if (Number.isFinite(value)) update({ speechRate: value });
  });

  return (
    <nldd-form>
      <form noValidate onSubmit={(e) => e.preventDefault()}>
        <nldd-form-section text="Lezen" supporting-text="Wijzigingen gelden meteen en blijven bewaard in deze browser.">
          <nldd-form-field label="Tekstgrootte">
            <nldd-segmented-control ref={scaleRef} value={settings.textScale}>
              {TEXT_SCALES.map((scale) => (
                <nldd-segmented-control-item
                  key={scale.value}
                  value={scale.value}
                  text={scale.label}
                ></nldd-segmented-control-item>
              ))}
            </nldd-segmented-control>
          </nldd-form-field>
          <SwitchRow
            label="Minder beweging"
            hint="Zet animaties uit. Dat gebeurt ook als je dit in je systeem hebt ingesteld."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
          <nldd-text size="sm" color="secondary">
            Wil je meer contrast? Gebruik de contrastinstelling van je computer. Met de
            contrastthema&apos;s van Windows volgt elk onderdeel van PromptPlein mee.
          </nldd-text>
        </nldd-form-section>

        <nldd-form-section text="Als een antwoord in de chat klaar is">
          <nldd-list
            ref={answerRef}
            type="radiogroup"
            appearance="box-tinted"
            accessible-label="Wat er gebeurt als een antwoord klaar is"
          >
            {ANSWER_DONE.map((option) => (
              <nldd-list-item
                key={option.value}
                data-value={option.value}
                radio
                checked={settings.answerDone === option.value || undefined}
              >
                <nldd-cell>
                  <nldd-radio-button decorative checked={settings.answerDone === option.value || undefined}></nldd-radio-button>
                </nldd-cell>
                <nldd-spacer-cell size="12"></nldd-spacer-cell>
                <nldd-text-cell text={option.label} supporting-text={option.hint}></nldd-text-cell>
              </nldd-list-item>
            ))}
          </nldd-list>
        </nldd-form-section>

        <nldd-form-section text="Voorlezen">
          {!canSpeak ? (
            <nldd-inline-dialog
              icon="speaker-slash"
              text="Deze browser kan niet voorlezen."
              supporting-text="Probeer Edge, Chrome of Safari."
            ></nldd-inline-dialog>
          ) : (
            <>
              <SwitchRow
                label="Knop Voorlezen onder elk antwoord"
                hint="Je kiest dan zelf welk antwoord je wilt horen."
                checked={settings.speechButton}
                onChange={(speechButton) => update({ speechButton })}
              />

              {speechOn && (
                <>
                  <nldd-form-field label="Stem">
                    <nldd-dropdown ref={voiceRef}>
                      <select aria-label="Stem" value={speechVoice ?? DEVICE_VOICE} onChange={() => undefined}>
                        {isAuthenticated && (
                          <option value={NATURAL_VOICE}>Lotte, natuurlijke stem (via Mistral)</option>
                        )}
                        <option value={DEVICE_VOICE}>Eerste Nederlandse stem op dit apparaat</option>
                        {voices.map((voice) => (
                          <option key={voice.uri} value={voice.uri}>
                            {voice.name} ({voice.lang}){voice.local ? '' : ', online'}
                          </option>
                        ))}
                      </select>
                    </nldd-dropdown>
                    {chosenVoice && !chosenVoice.local && (
                      <nldd-form-field-help-text>
                        Let op: bij een online stem gaat de tekst van het antwoord naar de leverancier
                        van die stem.
                      </nldd-form-field-help-text>
                    )}
                    {!hasLocalVoice && speechVoice !== NATURAL_VOICE && (
                      <nldd-form-field-help-text>
                        Er staat geen Nederlandse stem op dit apparaat. Voeg er een toe in de
                        taalinstellingen van je systeem, of kies een online stem.
                      </nldd-form-field-help-text>
                    )}
                  </nldd-form-field>

                  <nldd-form-field label="Snelheid">
                    <nldd-segmented-control ref={rateRef} value={String(settings.speechRate)}>
                      {SPEECH_RATES.map((rate) => (
                        <nldd-segmented-control-item
                          key={rate}
                          value={String(rate)}
                          text={RATE_LABELS[rate]}
                        ></nldd-segmented-control-item>
                      ))}
                    </nldd-segmented-control>
                  </nldd-form-field>

                  <nldd-form-actions>
                    <nldd-button-group>
                      <nldd-button
                        appearance="secondary"
                        start-icon={trying ? 'speaker-slash' : 'speaker-volume-high'}
                        text={trying ? 'Stop' : 'Probeer de stem'}
                        onClick={trying ? stopSpeaking : tryVoice}
                      ></nldd-button>
                    </nldd-button-group>
                  </nldd-form-actions>
                </>
              )}
            </>
          )}
        </nldd-form-section>

        <nldd-form-section text="Inspreken" supporting-text="Dit werkt als je bent ingelogd.">
          <SwitchRow
            label="Versturen met je stem"
            hint="Eindig je dictaat in de chat met het woord verstuur. Je tekst gaat dan meteen weg, zonder nalezen."
            checked={settings.sendByVoice}
            onChange={(sendByVoice) => update({ sendByVoice })}
          />
          <SwitchRow
            label="Gesprek zonder handen"
            hint="Zet de knop Gesprek in de chat aan: je praat, hoort het antwoord en praat weer verder."
            checked={settings.conversationMode}
            onChange={(conversationMode) => update({ conversationMode })}
          />
          <nldd-text size="sm" color="secondary">
            In de chat staat een microfoon. In elk ander tekstvak spreek je in met{' '}
            <nldd-keyboard-shortcut keys="Alt+Shift+D" mac-keys="Option+Shift+D" size="inherit" always-visible></nldd-keyboard-shortcut>.
          </nldd-text>
        </nldd-form-section>

        <nldd-form-actions>
          <nldd-button-group>
            <nldd-button
              appearance="neutral-transparent"
              start-icon="undo"
              text="Zet alles terug naar de standaard"
              onClick={reset}
            ></nldd-button>
          </nldd-button-group>
        </nldd-form-actions>
      </form>
    </nldd-form>
  );
}
