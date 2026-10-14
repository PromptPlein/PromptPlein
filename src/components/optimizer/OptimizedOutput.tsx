import { useEffect, useState } from 'react';
import {
  Copy,
  Check,
  ChevronDown,
  RotateCcw,
  Save,
  Share2,
  FolderCheck,
  FolderDown,
  MessageSquarePlus,
  Globe,
  Download,
  Brain,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { copyToClipboard } from '@/lib/utils';
import { downloadText, downloadZip } from '@/lib/download';
import { buildSkillMd, buildSkillPlugin, skillSlug, type SkillMeta } from '@/lib/skill';
import { writeHandoff } from '@/services/chatService';
import { getChatSettingsCached, type ChatSettings } from '@/services/settingsService';
import { useAuth } from '@/context/AuthContext';
import ShareModal from '@/components/share/ShareModal';
import SavePromptPanel from '@/components/prompts/SavePromptPanel';
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
  /**
   * Gebouwd met de Skill Creator: dan is de uitvoer een vaste instructie in
   * plaats van een prompt, en komt er een SKILL.md-download bij met deze naam
   * en beschrijving als kop.
   */
  skill?: SkillMeta;
}

export default function OptimizedOutput({
  result,
  technique,
  goal,
  onReset,
  versions,
  activeVersion = 0,
  onSelectVersion,
  skill,
}: OptimizedOutputProps) {
  const { configured } = useAuth();
  const [copied, setCopied] = useState(false);

  // Chat-instellingen: bepalen of "Kopiëren in chat" en de Testkamer
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
  // Voor "Kopiëren in chat": prompt klaarzetten en naar /chat navigeren.
  const navigate = useNavigate();

  async function handleCopy() {
    await copyToClipboard(result.optimized_content);
    setCopied(true);
    toast.success(skill ? 'Skill gekopieerd' : 'Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  /**
   * Zet de samengestelde prompt klaar in de chat: de prompt gaat via een
   * sessionStorage-handoff mee (overleeft óók de login-redirect van
   * RequireAuth) en komt daar in het invoerveld te staan. Bewust niet
   * verstuurd: de plekken tussen [haakjes] moet de gebruiker eerst zelf
   * invullen.
   */
  /** Download de getoonde versie als SKILL.md, met naam en beschrijving als kop. */
  function handleDownloadSkill() {
    if (!skill) return;
    // Het skillformaat schrijft precies deze bestandsnaam voor; de map eromheen
    // krijgt de naam uit de kop.
    downloadText('SKILL.md', buildSkillMd(skill, result.optimized_content), 'text/markdown');
  }

  /**
   * Download de skill als plugin in de mapstructuur van de skills-marketplace
   * van developer.overheid.nl, zodat hij in Claude Code, Codex of Cursor te
   * installeren is en later bij die marketplace kan worden aangemeld.
   */
  async function handleDownloadPlugin() {
    if (!skill) return;
    try {
      // De EUPL-tekst staat als los bestand in public/; lukt ophalen niet, dan
      // gaat het pakket zonder LICENSE en zegt de README dat er een bij moet.
      const licentie = await fetch('/licenses/EUPL-1.2.txt')
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '');
      await downloadZip(
        `${skillSlug(skill.naam)}.zip`,
        buildSkillPlugin(skill, result.optimized_content, {
          licentie: licentie.startsWith('EUROPEAN UNION PUBLIC LICENCE') ? licentie : undefined,
        }),
      );
    } catch {
      toast.error('Het pakket kon niet worden gemaakt. Download SKILL.md los.');
    }
  }

  // Welke bronnen er echt in de prompt staan. Alleen bekend bij een stream; en
  // "geen enkele" is pas een melding waard als er wel bronnen waren.
  const used = result.usedSources ? new Set(result.usedSources) : null;
  const unusedAll = Boolean(used && used.size === 0 && result.sources?.length);

  function handleSendToChat() {
    writeHandoff(result.optimized_content, 'compose');
    navigate('/chat');
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
        {skill ? 'Je skill' : 'Je herbruikbare prompt'}
      </h3>

      {skill ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plak deze skill één keer in je eigen AI-omgeving, bijvoorbeeld als instructie van een
          Mistral-agent of als projectinstructie. Daarna geef je alleen je invoer, en de AI pakt die
          elke keer op dezelfde manier aan. Werk je met een omgeving die Agent Skills leest, download
          hem dan als <span className="font-mono text-xs">SKILL.md</span>, of als plugin in de vorm
          die de skills-marketplace van developer.overheid.nl gebruikt. In de kop staat dat hij met AI
          is gemaakt en nog een concept is, zoals het overheidsbrede standpunt over generatieve AI
          vraagt.
        </p>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Kopieer deze prompt naar je eigen AI-chat, sla hem op voor je collega&apos;s, of laat de AI
          hem <span className="font-medium">direct uitvoeren</span> voor een kant-en-klaar resultaat.
          Vul de plekken tussen <span className="font-mono text-xs">[haakjes]</span> per keer aan met
          je eigen inhoud.
        </p>
      )}

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

      {/* Wat er tijdens het bouwen gebeurde: zo zie je dat denken en zoeken
          echt zijn gebruikt, en waar de extra tijd heen ging. */}
      {result.trace && (result.trace.thought || result.trace.searched || result.trace.reviewed) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {result.trace.thought && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-50 px-2 py-0.5 font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
              <Brain size={11} /> Nagedacht
            </span>
          )}
          {result.trace.reviewed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-50 px-2 py-0.5 font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
              <RotateCcw size={11} /> Twee rondes: eerste versie nagekeken
            </span>
          )}
          {result.trace.searched && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-50 px-2 py-0.5 font-medium text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
              <Globe size={11} /> Internet geraadpleegd
              {result.sources?.length
                ? ` · ${used?.size ?? 0} van ${result.sources.length} bronnen verwerkt`
                : ' · geen bronnen gevonden'}
            </span>
          )}
          <span className="text-slate-400 dark:text-slate-500">{result.trace.seconds}s</span>
        </div>
      )}

      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {result.optimized_content}
      </pre>

      {/* Zocht de AI eerst op internet, of kreeg hij
          pagina's uit de kennisbank van developer.overheid.nl, dan staan hier de
          pagina's die hij kreeg: echte links om na te lezen of de feiten in de
          prompt kloppen. */}
      {/* Meldingen over de bouw: zoeken leverde niets op of mocht niet, of de
          bronnen kwamen niet in de prompt terecht. */}
      {(result.notices?.length || unusedAll) && (
        <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {result.notices?.map((n) => <p key={n}>{n}</p>)}
          {unusedAll && (
            <p>
              De AI heeft geen van de gevonden bronnen in de prompt verwerkt. Bouw de prompt
              opnieuw, of kijk in de bronnen hieronder of ze wel over je opdracht gaan.
            </p>
          )}
        </div>
      )}

      {result.sources && result.sources.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            <Globe size={12} className="shrink-0" />
            {sourcesLabel(result.sources)}
          </p>
          <ol className="space-y-0.5">
            {result.sources.map((source, i) => (
              <li key={source.url} className="flex gap-1.5 text-xs">
                <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
                  [{i + 1}]
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 truncate text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                  title={source.url}
                >
                  {source.title}
                </a>
                {used?.has(source.url) && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-rijksgroen"
                    title="Deze bron staat met zijn URL in de prompt"
                  >
                    <Check size={11} /> verwerkt
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

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
        {/* Kopiëren in chat: de prompt komt in het invoerveld van een nieuwe chat
            te staan en wordt niet verstuurd. Uitgeschakeld wanneer de beheerder
            de chat uitzette, anders zou de prompt stilletjes verdwijnen in een
            handoff die nooit vuurt. */}
        <button
          className="opl-btn-accent"
          onClick={handleSendToChat}
          disabled={!chatAvailable}
          title={
            !chatAvailable
              ? 'De beheerder heeft de chat uitgeschakeld.'
              : 'Zet de prompt klaar in de chat; je verstuurt hem daar zelf.'
          }
        >
          <MessageSquarePlus size={16} /> Kopiëren in chat
        </button>
        {skill && (
          <button
            className="opl-btn-secondary"
            onClick={handleDownloadSkill}
            title="Download deze skill als SKILL.md, met naam en beschrijving erboven"
          >
            <Download size={16} /> Download SKILL.md
          </button>
        )}
        {skill && (
          <button
            className="opl-btn-secondary"
            onClick={() => void handleDownloadPlugin()}
            title="Download de skill als plugin (zip) voor Claude Code, Codex of Cursor, in de opbouw van de overheidsmarketplace"
          >
            <FolderDown size={16} /> Download als plugin
          </button>
        )}
        <button className="opl-btn-primary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Gekopieerd' : skill ? 'Kopieer skill' : 'Kopieer prompt'}
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
                {dialogue.frameworkReason ? `: ${dialogue.frameworkReason}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const KENNISBANK_PREFIX = 'https://developer.overheid.nl/';

/** Kop boven de bronnen: kennisbank, internet of allebei. */
function sourcesLabel(sources: { url: string }[]): string {
  const kennisbank = sources.filter((s) => s.url.startsWith(KENNISBANK_PREFIX)).length;
  if (kennisbank === sources.length) return 'Uit de kennisbank van developer.overheid.nl';
  if (kennisbank === 0) return 'Bronnen van internet';
  return 'Bronnen';
}
