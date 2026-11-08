import { useEffect, useRef, useState } from 'react';
import { useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import { buildMetaPrompt } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import RichText from './RichText';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

interface MetaBuilderProps {
  settings: AiSettings;
  /** Het doel van de plan-wizard, als startpunt voor het ruwe verzoek. */
  goal?: string;
  /** Aangeroepen met de geserialiseerde meta-prompt zodra die wijzigt. */
  onSerialized: (text: string) => void;
}

/** Serialiseer de gebouwde prompt + toelichting voor de analyse/compose. */
function serialize(prompt: string, toelichting: string, cot: boolean): string {
  if (!prompt.trim()) return '';
  const parts = [`DOOR META-PROMPTING GEBOUWDE PROMPT (dit is de instructie voor een andere AI):\n${prompt.trim()}`];
  if (toelichting.trim())
    parts.push(`TOELICHTING (keuzes, incl. Chain-of-Thought-afweging):\n${toelichting.trim()}`);
  parts.push(`Chain-of-Thought-instructie opgenomen: ${cot ? 'ja' : 'nee'}`);
  return parts.join('\n\n');
}

/**
 * Meta-prompting: de AI BOUWT een prompt (geen antwoord) op basis van het ruwe
 * verzoek van de gebruiker. De gebruiker beschrijft wat hij nodig heeft, de AI
 * levert een uitvoerbare prompt + toelichting (incl. de Chain-of-Thought-afweging),
 * en de gebruiker kan met feedback laten bijstellen. Het resultaat gaat als
 * materiaal mee naar de eindtemplate.
 */
export default function MetaBuilder({ settings, goal, onSerialized }: MetaBuilderProps) {
  const [request, setRequest] = useState(goal?.trim() ?? '');
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [toelichting, setToelichting] = useState('');
  const [cot, setCot] = useState(false);
  const [feedback, setFeedback] = useState('');
  const requestRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(requestRef, request, setRequest);

  // Meld de geserialiseerde prompt terug zodra die wijzigt.
  useEffect(() => {
    onSerialized(serialize(prompt, toelichting, cot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, toelichting, cot]);

  async function build(withFeedback?: string) {
    if (!request.trim()) {
      notify.error('Beschrijf eerst wat je nodig hebt.');
      return;
    }
    setBusy(true);
    try {
      const res = await buildMetaPrompt({
        request: request.trim(),
        feedback: withFeedback,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        notify.error(res.reason?.trim() || 'Je verzoek is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.prompt) {
        notify.error(res.error ?? 'De prompt kon niet worden gebouwd.');
        return;
      }
      setPrompt(res.prompt);
      setToelichting(res.toelichting ?? '');
      setCot(Boolean(res.cotGebruikt));
      setFeedback('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <nldd-container gap="24">
      <BuilderIntro
        icon="brain"
        title="Bouw een prompt"
        text="De AI bouwt een prompt, geen antwoord. Die gebruik je daarna in je eigen chat."
      />

      {/* The raw request. */}
      <nldd-container gap="8">
        <nldd-container layout="row" gap="4" vertical-alignment="center">
          <nldd-text weight="bold">Wat wil je dat de (andere) AI straks doet?</nldd-text>
          <InfoDot label="Uitleg bij dit veld" text="De AI beantwoordt dit niet zelf; hij bouwt de prompt waarmee dit optimaal gemaakt wordt." />
        </nldd-container>
        <nldd-multi-line-text-field
          ref={requestRef}
          rows={3}
          resize="vertical"
          accessible-label="Wat wil je dat de (andere) AI straks doet?"
          placeholder="Bijv. een memo schrijven over de invoering van een nieuwe regeling, gericht aan het management"
          disabled={busy || undefined}
        ></nldd-multi-line-text-field>
      </nldd-container>

      {!prompt ? (
        <nldd-button-group>
          <nldd-button
            appearance="secondary"
            start-icon="sparkles"
            text="Bouw de prompt"
            loading={busy || undefined}
            loading-text="Prompt bouwen…"
            disabled={busy || !request.trim() || undefined}
            onClick={() => void build()}
          ></nldd-button>
        </nldd-button-group>
      ) : (
        <nldd-container gap="16">
          {/* The built prompt, with the Chain-of-Thought decision beside its title. */}
          <nldd-container gap="8">
            <nldd-container layout="wrap" gap="8" vertical-alignment="center">
              <nldd-title heading-level={3} size={6} text="Gebouwde prompt"></nldd-title>
              <nldd-tag
                size="sm"
                color={cot ? 'accent' : 'neutral'}
                icon={cot ? 'check-mark' : 'dismiss'}
                text={cot ? 'Chain-of-Thought opgenomen' : 'Geen Chain-of-Thought'}
              ></nldd-tag>
            </nldd-container>
            <nldd-code-viewer appearance="box-tinted" wrap max-height="18rem">
              {prompt}
            </nldd-code-viewer>
          </nldd-container>

          {/* Explanation, including the Chain-of-Thought reasoning. */}
          {toelichting && (
            <nldd-box>
              <nldd-container padding="16" gap="8">
                <nldd-container layout="row" gap="6" vertical-alignment="center">
                  <nldd-icon icon="info-circle" size="16" color="lintblauw"></nldd-icon>
                  <nldd-text size="sm" weight="bold">
                    Toelichting
                  </nldd-text>
                </nldd-container>
                <RichText text={toelichting} />
              </nldd-container>
            </nldd-box>
          )}

          {/* Refining with feedback. */}
          <nldd-container gap="8">
            <nldd-text weight="bold">Wil je iets aanpassen? Geef feedback en laat de prompt herbouwen.</nldd-text>
            <FeedbackField value={feedback} onValue={setFeedback} disabled={busy} />
            <nldd-button-group>
              <nldd-button
                appearance="secondary"
                start-icon="arrow-clockwise"
                text="Verwerk feedback"
                loading={busy || undefined}
                disabled={busy || !feedback.trim() || undefined}
                onClick={() => void build(feedback.trim() || undefined)}
              ></nldd-button>
              <nldd-button
                appearance="neutral-transparent"
                text="Opnieuw bouwen"
                disabled={busy || undefined}
                onClick={() => void build()}
              ></nldd-button>
            </nldd-button-group>
          </nldd-container>
        </nldd-container>
      )}
    </nldd-container>
  );
}

/** The feedback field; it mounts with the built prompt, so its binding does too. */
function FeedbackField({ value, onValue, disabled }: { value: string; onValue: (v: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-multi-line-text-field
      ref={ref}
      rows={2}
      resize="vertical"
      accessible-label="Feedback op de gebouwde prompt"
      placeholder="Bijv. korter, formeler, of voeg een stap toe om bronnen te checken."
      disabled={disabled || undefined}
    ></nldd-multi-line-text-field>
  );
}
