import { useEffect, useMemo, useRef, useState } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import InfoDot from '@/components/common/InfoDot';
import { useAuth } from '@/context/AuthContext';
import { matchProject } from '@/lib/projectMatch';
import { writeNewProjectHandoff } from '@/services/handoffService';
import {
  generatorCharsUsed,
  listProjectFiles,
  MAX_GENERATOR_CONTEXT_CHARS,
  type GeneratorContext,
} from '@/services/chatProjectService';
import type { ChatProject, ChatProjectFile } from '@/types';

/** Wat een instap meegeeft om de context bij zijn eigen tekstvak te tonen. */
export interface ProjectContextSlot {
  /** De tekst in het invoerveld, voor `@` en het voorstel. */
  text: string;
  /** Haal de getypte `@` weer uit het invoerveld. */
  stripMention: () => void;
  className?: string;
}

/** Zoveel bronlabels staan er los; de rest wordt één knop "+3". */
const MAX_FILE_CHIPS = 3;

const nl = (n: number) => n.toLocaleString('nl-NL');

/**
 * De projectcontext van de bouwer: de knop "Context" plus de labels van wat er
 * meegaat, op de plek waar je typt. Zelfde gebaar als in de chat, en de stappen
 * erboven blijven daardoor gelijk voor wie geen project gebruikt.
 *
 * De keuzelijst is een nldd-popover in de knop: die staat in de bovenste laag,
 * dus geen kaart om de knop heen knipt hem af.
 *
 * WAAROM DE BRONKEUZE PAS BIJ "KLAAR" INGAAT
 * Elke andere selectie is ander materiaal en dus een nieuwe AI-analyse van
 * tientallen seconden. Wie drie bronnen aanvinkt wil er één, geen drie. Daarom
 * staat de selectie zolang de lijst open is in `draft`. Een label weghalen is één
 * duidelijke handeling en gaat wel meteen.
 *
 * WAT HET VOORSTEL DOET
 * Gaat de tekst zichtbaar over een eigen project, dan vraagt de strook of dat
 * mee moet. Dat vangt op dat een knop minder opvalt dan de vroegere balk: wie
 * nooit op "Context" klikt, ziet de mogelijkheid alsnog op het juiste moment.
 */
export default function ProjectContextPicker({
  projects,
  context,
  activeProjectId,
  loading,
  text,
  onStripMention,
  onPick,
  onClear,
  onSelectFiles,
}: {
  /** De projecten van de ingelogde gebruiker. */
  projects: ChatProject[];
  context: GeneratorContext | null;
  /** Het gekozen project; loopt voor op `context` zolang die nog laadt. */
  activeProjectId: string | null;
  loading: boolean;
  /** De tekst in het invoerveld, voor `@` en het voorstel. */
  text: string;
  /** Haal de getypte `@` weer uit het invoerveld. */
  onStripMention: () => void;
  onPick: (projectId: string) => void;
  onClear: () => void;
  onSelectFiles: (fileIds: string[]) => void;
  className?: string;
}) {
  const { isAuthenticated, configured } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [files, setFiles] = useState<ChatProjectFile[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const popoverRef = useRef<HTMLElement>(null);
  // De lijst ging open door `@` te typen: dan hoort die `@` er bij het sluiten
  // weer uit en blijft de cursor in het tekstvak in plaats van op de knop.
  const openedByMention = useRef(false);
  const previousText = useRef(text);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const projectName = context?.name ?? activeProject?.name ?? '';
  const committed = useMemo(() => context?.files.map((f) => f.id) ?? [], [context]);
  const selected = draft ?? committed;

  // De bestandenlijst hoort bij het project, niet bij het openen van de lijst:
  // zo staat hij klaar en springt de lijst niet in hoogte.
  useEffect(() => {
    setFiles([]);
    if (!activeProjectId) return;
    let active = true;
    listProjectFiles(activeProjectId)
      .then((list) => {
        if (active) setFiles(list);
      })
      .catch(() => {
        /* zonder lijst blijft de instructie gewoon meegaan */
      });
    return () => {
      active = false;
    };
  }, [activeProjectId]);

  // The popover closes itself on Escape, a click outside or a click on its button,
  // and closing is when the choice of sources takes effect.
  function handleClosed() {
    setOpen(false);
    if (draft && [...draft].sort().join() !== [...committed].sort().join()) {
      onSelectFiles(draft);
    }
    setDraft(null);
    if (openedByMention.current) {
      openedByMention.current = false;
      if (text.endsWith('@')) onStripMention();
    }
  }
  useNlddEvent(popoverRef, 'close', handleClosed);
  useNlddEvent(popoverRef, 'open', () => setOpen(true));

  // `@` aan het begin van een woord opent de lijst; een e-mailadres niet. Typt
  // iemand daarna gewoon door, dan was het niet voor ons bedoeld.
  useEffect(() => {
    const previous = previousText.current;
    previousText.current = text;
    if (text.length === previous.length + 1 && /(^|\s)@$/.test(text)) {
      openedByMention.current = true;
      setOpen(true);
    } else if (open && openedByMention.current && !text.endsWith('@')) {
      openedByMention.current = false;
      setOpen(false);
    }
  }, [text, open]);

  const suggestion = useMemo(() => {
    if (activeProjectId || loading || !isAuthenticated) return null;
    return matchProject(
      text,
      projects.filter((p) => !dismissed.includes(p.id)),
    );
  }, [activeProjectId, loading, isAuthenticated, text, projects, dismissed]);

  // Mock-modus (geen backend): dan bestaan projecten niet.
  if (!configured) return null;

  function pickProject(id: string) {
    if (id === activeProjectId) return;
    setDraft(null);
    onPick(id);
  }

  function toggleFile(id: string) {
    setDraft(selected.includes(id) ? selected.filter((f) => f !== id) : [...selected, id]);
  }

  const chosenFiles = files.filter((f) => selected.includes(f.id));
  const used = generatorCharsUsed(activeProject?.instructions ?? '', chosenFiles);
  const over = used > MAX_GENERATOR_CONTEXT_CHARS;

  // De labels tonen wat er echt meegaat, niet wat er in de lijst is aangevinkt:
  // een bron die niet paste hoort hier niet te staan alsof de AI hem kent.
  const chips = context?.files ?? [];
  const hiddenChips = chips.length - MAX_FILE_CHIPS;

  const panel = (
    <nldd-popover ref={popoverRef} slot="popup" width="360px" accessible-label="Context kiezen" open={open || undefined}>
      <nldd-container padding="8" gap="8">
        {isAuthenticated ? (
          <>
            {projects.length > 0 && (
              <nldd-list accessible-label="Project">
                {projects.map((project) => {
                  const active = project.id === activeProjectId;
                  return (
                    <nldd-list-item
                      key={project.id}
                      button
                      size="sm"
                      selected={active || undefined}
                      onClick={() => pickProject(project.id)}
                    >
                      <nldd-icon-cell icon="folder-open" size="20" color="accent"></nldd-icon-cell>
                      <nldd-spacer-cell size="8"></nldd-spacer-cell>
                      <nldd-text-cell text={project.name}></nldd-text-cell>
                      {active && <nldd-icon-cell icon="check-mark" size="20" color="accent"></nldd-icon-cell>}
                    </nldd-list-item>
                  );
                })}
              </nldd-list>
            )}

            {activeProjectId && files.length > 0 && (
              <>
                <nldd-divider></nldd-divider>
                <nldd-text size="xs" weight="bold" color="secondary">
                  Bronnen
                </nldd-text>
                <nldd-list accessible-label="Bronnen">
                  {files.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      checked={selected.includes(file.id)}
                      onToggle={() => toggleFile(file.id)}
                    />
                  ))}
                </nldd-list>
                <nldd-text size="sm" weight="medium" color={over ? 'warning' : 'secondary'}>
                  {over
                    ? 'Past niet meer: zet een bron uit.'
                    : `${nl(used)} van ${nl(MAX_GENERATOR_CONTEXT_CHARS)} tekens`}
                </nldd-text>
              </>
            )}
          </>
        ) : (
          <nldd-text size="sm">Log in om een project te gebruiken.</nldd-text>
        )}

        <nldd-divider></nldd-divider>
        <nldd-container layout="wrap" gap="8" vertical-alignment="center">
          {isAuthenticated ? (
            <nldd-button
              size="sm"
              appearance="neutral-transparent"
              start-icon="plus"
              text="Nieuw project"
              href="/chat"
              onClick={writeNewProjectHandoff}
            ></nldd-button>
          ) : (
            <nldd-button size="sm" appearance="neutral-transparent" text="Inloggen" href="/auth/login"></nldd-button>
          )}
          {activeProjectId && (
            <nldd-button
              size="sm"
              appearance="neutral-transparent"
              text="Verder zonder project"
              onClick={() => {
                setDraft(null);
                onClear();
              }}
            ></nldd-button>
          )}
          <nldd-spacer size="flexible"></nldd-spacer>
          <nldd-button size="sm" appearance="primary" text="Klaar" onClick={() => setOpen(false)}></nldd-button>
        </nldd-container>
      </nldd-container>
    </nldd-popover>
  );

  return (
    <nldd-container gap="6">
      <nldd-container layout="wrap" gap="6" vertical-alignment="center">
        <nldd-button appearance="secondary" size="sm" start-icon="plus" text="Context" expandable>
          {panel}
        </nldd-button>

        {activeProjectId && projectName && (
          <>
            {loading && <nldd-activity-indicator size="16" timing="instant"></nldd-activity-indicator>}
            <Chip text={projectName} dismissText="Project loskoppelen" onDismiss={onClear} />
          </>
        )}

        {chips.slice(0, MAX_FILE_CHIPS).map((file) => (
          <Chip
            key={file.id}
            text={file.name}
            dismissText={`${file.name} weghalen`}
            onDismiss={() => onSelectFiles(committed.filter((id) => id !== file.id))}
          />
        ))}

        {hiddenChips > 0 && (
          <nldd-button
            size="sm"
            appearance="neutral-tinted"
            text={`+${hiddenChips}`}
            accessible-label={`Nog ${hiddenChips} bronnen bekijken`}
            onClick={() => setOpen(true)}
          ></nldd-button>
        )}

        {loading && (
          <nldd-text size="sm" color="secondary">
            Je project wordt geanalyseerd…
          </nldd-text>
        )}

        {!activeProjectId && !suggestion && (
          <InfoDot
            label="Uitleg over context"
            text={'Voeg een project toe. De AI kent je onderwerp dan al en schrijft een scherpere prompt.\nTyp @ om te kiezen.'}
          />
        )}
      </nldd-container>

      {suggestion && !open && (
        <Suggestion
          name={suggestion.name}
          onTake={() => pickProject(suggestion.id)}
          onDismiss={() => setDismissed((list) => [...list, suggestion.id])}
        />
      )}

      {context && context.skipped.length > 0 && (
        <nldd-text size="sm" weight="medium" color="warning">
          Past niet meer, weggelaten: {context.skipped.join(', ')}. Haal een bron weg.
        </nldd-text>
      )}
    </nldd-container>
  );
}

/** One source of the project, on or off for this prompt. */
function FileRow({ file, checked, onToggle }: { file: ChatProjectFile; checked: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => {
    if (e.detail?.checked !== checked) onToggle();
  });
  return (
    <nldd-list-item ref={ref} checkbox size="sm" checked={checked || undefined}>
      <nldd-cell>
        <nldd-checkbox decorative checked={checked || undefined}></nldd-checkbox>
      </nldd-cell>
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-text-cell text={file.name}></nldd-text-cell>
      <nldd-text-cell width="fit-content" size="sm" color="secondary" text={nl(file.chars)}></nldd-text-cell>
    </nldd-list-item>
  );
}

/** What goes along with the prompt, removable one by one. */
function Chip({ text, dismissText, onDismiss }: { text: string; dismissText: string; onDismiss: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'dismiss', onDismiss);
  return <nldd-token ref={ref} control="dismiss" text={text} dismiss-text={dismissText}></nldd-token>;
}

/** Asks whether a project the text seems to be about should come along. */
function Suggestion({ name, onTake, onDismiss }: { name: string; onTake: () => void; onDismiss: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'dismiss', onDismiss);
  return (
    <nldd-banner ref={ref} variant="accent" size="sm" icon="sparkles" text={`Dit lijkt op je project ${name}.`} dismissible>
      <nldd-button slot="actions" text="Meenemen" onClick={onTake}></nldd-button>
    </nldd-banner>
  );
}
