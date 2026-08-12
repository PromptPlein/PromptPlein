import { useEffect, useState } from 'react';
import { Brain, Check, Info, Loader2, RotateCw, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { buildMetaPrompt } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import RichText from './RichText';

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

  // Meld de geserialiseerde prompt terug zodra die wijzigt.
  useEffect(() => {
    onSerialized(serialize(prompt, toelichting, cot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, toelichting, cot]);

  async function build(withFeedback?: string) {
    if (!request.trim()) {
      toast.error('Beschrijf eerst wat je nodig hebt.');
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
        toast.error(res.reason?.trim() || 'Je verzoek is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.prompt) {
        toast.error(res.error ?? 'De prompt kon niet worden gebouwd.');
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
    <div className="space-y-4">
      {/* Uitleg over wat meta-prompting doet. */}
      <div className="flex items-start gap-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
        <Brain size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Bij meta-prompting bouwt de AI <span className="font-medium">een prompt</span>, geen antwoord.
          Beschrijf wat je nodig hebt; de AI maakt er een uitvoerbare instructie van die je daarna in je
          eigen chat kunt gebruiken.
        </p>
      </div>

      {/* Het ruwe verzoek. */}
      <div>
        <label className="opl-label mb-0.5 block" htmlFor="meta-request">
          Wat wil je dat de (andere) AI straks doet?
        </label>
        <textarea
          id="meta-request"
          className="opl-input min-h-[80px] resize-y text-sm"
          value={request}
          placeholder="Bijv. een memo schrijven over de invoering van een nieuwe regeling, gericht aan het management"
          disabled={busy}
          onChange={(e) => setRequest(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          De AI beantwoordt dit niet zelf; hij bouwt de prompt waarmee dit optimaal gemaakt wordt.
        </p>
      </div>

      {!prompt ? (
        <button type="button" className="opl-btn-primary" onClick={() => void build()} disabled={busy || !request.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? 'Prompt bouwen…' : 'Bouw de prompt'}
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          {/* CoT-afweging als badge. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Gebouwde prompt
            </span>
            <span
              className={
                cot
                  ? 'inline-flex items-center gap-1 rounded-full bg-rijksblauw-100 px-2 py-0.5 text-[11px] font-medium text-rijksblauw-800 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200'
                  : 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }
            >
              {cot ? <Check size={11} /> : <X size={11} />}
              {cot ? 'Chain-of-Thought opgenomen' : 'Geen Chain-of-Thought'}
            </span>
          </div>

          {/* De gebouwde prompt. */}
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {prompt}
          </pre>

          {/* Toelichting (incl. CoT-motivatie). */}
          {toelichting && (
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Info size={13} className="text-rijksblauw-500" /> Toelichting
              </p>
              <RichText text={toelichting} className="mt-1 text-xs text-slate-600 dark:text-slate-300" />
            </div>
          )}

          {/* Verfijnen met feedback. */}
          <div>
            <label className="opl-label mb-0.5 block" htmlFor="meta-feedback">
              Wil je iets aanpassen? Geef feedback en laat de prompt herbouwen.
            </label>
            <textarea
              id="meta-feedback"
              className="opl-input min-h-[56px] resize-y text-sm"
              value={feedback}
              placeholder="Bijv. korter, formeler, of voeg een stap toe om bronnen te checken."
              disabled={busy}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="opl-btn-secondary"
                onClick={() => void build(feedback.trim() || undefined)}
                disabled={busy || !feedback.trim()}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                Verwerk feedback
              </button>
              <button
                type="button"
                className="text-xs font-medium text-slate-500 hover:text-rijksblauw-600 dark:text-slate-400"
                onClick={() => void build()}
                disabled={busy}
              >
                Opnieuw bouwen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
