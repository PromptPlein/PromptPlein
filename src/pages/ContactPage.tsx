import { useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { useAuth } from '@/context/AuthContext';
import { sendContactMessage, type ContactKind } from '@/services/contactService';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/form-section';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/radio-button-field';
import '@nldd/design-system/radio-button-group';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';

const KINDS: { value: ContactKind; label: string; hint: string }[] = [
  { value: 'bug', label: 'Bug melden', hint: 'Er gaat iets niet goed of een functie werkt niet.' },
  { value: 'feature', label: 'Feature voorstellen', hint: 'Een idee of wens om PromptPlein beter te maken.' },
  { value: 'other', label: 'Iets anders', hint: 'Een vraag of opmerking.' },
];

export default function ContactPage() {
  const { user, profile } = useAuth();
  const [kind, setKind] = useState<ContactKind>('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [sending, setSending] = useState(false);
  const kindRef = useRef<HTMLElement>(null);
  const subjectRef = useRef<HTMLElement & { value?: string }>(null);
  const messageRef = useRef<HTMLElement & { value?: string }>(null);
  const replyRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddEvent<CustomEvent<{ checked: boolean; value: string }>>(kindRef, 'change', (e) => {
    if (e.detail?.checked) setKind(e.detail.value as ContactKind);
  });
  useNlddValue(subjectRef, subject, setSubject);
  useNlddValue(messageRef, message, setMessage);
  useNlddValue(replyRef, replyTo, setReplyTo);

  // Vul het antwoordadres voor met het e-mailadres van de ingelogde gebruiker.
  useEffect(() => {
    if (user?.email) setReplyTo(user.email);
  }, [user?.email]);

  async function submit() {
    if (!replyTo.trim()) {
      notify.error('Vul je e-mailadres in zodat we kunnen reageren.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())) {
      notify.error('Vul een geldig e-mailadres in.');
      return;
    }
    if (!message.trim()) {
      notify.error('Schrijf eerst een bericht.');
      return;
    }
    setSending(true);
    try {
      const result = await sendContactMessage({
        kind,
        subject,
        message,
        replyTo,
        name: profile?.full_name ?? undefined,
      });

      if (result.sent) {
        notify.success('Bedankt! Je bericht is verstuurd.');
        setSubject('');
        setMessage('');
      } else if (result.mailto) {
        // Server-verzending niet beschikbaar → open de eigen mailclient.
        notify('We openen je e-mailprogramma om het bericht te versturen.');
        window.location.href = result.mailto;
      }
    } catch {
      notify.error('Versturen mislukt. Probeer het later opnieuw.');
    } finally {
      setSending(false);
    }
  }

  return (
    <nldd-simple-section>
      <nldd-title
        slot="header"
        heading-level={1}
        size={2}
        text="Contact"
        supporting-text="Een bug gevonden of een idee voor een nieuwe functie? Laat het ons weten."
      ></nldd-title>
      <nldd-container max-width="42rem">
        <nldd-form>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <nldd-form-field label="Waar gaat het over?">
              <nldd-radio-button-group ref={kindRef} name="kind">
                {KINDS.map(({ value, label }) => (
                  <nldd-radio-button-field
                    key={value}
                    value={value}
                    label={label}
                    checked={kind === value || undefined}
                  ></nldd-radio-button-field>
                ))}
              </nldd-radio-button-group>
              <nldd-form-field-help-text>{KINDS.find((k) => k.value === kind)?.hint}</nldd-form-field-help-text>
            </nldd-form-field>

            <nldd-form-field label="Onderwerp" optional>
              <nldd-text-field
                ref={subjectRef}
                maxlength="150"
                placeholder={kind === 'bug' ? 'Bijv. Knop “Opslaan” doet niets' : 'Korte titel'}
              ></nldd-text-field>
            </nldd-form-field>

            <nldd-form-field label="Bericht">
              <nldd-multi-line-text-field
                ref={messageRef}
                rows={6}
                placeholder={
                  kind === 'bug'
                    ? 'Wat ging er mis? Welke stappen leidden ertoe en wat verwachtte je?'
                    : 'Beschrijf je idee of vraag zo concreet mogelijk.'
                }
              ></nldd-multi-line-text-field>
            </nldd-form-field>

            <nldd-form-section
              text="Hoe kunnen we je bereiken?"
              supporting-text="We gebruiken je e-mailadres alleen om op je bericht te reageren."
            >
              <nldd-form-field label="E-mailadres">
                <nldd-text-field ref={replyRef} type="email" autocomplete="email"></nldd-text-field>
              </nldd-form-field>
            </nldd-form-section>

            <nldd-form-actions>
              <nldd-button-group>
                <nldd-button
                  appearance="primary"
                  type="submit"
                  start-icon="paper-plane"
                  text="Verstuur"
                  loading={sending || undefined}
                  loading-text="Bezig met versturen"
                ></nldd-button>
              </nldd-button-group>
            </nldd-form-actions>
          </form>
        </nldd-form>
      </nldd-container>
    </nldd-simple-section>
  );
}
