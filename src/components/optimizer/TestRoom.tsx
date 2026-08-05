import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FlaskConical, Loader2, Play, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import ChatComposer from '@/components/chat/ChatComposer';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatModelBadge from '@/components/chat/ChatModelBadge';
import useChatController from '@/components/chat/useChatController';
import { refinePrompt } from '@/services/optimizeService';
import { writeResultSnapshot } from '@/services/handoffService';
import type { AiSettings, ChatSettings } from '@/services/settingsService';
import type { OptimizeResult, Technique } from '@/types';

/** Snelle feedbackpunten; aanvinken vult de feedback zonder typwerk. */
const FEEDBACK_CHIPS = ['Te lang', 'Te kort', 'Verkeerde toon', 'Mist context', 'Te algemeen'];

interface TestRoomProps {
  /** De getoonde (actieve) versie van de gegenereerde prompt. */
  result: OptimizeResult;
  /** De techniek van het resultaat — gaat mee in het login-snapshot. */
  technique?: Technique | null;
  /** Chat-instellingen (kill-switch, provider, model) van de beheerder. */
  chatSettings: ChatSettings | null;
  /** Generator-instellingen: de refine draait op de optimizer-provider. */
  aiSettings?: AiSettings;
  /**
   * Een verbeterde versie is klaar: de aanroeper voegt hem toe aan de
   * versiegeschiedenis en maakt hem actief. Ontbreekt dit, dan is er alleen
   * testen (geen verbeter-paneel).
   */
  onRefined?: (result: OptimizeResult) => void;
}

/**
 * De Testkamer: een ingebed uitvoergesprek direct onder de gegenereerde prompt.
 * De prompt draait hier meteen (ephemeer — niets wordt bewaard, zie
 * useChatController met `ephemeral`), de gebruiker ziet het echte antwoord en
 * stuurt met feedback een gerichte verbetering aan — de bouw-test-verbeter-lus
 * zonder de pagina te verlaten. Dit is de "Fase 3" waar useChatController
 * destijds als hook voor is gebouwd.
 */
export default function TestRoom({
  result,
  technique,
  chatSettings,
  aiSettings,
  onRefined,
}: TestRoomProps) {
  const { isAuthenticated, configured } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const enabled = chatSettings?.enabled !== false && configured;
  const controller = useChatController(chatSettings, { ephemeral: true, kind: 'execution' });

  // Welke promptversie als laatste in dit gesprek is gedraaid. Eén automatische
  // run per openklap; een nieuwe (verbeterde) versie draait pas na een klik —
  // geen stille AI-aanroepen bij elke wijziging.
  const testedPromptRef = useRef<string | null>(null);
  const prompt = result.optimized_content;

  const { conversation, streaming, sendInNewConversation } = controller;
  useEffect(() => {
    // Pas starten als álles er is: instellingen (anders no-opt send() en zou de
    // ref de run onterecht als gedaan markeren), gesprek en een niet-lopende
    // stream.
    if (!open || !enabled || !isAuthenticated || !chatSettings) return;
    if (!conversation || streaming) return;
    if (testedPromptRef.current !== null || conversation.messages.length > 0) return;
    testedPromptRef.current = prompt;
    sendInNewConversation(prompt);
  }, [open, enabled, isAuthenticated, chatSettings, conversation, streaming, prompt, sendInNewConversation]);

  // Verbeter-paneel
  const [chips, setChips] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineStream, setRefineStream] = useState('');

  const messages = controller.conversation?.messages ?? [];
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content.trim() && !m.error);
  const untestedVersion = testedPromptRef.current !== null && testedPromptRef.current !== prompt;
  const canRefine = Boolean(onRefined && lastAssistant && !controller.streaming && !refining);

  function runTest() {
    if (controller.streaming || refining) return;
    testedPromptRef.current = prompt;
    controller.sendInNewConversation(prompt);
  }

  function toggleChip(chip: string) {
    setChips((cur) => (cur.includes(chip) ? cur.filter((c) => c !== chip) : [...cur, chip]));
  }

  async function submitRefine() {
    if (!canRefine || !onRefined) return;
    const feedback = [chips.map((c) => `- ${c}`).join('\n'), feedbackText.trim()]
      .filter(Boolean)
      .join('\n');
    if (!feedback) {
      toast.error('Geef aan wat er beter moet — kies een punt of schrijf het kort op.');
      return;
    }
    setRefining(true);
    setRefineStream('');
    const res = await refinePrompt({
      previousPrompt: prompt,
      testAnswer: lastAssistant?.content ?? '',
      feedback,
      preferredProvider: aiSettings?.provider,
      preferredModel: aiSettings?.model,
      temperature: aiSettings?.temperature,
      onChunk: setRefineStream,
    });
    setRefining(false);
    setRefineStream('');
    if (!res.success) {
      toast.error(res.error ?? 'De prompt kon niet worden verbeterd.');
      return;
    }
    setChips([]);
    setFeedbackText('');
    toast.success('Verbeterde versie klaar — hierboven te zien als nieuwe versie.');
    onRefined(res);
  }

  /**
   * Inloggen vanuit de Testkamer: bewaar het resultaat éérst als snapshot in
   * sessionStorage, zodat de generator het na de login-roundtrip kan herstellen
   * in plaats van leeg te openen.
   */
  function goLogin() {
    writeResultSnapshot(result, technique?.id ?? null);
    navigate('/auth/login', { state: { from: '/genereren' } });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-start gap-2.5">
          <FlaskConical size={18} className="mt-0.5 shrink-0 text-rijksoranje" />
          <span>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Testkamer — probeer je prompt direct uit
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              De AI voert je prompt hier meteen uit. Niet tevreden? Verbeter hem met één klik.
            </span>
          </span>
        </span>
        <ChevronDown
          size={18}
          className={clsx('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-fade-in border-t border-slate-200 dark:border-slate-700">
          {!enabled ? (
            <p className="px-4 py-4 text-sm text-amber-700 dark:text-amber-400">
              {!configured
                ? 'Er is geen AI-service geconfigureerd in deze omgeving.'
                : 'De beheerder heeft de chat uitgeschakeld — testen kan daardoor nu niet.'}
            </p>
          ) : !isAuthenticated ? (
            <div className="space-y-3 px-4 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Log in om je prompt hier direct te testen. Je gegenereerde prompt blijft bewaard en
                staat na het inloggen weer voor je klaar.
              </p>
              <button type="button" className="opl-btn-primary" onClick={goLogin}>
                Inloggen om te testen
              </button>
            </div>
          ) : !chatSettings ? (
            <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Testkamer wordt geladen…
            </p>
          ) : (
            <div className="flex max-h-[480px] flex-col">
              {/* Nieuwe (verbeterde) versie nog niet getest: bied de herstart aan
                  in plaats van hem stilletjes te draaien. */}
              {untestedVersion && !controller.streaming && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-rijksblauw-50/50 px-4 py-2.5 dark:border-slate-700 dark:bg-rijksblauw-500/10">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Dit testgesprek hoort bij een eerdere versie van je prompt.
                  </p>
                  <button
                    type="button"
                    className="opl-btn-secondary shrink-0 px-3 py-1.5 text-xs"
                    onClick={runTest}
                    disabled={refining}
                  >
                    <Play size={14} /> Test deze versie
                  </button>
                </div>
              )}

              <ChatMessageList
                messages={messages}
                streaming={controller.streaming}
                expectedProvider={chatSettings.provider}
                onRetry={controller.retry}
              />

              {/* Verbeter-paneel: pas zichtbaar zodra er een echt testantwoord
                  ligt om feedback op te geven. */}
              {canRefine && !untestedVersion && (
                <div className="space-y-2.5 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Niet tevreden met het resultaat? Verbeter je prompt
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {FEEDBACK_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleChip(chip)}
                        className={clsx(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          chips.includes(chip)
                            ? 'border-rijksblauw-500 bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200'
                            : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300',
                        )}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="opl-input w-full resize-none text-sm"
                    rows={2}
                    placeholder="Wat moet er anders? Bijv. 'het antwoord mist de doelgroep ouderen'"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="opl-btn-primary px-3 py-1.5 text-xs"
                      onClick={() => void submitRefine()}
                      disabled={!canRefine}
                    >
                      <Wand2 size={14} /> Verbeter prompt
                    </button>
                  </div>
                </div>
              )}

              {/* De herschreven template komt streamend binnen; meelezen scheelt
                  gevoelde wachttijd, net als bij het genereren zelf. */}
              {refining && (
                <div className="space-y-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    Je prompt wordt herschreven op basis van je feedback…
                  </p>
                  {refineStream && (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {refineStream}
                    </pre>
                  )}
                </div>
              )}

              <ChatComposer
                disabled={!enabled || refining}
                streaming={controller.streaming}
                extracting={controller.extracting}
                attachments={[]}
                allowAttachments={false}
                onSend={(text) => void controller.send(text)}
                onStop={controller.stop}
                onAddFile={() => undefined}
                onRemoveAttachment={() => undefined}
                badge={
                  <ChatModelBadge
                    provider={chatSettings.provider}
                    model={chatSettings.model}
                    actualProvider={lastAssistant?.provider}
                  />
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
