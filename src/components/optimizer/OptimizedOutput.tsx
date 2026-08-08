import { useEffect, useState } from 'react';
import { Copy, Check, ChevronDown, RotateCcw, Save, Share2, FolderCheck, Play } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { copyToClipboard } from '@/lib/utils';
import { writeHandoff } from '@/services/chatService';
import { getChatSettingsCached, type ChatSettings, type AiSettings } from '@/services/settingsService';
import { useAuth } from '@/context/AuthContext';
import ShareModal from '@/components/share/ShareModal';
import SavePromptPanel from '@/components/prompts/SavePromptPanel';
import TestRoom from '@/components/optimizer/TestRoom';
import type { OptimizeResult, Prompt, PromptDialogue, Technique } from '@/types';

interface OptimizedOutputProps {
  result: OptimizeResult;
  /** De gekozen techniek (voor de standaardtitel + categorie van de template). */
  technique?: Technique | null;
  /** Het doel dat de gebruiker beschreef (voor een zinvolle standaardtitel). */
  goal?: string;
  onReset: () => void;
  /**
   * Versiegeschiedenis uit de verbeter-lus (v1 = origineel). Bij meer dan één
   * versie verschijnen wisselknoppen boven de prompt; alle acties (kopiëren,
   * opslaan, testen, uitvoeren) werken op de getoonde versie.
   */
  versions?: OptimizeResult[];
  activeVersion?: number;
  onSelectVersion?: (index: number) => void;
  /** Een verbeterde versie is klaar (Testkamer) — voeg toe en maak actief. */
  onRefined?: (res: OptimizeResult) => void;
  /** Generator-AI-instellingen; de refine in de Testkamer draait hierop. */
  aiSettings?: AiSettings;
  /** Context van het aangehaakte chatproject; zie ProjectContextBar. */
  projectContext?: string;
}

export default function OptimizedOutput({
  result,
  technique,
  goal,
  onReset,
  versions,
  activeVersion = 0,
  onSelectVersion,
  onRefined,
  aiSettings,
  projectContext,
}: OptimizedOutputProps) {
  const { configured } = useAuth();
  const [copied, setCopied] = useState(false);

  // Chat-instellingen: bepalen of "Uitvoeren in chat" en de Testkamer
  // beschikbaar zijn (kill-switch van de beheerder). Zolang ze laden gedragen
  // de knoppen zich als vanouds; de chatpagina zelf blijft het vangnet.
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  useEffect(() => {
    let active = true;
    void getChatSettingsCached().then((s) => {
      if (active) setChatSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);
  const chatAvailable = configured && chatSettings?.enabled !== false;

  // Opslaan: het formulier zelf (titel/omschrijving/categorie/functie/
  // zichtbaarheid + AI-metadata) staat in SavePromptPanel, gedeeld met de chat.
  const [showSave, setShowSave] = useState(false);
  const [saved, setSaved] = useState<Prompt | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Voor "Uitvoeren in chat": prompt klaarzetten en naar /chat navigeren.
  const navigate = useNavigate();

  async function handleCopy() {
    await copyToClipboard(result.optimized_content);
    setCopied(true);
    toast.success('Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  /**
   * Voer de samengestelde prompt uit in de chat: de prompt gaat via een
   * sessionStorage-handoff mee (overleeft óók de login-redirect van
   * RequireAuth) en draait daar automatisch als eerste bericht.
   */
  function handleExecute() {
    writeHandoff(result.optimized_content);
    navigate('/chat');
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
        Je herbruikbare prompt
      </h3>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Kopieer deze prompt naar je eigen AI-chat, sla hem op voor je collega&apos;s, of laat de AI
        hem <span className="font-medium">direct uitvoeren</span> voor een kant-en-klaar resultaat.
        Vul de plekken tussen <span className="font-mono text-xs">[haakjes]</span> per keer aan met je
        eigen inhoud.
      </p>

      {result.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          {result.error}
        </div>
      )}

      {/* Versie-chips: verschijnen zodra de verbeter-lus een tweede versie
          oplevert. De nieuwste staat rechts en is bij aankomst actief. */}
      {versions && versions.length > 1 && onSelectVersion && (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Versies">
          {versions.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === activeVersion}
              onClick={() => onSelectVersion(i)}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                i === activeVersion
                  ? 'border-rijksblauw-500 bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300',
              )}
              title={i === 0 ? 'De oorspronkelijke versie' : `Verbeterde versie ${i + 1}`}
            >
              v{i + 1}
              {i === versions.length - 1 && i > 0 ? ' · nieuwste' : ''}
            </button>
          ))}
        </div>
      )}

      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {result.optimized_content}
      </pre>

      {/* De Testkamer: voer de prompt hier direct uit en stuur met feedback een
          verbeterde versie aan — de bouw-test-verbeter-lus op één scherm. */}
      <TestRoom
        result={result}
        technique={technique}
        chatSettings={chatSettings}
        aiSettings={aiSettings}
        projectContext={projectContext}
        onRefined={onRefined}
      />

      {/* Kwam deze prompt uit de doel-dialoog? Dan is navolgbaar waar hij vandaan
          komt: het beschreven doel, de gestelde vragen met je antwoorden, de
          opdrachtbeschrijving die eruit volgde en het gekozen framework. Bewust
          ingeklapt — de prompt zelf is de hoofdzaak. */}
      {result.dialogue && <DialogueSummary dialogue={result.dialogue} />}

      {/* Opgeslagen-bevestiging */}
      {saved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
          <span className="inline-flex items-center gap-2">
            <FolderCheck size={16} /> Opgeslagen als herbruikbare prompt.
          </span>
          <Link
            to={`/prompt/${saved.id}`}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            Bekijk in de bibliotheek
          </Link>
        </div>
      )}

      {/* Opslaan-formulier: gedeeld met de chat via SavePromptPanel. */}
      {showSave && !saved && (
        <SavePromptPanel
          content={result.optimized_content}
          technique={technique}
          goal={goal}
          onSaved={(p) => {
            setSaved(p);
            setShowSave(false);
          }}
          onCancel={() => setShowSave(false)}
        />
      )}

      {/* Acties */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="opl-btn-secondary" onClick={onReset}>
          <RotateCcw size={16} /> Opnieuw
        </button>
        {saved ? (
          <button className="opl-btn-secondary" onClick={() => setShareOpen(true)}>
            <Share2 size={16} /> Delen met collega&apos;s
          </button>
        ) : (
          <button className="opl-btn-secondary" onClick={() => setShowSave((v) => !v)}>
            <Save size={16} /> Opslaan in bibliotheek
          </button>
        )}
        {/* Uitvoeren in chat: de AI voert de prompt daar meteen uit, met vervolgvragen.
            Uitgeschakeld wanneer de beheerder de chat uitzette — anders zou de
            prompt stilletjes verdwijnen in een handoff die nooit vuurt. */}
        <button
          className="opl-btn-secondary"
          onClick={handleExecute}
          disabled={!chatAvailable}
          title={!chatAvailable ? 'De beheerder heeft de chat uitgeschakeld.' : undefined}
        >
          <Play size={16} /> Uitvoeren in chat
        </button>
        <button className="opl-btn-primary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Gekopieerd' : 'Kopieer prompt'}
        </button>
      </div>

      {saved && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} prompt={saved} />}
    </div>
  );
}

/**
 * De toelichting bij een prompt uit de doel-dialoog: hoeveel vragen er zijn
 * gesteld, welke antwoorden je gaf, welke opdrachtbeschrijving daaruit volgde en
 * waarom dit framework is gekozen. Ingeklapt tenzij de gebruiker hem opent.
 */
function DialogueSummary({ dialogue }: { dialogue: PromptDialogue }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Hoe deze prompt tot stand kwam
          </span>
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            {dialogue.transcript.length} vragen beantwoord · framework:{' '}
            {dialogue.frameworkName ?? '—'}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={clsx('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-fade-in space-y-4 border-t border-slate-200 px-4 py-4 text-sm dark:border-slate-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Wat je wilde bereiken
            </p>
            <p className="mt-1 text-slate-700 dark:text-slate-200">{dialogue.goal}</p>
          </div>

          {dialogue.transcript.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Gestelde vragen ({dialogue.transcript.length})
              </p>
              <ol className="mt-1 space-y-2">
                {dialogue.transcript.map((turn, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    <p className="font-medium text-slate-600 dark:text-slate-300">
                      {i + 1}. {turn.question}
                    </p>
                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">{turn.answer}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Opdrachtbeschrijving uit het gesprek
            </p>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {dialogue.brief}
            </pre>
          </div>

          {dialogue.frameworkName && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Gekozen framework
              </p>
              <p className="mt-1 text-slate-700 dark:text-slate-200">
                <span className="font-medium">{dialogue.frameworkName}</span>
                {dialogue.frameworkReason ? ` — ${dialogue.frameworkReason}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

