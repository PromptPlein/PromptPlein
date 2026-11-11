import { useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNavigate } from 'react-router-dom';
import { useNlddEvent } from '@/lib/nldd';
import { copyToClipboard } from '@/lib/utils';
import { downloadText, downloadZip } from '@/lib/download';
import { buildSkillMd, buildSkillPlugin, skillSlug, type SkillMeta } from '@/lib/skill';
import { writeHandoff } from '@/services/chatService';
import { getChatSettingsCached, type ChatSettings } from '@/services/settingsService';
import { useAuth } from '@/context/AuthContext';
import ShareModal from '@/components/share/ShareModal';
import SavePromptPanel from '@/components/prompts/SavePromptPanel';
import RoutekaartResult from '@/components/optimizer/RoutekaartResult';
import { isSjabloon, sjabloonNaam } from '@/lib/techniques';
import type { OptimizeResult, Prompt, PromptDialogue, Technique } from '@/types';
import '@nldd/design-system/badge';
import '@nldd/design-system/banner';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/cell';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/segmented-control';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';
import '@nldd/design-system/tooltip';

interface OptimizedOutputProps {
  result: OptimizeResult;
  /** De gekozen techniek (voor de standaardtitel + categorie van de template). */
  technique?: Technique | null;
  /** Het doel dat de gebruiker beschreef (voor een zinvolle standaardtitel). */
  goal?: string;
  onReset: () => void;
  /**
   * Terug naar de velden waaruit deze prompt is gebouwd, om ze aan te passen en
   * opnieuw te bouwen. Zonder deze functie (geen velden bekend) geen knop.
   */
  onEditFields?: () => void;
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
  onEditFields,
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
    notify.success(skill ? 'Skill gekopieerd' : 'Prompt gekopieerd');
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
      notify.error('Het pakket kon niet worden gemaakt. Download SKILL.md los.');
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
    <nldd-container gap="16">
      <nldd-title heading-level={3} size={5} text={skill ? 'Je skill' : 'Je herbruikbare prompt'}></nldd-title>

      {skill ? (
        <nldd-text size="sm" color="secondary">
          Plak deze skill één keer in je eigen AI-omgeving, bijvoorbeeld als instructie van een
          Mistral-agent of als projectinstructie. Daarna geef je alleen je invoer, en de AI pakt die
          elke keer op dezelfde manier aan. Werk je met een omgeving die Agent Skills leest, download
          hem dan als <code>SKILL.md</code>, of als plugin in de vorm die de skills-marketplace van
          developer.overheid.nl gebruikt. In de kop staat dat hij met AI is gemaakt en nog een concept
          is, zoals het overheidsbrede standpunt over generatieve AI vraagt.
        </nldd-text>
      ) : (
        <nldd-text size="sm" color="secondary">
          Kopieer deze prompt naar je eigen AI-chat, sla hem op voor je collega&apos;s, of laat de AI
          hem <strong>direct uitvoeren</strong> voor een kant-en-klaar resultaat. Vul de plekken
          tussen <code>[haakjes]</code> per keer aan met je eigen inhoud.
        </nldd-text>
      )}

      {result.error && <nldd-banner variant="warning" size="sm" text={result.error}></nldd-banner>}

      {/* Routekaart: het bestand zelf, met de vaste opmaak van PromptPlein. De
          opdracht eronder blijft bruikbaar voor een andere AI-omgeving. */}
      {technique && isSjabloon(technique) && sjabloonNaam(technique.template) === 'route' && (
        <RoutekaartResult content={result.optimized_content} />
      )}

      {/* Versies: verschijnen zodra de verbeter-lus een tweede versie oplevert.
          De nieuwste staat rechts en is bij aankomst actief. */}
      {versions && versions.length > 1 && onSelectVersion && (
        <VersionPicker count={versions.length} active={activeVersion} onSelect={onSelectVersion} />
      )}

      {/* Wat er tijdens het bouwen gebeurde: zo zie je dat denken en zoeken
          echt zijn gebruikt, en waar de extra tijd heen ging. */}
      {result.trace && (result.trace.thought || result.trace.searched || result.trace.reviewed) && (
        <nldd-container layout="wrap" gap="6" vertical-alignment="center">
          {result.trace.thought && <nldd-tag size="sm" color="accent" icon="brain" text="Nagedacht"></nldd-tag>}
          {result.trace.reviewed && (
            <nldd-tag size="sm" color="accent" icon="arrow-2-counter-clockwise" text="Twee rondes: eerste versie nagekeken"></nldd-tag>
          )}
          {result.trace.searched && (
            <nldd-tag
              size="sm"
              color="accent"
              icon="globe"
              text={`Internet geraadpleegd, ${
                result.sources?.length
                  ? `${used?.size ?? 0} van ${result.sources.length} bronnen verwerkt`
                  : 'geen bronnen gevonden'
              }`}
            ></nldd-tag>
          )}
          <nldd-text size="xs" color="secondary">
            {result.trace.seconds}s
          </nldd-text>
        </nldd-container>
      )}

      <nldd-code-viewer wrap max-height="420px">
        {result.optimized_content}
      </nldd-code-viewer>

      {/* Meldingen over de bouw: zoeken leverde niets op of mocht niet, of de
          bronnen kwamen niet in de prompt terecht. */}
      {(result.notices?.length || unusedAll) && (
        <nldd-banner variant="warning" size="sm">
          <nldd-container gap="4">
            {result.notices?.map((n) => (
              <nldd-text key={n} size="sm">
                {n}
              </nldd-text>
            ))}
            {unusedAll && (
              <nldd-text size="sm">
                De AI heeft geen van de gevonden bronnen in de prompt verwerkt. Bouw de prompt
                opnieuw, of kijk in de bronnen hieronder of ze wel over je opdracht gaan.
              </nldd-text>
            )}
          </nldd-container>
        </nldd-banner>
      )}

      {/* Zocht de AI eerst op internet, of kreeg hij pagina's uit de kennisbank van
          developer.overheid.nl, dan staan hier de pagina's die hij kreeg: echte
          links om na te lezen of de feiten in de prompt kloppen. */}
      {result.sources && result.sources.length > 0 && (
        <nldd-list accessible-label={sourcesLabel(result.sources)}>
          {result.sources.map((source, i) => (
            <nldd-list-item key={source.url} size="sm" href={source.url} target="_blank">
              <nldd-text-cell width="fit-content" color="secondary" text={`[${i + 1}]`}></nldd-text-cell>
              <nldd-spacer-cell size="8"></nldd-spacer-cell>
              <nldd-text-cell text={source.title} supporting-text={source.url}></nldd-text-cell>
              {used?.has(source.url) && (
                <nldd-cell>
                  <nldd-badge size="sm" color="success" icon="check-mark" text="verwerkt"></nldd-badge>
                </nldd-cell>
              )}
              <nldd-icon-cell size="20" color="secondary" icon="square-arrow-right-top"></nldd-icon-cell>
            </nldd-list-item>
          ))}
        </nldd-list>
      )}

      {/* Kwam deze prompt uit de doel-dialoog? Dan is navolgbaar waar hij vandaan
          komt: het beschreven doel, de gestelde vragen met je antwoorden, de
          opdrachtbeschrijving die eruit volgde en het gekozen framework. Bewust
          ingeklapt: de prompt zelf is de hoofdzaak. */}
      {result.dialogue && <DialogueSummary dialogue={result.dialogue} />}

      {/* Opgeslagen-bevestiging */}
      {saved && (
        <nldd-banner variant="success" size="sm" icon="folder" text="Opgeslagen als herbruikbare prompt.">
          <nldd-button slot="actions" text="Bekijk in de bibliotheek" href={`/prompt/${saved.id}`}></nldd-button>
        </nldd-banner>
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
      <nldd-container layout="wrap" gap="12">
        <nldd-button
          appearance="primary"
          start-icon={copied ? 'check-mark' : 'copy'}
          text={copied ? 'Gekopieerd' : skill ? 'Kopieer skill' : 'Kopieer prompt'}
          onClick={() => void handleCopy()}
        ></nldd-button>
        {saved ? (
          <nldd-button
            appearance="secondary"
            start-icon="share-network"
            text="Delen met collega's"
            onClick={() => setShareOpen(true)}
          ></nldd-button>
        ) : (
          <nldd-button
            appearance="secondary"
            start-icon="save"
            text="Opslaan in bibliotheek"
            expanded={showSave || undefined}
            onClick={() => setShowSave((v) => !v)}
          ></nldd-button>
        )}
        {/* Kopiëren in chat: de prompt komt in het invoerveld van een nieuwe chat
            te staan en wordt niet verstuurd. Uitgeschakeld wanneer de beheerder
            de chat uitzette, anders zou de prompt stilletjes verdwijnen in een
            handoff die nooit vuurt. */}
        <nldd-tooltip
          text={
            !chatAvailable
              ? 'De beheerder heeft de chat uitgeschakeld.'
              : 'Zet de prompt klaar in de chat; je verstuurt hem daar zelf.'
          }
        >
          <nldd-button
            appearance="secondary"
            start-icon="comment"
            text="Kopiëren in chat"
            disabled={!chatAvailable || undefined}
            onClick={handleSendToChat}
          ></nldd-button>
        </nldd-tooltip>
        {skill && (
          <nldd-button
            appearance="secondary"
            start-icon="download"
            text="Download SKILL.md"
            onClick={handleDownloadSkill}
          ></nldd-button>
        )}
        {skill && (
          <nldd-button
            appearance="secondary"
            start-icon="download-document"
            text="Download als plugin"
            supporting-text="zip voor Claude Code, Codex of Cursor"
            onClick={() => void handleDownloadPlugin()}
          ></nldd-button>
        )}
        {onEditFields && (
          <nldd-button
            appearance="secondary"
            start-icon="pencil"
            text="Velden aanpassen"
            onClick={onEditFields}
          ></nldd-button>
        )}
        <nldd-button appearance="neutral-transparent" start-icon="arrow-2-counter-clockwise" text="Opnieuw" onClick={onReset}></nldd-button>
      </nldd-container>

      {saved && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} prompt={saved} />}
    </nldd-container>
  );
}

/** Switches between the versions of the improvement loop; the newest is on the right. */
function VersionPicker({ count, active, onSelect }: { count: number; active: number; onSelect: (i: number) => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value: string }>>(ref, 'change', (e) => {
    const i = Number(e.detail?.value);
    if (Number.isInteger(i)) onSelect(i);
  });
  return (
    <nldd-segmented-control ref={ref} size="sm" width="fit-content" accessible-label="Versies" value={String(active)}>
      {Array.from({ length: count }, (_, i) => (
        <nldd-segmented-control-item
          key={i}
          value={String(i)}
          selected={i === active || undefined}
          text={`v${i + 1}${i === count - 1 && i > 0 ? ', nieuwste' : ''}`}
        ></nldd-segmented-control-item>
      ))}
    </nldd-segmented-control>
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
    <nldd-card>
      <nldd-container padding="12" gap="12">
        <nldd-button
          appearance="neutral-transparent"
          width="full"
          horizontal-alignment="left"
          end-icon={open ? 'chevron-up' : 'chevron-down'}
          text="Hoe deze prompt tot stand kwam"
          supporting-text={`${dialogue.transcript.length} vragen beantwoord, framework: ${dialogue.frameworkName ?? 'geen'}`}
          expanded={open || undefined}
          onClick={() => setOpen((v) => !v)}
        ></nldd-button>

        {open && (
          <nldd-container gap="16" padding-inline="12">
            <nldd-container gap="4">
              <nldd-text size="xs" weight="bold" color="secondary">
                Wat je wilde bereiken
              </nldd-text>
              <nldd-text size="sm">{dialogue.goal}</nldd-text>
            </nldd-container>

            {dialogue.transcript.length > 0 && (
              <nldd-container gap="4">
                <nldd-text size="xs" weight="bold" color="secondary">
                  Gestelde vragen ({dialogue.transcript.length})
                </nldd-text>
                <nldd-list appearance="box-tinted" accessible-label="Gestelde vragen">
                  {dialogue.transcript.map((turn, i) => (
                    <nldd-list-item key={i} size="sm">
                      <nldd-text-cell text={`${i + 1}. ${turn.question}`} supporting-text={turn.answer}></nldd-text-cell>
                    </nldd-list-item>
                  ))}
                </nldd-list>
              </nldd-container>
            )}

            <nldd-container gap="4">
              <nldd-text size="xs" weight="bold" color="secondary">
                Opdrachtbeschrijving uit het gesprek
              </nldd-text>
              <nldd-code-viewer wrap max-height="256px">
                {dialogue.brief}
              </nldd-code-viewer>
            </nldd-container>

            {dialogue.frameworkName && (
              <nldd-container gap="4">
                <nldd-text size="xs" weight="bold" color="secondary">
                  Gekozen framework
                </nldd-text>
                <nldd-text size="sm">
                  <strong>{dialogue.frameworkName}</strong>
                  {dialogue.frameworkReason ? `: ${dialogue.frameworkReason}` : ''}
                </nldd-text>
              </nldd-container>
            )}
          </nldd-container>
        )}
      </nldd-container>
    </nldd-card>
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
