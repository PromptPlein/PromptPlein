import { useEffect, useState } from 'react';
import { Bug, Lightbulb, Mail, MessageSquare, Send } from '@/components/common/icons';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { sendContactMessage, type ContactKind } from '@/services/contactService';

const KINDS: { value: ContactKind; label: string; icon: typeof Bug; hint: string }[] = [
  { value: 'bug', label: 'Bug melden', icon: Bug, hint: 'Er gaat iets niet goed of een functie werkt niet.' },
  { value: 'feature', label: 'Feature voorstellen', icon: Lightbulb, hint: 'Een idee of wens om PromptPlein beter te maken.' },
  { value: 'other', label: 'Iets anders', icon: MessageSquare, hint: 'Een vraag of opmerking.' },
];

export default function ContactPage() {
  const { user, profile } = useAuth();
  const [kind, setKind] = useState<ContactKind>('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [sending, setSending] = useState(false);

  // Vul het antwoordadres voor met het e-mailadres van de ingelogde gebruiker.
  useEffect(() => {
    if (user?.email) setReplyTo(user.email);
  }, [user?.email]);

  async function submit() {
    if (!replyTo.trim()) {
      toast.error('Vul je e-mailadres in zodat we kunnen reageren.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim())) {
      toast.error('Vul een geldig e-mailadres in.');
      return;
    }
    if (!message.trim()) {
      toast.error('Schrijf eerst een bericht.');
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
        toast.success('Bedankt! Je bericht is verstuurd.');
        setSubject('');
        setMessage('');
      } else if (result.mailto) {
        // Server-verzending niet beschikbaar → open de eigen mailclient.
        toast('We openen je e-mailprogramma om het bericht te versturen.');
        window.location.href = result.mailto;
      }
    } catch {
      toast.error('Versturen mislukt. Probeer het later opnieuw.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
          <Mail size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Contact</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Een bug gevonden of een idee voor een nieuwe functie? Laat het ons weten.
          </p>
        </div>
      </div>

      <div className="opl-card space-y-5 p-5">
        <div>
          <label className="opl-label">Waar gaat het over?</label>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {KINDS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={clsx(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                  kind === value
                    ? 'border-rijksblauw-500 bg-rijksblauw-50 text-rijksblauw-700 dark:border-rijksblauw-400 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Icon size={16} className={kind === value ? 'text-rijksblauw-500' : 'text-slate-400'} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            {KINDS.find((k) => k.value === kind)?.hint}
          </p>
        </div>

        <div>
          <label className="opl-label" htmlFor="contact-subject">Onderwerp</label>
          <input
            id="contact-subject"
            className="opl-input"
            placeholder={kind === 'bug' ? 'Bijv. Knop “Opslaan” doet niets' : 'Korte titel'}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
          />
        </div>

        <div>
          <label className="opl-label" htmlFor="contact-message">Bericht</label>
          <textarea
            id="contact-message"
            className="opl-input min-h-[140px]"
            placeholder={
              kind === 'bug'
                ? 'Wat ging er mis? Welke stappen leidden ertoe en wat verwachtte je?'
                : 'Beschrijf je idee of vraag zo concreet mogelijk.'
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div>
          <label className="opl-label" htmlFor="contact-reply">Jouw e-mailadres</label>
          <input
            id="contact-reply"
            type="email"
            required
            className="opl-input"
            placeholder="naam@voorbeeld.nl"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            We gebruiken je e-mailadres alleen om op je bericht te reageren.
          </p>
        </div>

        <div className="flex justify-end">
          <button className="opl-btn-primary" onClick={submit} disabled={sending}>
            <Send size={16} /> {sending ? 'Versturen…' : 'Versturen'}
          </button>
        </div>
      </div>
    </div>
  );
}
