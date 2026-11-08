import { type ReactNode } from 'react';
import InfoDot from '@/components/common/InfoDot';
import MenuAction from '@/components/common/MenuAction';
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry, ChatProject } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/container';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/menu';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/**
 * Kopregel van een lijst met het plusje rechts op dezelfde hoogte.
 *
 * Het kopje en de knop delen één regel zodat "Projecten" en "Chats" precies
 * dezelfde vorm hebben: label links, plus helemaal rechts. Het plusje is
 * bewust ingetogen: de grote knop bovenaan blijft de hoofdweg, dit is de
 * snelkoppeling voor wie al weet waar hij heen wil. Wat een project is, staat
 * achter het infobolletje naast het kopje.
 */
function SectionHeading({
  label,
  addLabel,
  onAdd,
  disabled,
  info,
  more,
}: {
  label: string;
  /** Extra control after the plus, such as the menu with less common actions. */
  more?: ReactNode;
  /** Korte uitleg achter een infobolletje naast het kopje. */
  info?: string;
  /** Wat de knop doet, in gewone taal: wordt het toegankelijkheidslabel. */
  addLabel: string;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-title heading-level={2} size={6} text={label}></nldd-title>
      {info && <InfoDot label={`Uitleg over ${label.toLowerCase()}`} text={info} />}
      <nldd-spacer size="flexible"></nldd-spacer>
      <nldd-icon-button
        size="sm"
        appearance="neutral-transparent"
        icon="plus"
        text={addLabel}
        disabled={disabled || undefined}
        onClick={onAdd}
      ></nldd-icon-button>
      {more}
    </nldd-container>
  );
}

/**
 * Zijbalk: projecten boven, losse gesprekken eronder.
 *
 * De volgorde is de boodschap. Een project is een plek waar je naartoe gaat en
 * waar je werk zich verzamelt; een los gesprek is een losse vraag. Gesprekken
 * die bij een project horen staan daarom NIET in de lijst hieronder maar in het
 * project zelf, anders zou dezelfde chat op twee plaatsen staan en zou de
 * lijst voor iemand met een druk project onbruikbaar worden.
 *
 * Puur presentationeel: verwijderacties vragen de pagina om bevestiging via
 * onRequestDelete/onRequestDeleteAll.
 */
export default function ChatSidebar({
  entries,
  totalConversations,
  projects,
  activeId,
  openProjectId,
  disabled,
  onSelect,
  onNew,
  onNewProject,
  onOpenProject,
  onRequestDelete,
  onRequestDeleteAll,
  onExport,
  onImport,
  canExport,
  footer,
}: {
  /** Alleen de LOSSE gesprekken; projectgesprekken staan in hun project. */
  entries: ChatIndexEntry[];
  /**
   * Totaal aantal gesprekken op dit apparaat, projectgesprekken meegeteld.
   * "Alles verwijderen" wist ze namelijk állemaal, dus die knop mag niet
   * verdwijnen zodra alleen de losse lijst leeg is.
   */
  totalConversations: number;
  projects: ChatProject[];
  activeId: string | null;
  /** Het project dat op dit moment geopend is (de projectpagina). */
  openProjectId: string | null;
  /** Tijdens het streamen is wisselen/verwijderen uitgeschakeld. */
  disabled: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestDeleteAll: () => void;
  /** Bewaar alle chats als bestand op dit apparaat. */
  onExport: () => void;
  /** Zet een bewaard bestand terug. */
  onImport: () => void;
  canExport: boolean;
  /** The quiet line about where chats live, at the bottom. */
  footer?: ReactNode;
}) {
  return (
    <nldd-container gap="16">
      {/* Eén knop met een klein menu erachter: nieuw gesprek is de gewone daad,
          nieuw project de zeldzame. Twee even grote knoppen zouden suggereren
          dat je elke keer moet kiezen. */}
      <nldd-button
        appearance="primary"
        width="full"
        start-icon="plus"
        text="Nieuw"
        expandable
        disabled={disabled || undefined}
      >
        <nldd-menu slot="popup" accessible-label="Nieuw">
          <MenuAction icon="message-rectangle-text" text="Nieuwe chat" onSelect={onNew} />
          <MenuAction icon="folder-open" text="Nieuw project" onSelect={onNewProject} />
        </nldd-menu>
      </nldd-button>

      {/* De kopregels zijn tegelijk de snelste weg naar "nog een erbij": het
          plusje staat rechts op dezelfde regel als het kopje. Daarom staan ze
          er ook als de lijst nog leeg is, anders is de knop pas te vinden
          nadat je al een project hebt. */}
      <nldd-container gap="4">
        <SectionHeading
          label="Projecten"
          addLabel="Nieuw project"
          onAdd={onNewProject}
          disabled={disabled}
          info="Een project bundelt een instructie, bronbestanden en chats over één onderwerp."
        />
        <nldd-list accessible-label="Projecten">
          {projects.map((project) => (
            <nldd-list-item key={project.id} size="sm">
              <nldd-list-item-segment
                width="full"
                button
                current={project.id === openProjectId || undefined}
                disabled={disabled || undefined}
                onClick={() => onOpenProject(project.id)}
              >
                <nldd-icon-cell icon="folder-open" size="20" color="content"></nldd-icon-cell>
                <nldd-spacer-cell size="8"></nldd-spacer-cell>
                <nldd-text-cell
                  text={project.name}
                  supporting-text={
                    project.fileCount
                      ? `${project.fileCount} ${project.fileCount === 1 ? 'bronbestand' : 'bronbestanden'}`
                      : undefined
                  }
                ></nldd-text-cell>
              </nldd-list-item-segment>
            </nldd-list-item>
          ))}
          <nldd-text slot="empty" size="sm" color="secondary">
            Nog geen projecten.
          </nldd-text>
        </nldd-list>
      </nldd-container>

      <nldd-container gap="4">
        <SectionHeading
          label="Chats"
          addLabel="Nieuwe chat"
          onAdd={onNew}
          disabled={disabled}
          more={
            <nldd-icon-button
              size="sm"
              appearance="neutral-transparent"
              icon="more"
              text="Meer"
              accessible-label="Meer acties voor chats"
              disabled={disabled || undefined}
            >
              <nldd-menu slot="popup" placement="bottom-end" accessible-label="Meer acties voor chats">
                <MenuAction
                  icon="download"
                  text="Bewaren als bestand"
                  disabled={!canExport || undefined}
                  onSelect={onExport}
                />
                <MenuAction icon="upload" text="Terugzetten uit bestand" onSelect={onImport} />
                {totalConversations > 0 && (
                  <>
                    <nldd-menu-divider></nldd-menu-divider>
                    <MenuAction icon="trash" text="Verwijder alle chats" destructive onSelect={onRequestDeleteAll} />
                  </>
                )}
              </nldd-menu>
            </nldd-icon-button>
          }
        />
        <nldd-list accessible-label="Chats">
          {entries.map((entry) => (
            <nldd-list-item key={entry.id} size="sm">
              <nldd-list-item-segment
                width="full"
                button
                current={entry.id === activeId || undefined}
                disabled={disabled || undefined}
                onClick={() => onSelect(entry.id)}
              >
                <nldd-icon-cell icon="message-rectangle-text" size="20" color="content"></nldd-icon-cell>
                <nldd-spacer-cell size="8"></nldd-spacer-cell>
                <nldd-text-cell text={entry.title} supporting-text={formatDate(entry.updatedAt)}></nldd-text-cell>
              </nldd-list-item-segment>
              <nldd-list-item-segment
                button
                accessible-label={`Verwijder chat "${entry.title}"`}
                disabled={disabled || undefined}
                onClick={() => onRequestDelete(entry.id)}
              >
                <nldd-icon-cell icon="trash" size="20" color="secondary"></nldd-icon-cell>
              </nldd-list-item-segment>
            </nldd-list-item>
          ))}
          <nldd-text slot="empty" size="sm" color="secondary">
            Nog geen chats.
          </nldd-text>
        </nldd-list>
      </nldd-container>

      {/* Quiet things last: the settings as an ordinary row, and one line about
          where the chats live. */}
      <nldd-container gap="8">
        <nldd-list accessible-label="Instellingen">
          <nldd-list-item size="sm" href="/instellingen/chat" disabled={disabled || undefined}>
            <nldd-icon-cell icon="gear" size="20" color="content"></nldd-icon-cell>
            <nldd-spacer-cell size="8"></nldd-spacer-cell>
            <nldd-text-cell text="Instellingen"></nldd-text-cell>
            <nldd-icon-cell icon="chevron-right" size="20" color="secondary"></nldd-icon-cell>
          </nldd-list-item>
        </nldd-list>
        {footer}
      </nldd-container>
    </nldd-container>
  );
}
