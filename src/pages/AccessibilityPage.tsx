import { useEffect, useState } from 'react';
import { Accessibility, Volume2 } from '@/components/common/icons';
import toast from 'react-hot-toast';
import {
  SPEECH_RATES,
  useAccessibility,
  type AnswerDone,
  type TextScale,
} from '@/context/AccessibilityContext';
import {
  listDutchVoices,
  speak,
  speechSupported,
  stopSpeaking,
  subscribeVoices,
  type SpeechVoiceOption,
} from '@/lib/speech';

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

function CheckField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-rijksblauw-700"
      />
      <span>
        <span className="block font-medium text-slate-900 dark:text-slate-100">{label}</span>
        <span className="block text-sm text-slate-600 dark:text-slate-300">{hint}</span>
      </span>
    </label>
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
export default function AccessibilityPage() {
  const { settings, update, reset, speechOn } = useAccessibility();
  const [voices, setVoices] = useState<SpeechVoiceOption[]>(() => listDutchVoices());
  const canSpeak = speechSupported();

  useEffect(() => {
    const refresh = () => setVoices(listDutchVoices());
    refresh();
    return subscribeVoices(refresh);
  }, []);

  useEffect(() => stopSpeaking, []);

  const hasLocalVoice = voices.some((voice) => voice.local);
  const chosenVoice = voices.find((voice) => voice.uri === settings.speechVoice);

  function tryVoice() {
    const result = speak('voorbeeld', SAMPLE, {
      voice: settings.speechVoice,
      rate: settings.speechRate,
    });
    if (result === 'geen-stem') toast.error('Kies eerst een stem.');
  }

  const sectionClass = 'opl-card p-5 sm:p-6';
  const titleClass = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';
  const legendClass = 'mb-1 font-medium text-slate-900 dark:text-slate-100';

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
          <Accessibility size={24} aria-hidden="true" />
          Toegankelijkheid
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          Wijzigingen gelden meteen en blijven bewaard in deze browser.
        </p>
      </div>

      <section className={sectionClass} aria-labelledby="ta-lezen">
        <h2 id="ta-lezen" className={titleClass}>
          Lezen
        </h2>

        <fieldset className="mt-3">
          <legend className={legendClass}>Tekstgrootte</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {TEXT_SCALES.map((scale) => (
              <label key={scale.value} className="flex cursor-pointer items-center gap-2 py-1">
                <input
                  type="radio"
                  name="tekstgrootte"
                  checked={settings.textScale === scale.value}
                  onChange={() => update({ textScale: scale.value })}
                  className="h-5 w-5 accent-rijksblauw-700"
                />
                <span className="text-slate-800 dark:text-slate-100">{scale.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-700">
          <CheckField
            label="Hoog contrast"
            hint="Donkerdere tekst, duidelijke randen en een dikke focusrand."
            checked={settings.highContrast}
            onChange={(highContrast) => update({ highContrast })}
          />
          <CheckField
            label="Minder beweging"
            hint="Zet animaties uit. Dat gebeurt ook als je dit in je systeem hebt ingesteld."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
          <CheckField
            label="Knoppen bij berichten altijd tonen"
            hint="Zonder dit verschijnen ze pas als je met de muis of het toetsenbord bij het bericht bent."
            checked={settings.alwaysShowActions}
            onChange={(alwaysShowActions) => update({ alwaysShowActions })}
          />
        </div>
      </section>

      <section className={sectionClass} aria-labelledby="ta-antwoord">
        <h2 id="ta-antwoord" className={titleClass}>
          Als een antwoord in de chat klaar is
        </h2>
        <fieldset className="mt-3">
          <legend className="sr-only">Wat er gebeurt als een antwoord klaar is</legend>
          {ANSWER_DONE.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3 py-2">
              <input
                type="radio"
                name="antwoord-klaar"
                checked={settings.answerDone === option.value}
                onChange={() => update({ answerDone: option.value })}
                className="mt-1 h-5 w-5 shrink-0 accent-rijksblauw-700"
              />
              <span>
                <span className="block font-medium text-slate-900 dark:text-slate-100">
                  {option.label}
                </span>
                <span className="block text-sm text-slate-600 dark:text-slate-300">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className={sectionClass} aria-labelledby="ta-voorlezen">
        <h2 id="ta-voorlezen" className={titleClass}>
          Voorlezen
        </h2>

        {!canSpeak ? (
          <p className="mt-2 text-slate-700 dark:text-slate-200">
            Deze browser kan niet voorlezen. Probeer Edge, Chrome of Safari.
          </p>
        ) : (
          <>
            <CheckField
              label="Knop Voorlezen onder elk antwoord"
              hint="Je kiest dan zelf welk antwoord je wilt horen."
              checked={settings.speechButton}
              onChange={(speechButton) => update({ speechButton })}
            />

            {speechOn && (
              <div className="mt-3 space-y-4">
                <div>
                  <label htmlFor="ta-stem" className="opl-label">
                    Stem
                  </label>
                  <select
                    id="ta-stem"
                    className="opl-input"
                    value={settings.speechVoice ?? ''}
                    onChange={(e) => update({ speechVoice: e.target.value || null })}
                  >
                    <option value="">Eerste Nederlandse stem op dit apparaat</option>
                    {voices.map((voice) => (
                      <option key={voice.uri} value={voice.uri}>
                        {voice.name} ({voice.lang}){voice.local ? '' : ', online'}
                      </option>
                    ))}
                  </select>
                  {chosenVoice && !chosenVoice.local && (
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      Let op: bij een online stem gaat de tekst van het antwoord naar de leverancier
                      van die stem.
                    </p>
                  )}
                  {!hasLocalVoice && (
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      Er staat geen Nederlandse stem op dit apparaat. Voeg er een toe in de
                      taalinstellingen van je systeem, of kies een online stem.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="ta-snelheid" className="opl-label">
                    Snelheid
                  </label>
                  <select
                    id="ta-snelheid"
                    className="opl-input"
                    value={settings.speechRate}
                    onChange={(e) => update({ speechRate: Number(e.target.value) })}
                  >
                    {SPEECH_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {RATE_LABELS[rate]}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="button" className="opl-btn-secondary" onClick={tryVoice}>
                  <Volume2 size={16} aria-hidden="true" /> Probeer de stem
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className={sectionClass} aria-labelledby="ta-dicteren">
        <h2 id="ta-dicteren" className={titleClass}>
          Inspreken
        </h2>
        <p className="mt-2 text-slate-700 dark:text-slate-200">
          Elk tekstvak heeft een microfoon, dus je kunt overal inspreken in plaats van typen. Dat
          staat altijd aan.
        </p>
      </section>

      <button type="button" className="opl-btn-ghost" onClick={reset}>
        Terug naar de standaardinstellingen
      </button>
    </div>
  );
}
