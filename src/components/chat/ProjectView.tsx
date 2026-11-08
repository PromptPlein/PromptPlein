import { Fragment, useEffect, useState } from 'react';
import InfoDot from '@/components/common/InfoDot';
import { formatDate } from '@/lib/utils';
import type { ChatIndexEntry, ChatProject } from '@/types';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/divider';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/spacer';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/tag';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

/** The instruction shows this many lines until someone opens it in full. */
const COLLAPSED_LINES = 6;
/** And at most this many characters: one long line wraps into several. */
const COLLAPSED_CHARS = 480;

/** Text with its line breaks kept, as inline breaks inside one nldd-text. */
function Lines({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

/** A section heading with its explanation behind an info dot right after the words. */
function SectionTitle({ text, info, infoLabel }: { text: string; info: string; infoLabel: string }) {
  return (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-title heading-level={2} size={5} text={text}></nldd-title>
      <InfoDot label={infoLabel} text={info} />
    </nldd-container>
  );
}

/**
 * De projectpagina: wat je ziet als je links op een project klikt.
 *
 * Bewust géén chat. Een project is een plek, geen gesprek: hier zie je waar het
 * project voor staat (de projectinstructie), waar het uit put (de bronbestanden)
 * en wat je er al mee gedaan hebt (de gesprekken). Vanaf hier begin je een nieuw
 * gesprek, en dat gesprek draagt de instructie van dit project automatisch mee.
 *
 * De projectinstructie staat hier ingekort in beeld en niet in een invoerveld:
 * lezen is de normale handeling, bewerken de zeldzame. Dat laatste zit achter
 * "Projectinstellingen".
 */
export default function ProjectView({
  project,
  conversations,
  onNewChat,
  onNewPrompt,
  onMakeInstruction,
  onOpenSettings,
  onSelectConversation,
  onRequestDeleteConversation,
  onRequestDeleteProject,
  disabled,
}: {
  project: ChatProject;
  /** De gesprekken die bij dit project horen, recentste eerst. */
  conversations: ChatIndexEntry[];
  onNewChat: () => void;
  /** Open de promptbouwer met dit project als context. */
  onNewPrompt: (includeFiles: boolean) => void;
  /** Laat de AI met een paar vragen de projectinstructie maken. */
  onMakeInstruction: () => void;
  onOpenSettings: () => void;
  onSelectConversation: (id: string) => void;
  onRequestDeleteConversation: (id: string) => void;
  onRequestDeleteProject: () => void;
  disabled: boolean;
}) {
  const instructions = project.instructions.trim();
  const fileCount = project.fileCount ?? 0;
  const chatCount = conversations.length;
  const off = disabled || undefined;

  // The instruction starts collapsed: it may be a whole document (20,000
  // characters), which would push the files and the chats off the screen.
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  useEffect(() => {
    setInstructionsOpen(false);
  }, [project.id]);

  const lines = instructions.split('\n');
  const overflow = lines.length > COLLAPSED_LINES || instructions.length > COLLAPSED_CHARS;
  let shown = instructions;
  if (overflow && !instructionsOpen) {
    shown = lines.slice(0, COLLAPSED_LINES).join('\n');
    if (shown.length > COLLAPSED_CHARS) shown = shown.slice(0, COLLAPSED_CHARS).trimEnd();
    shown += '…';
  }

  return (
    <nldd-container>
      {/* The name with the two counts, then the three things a project is for:
          talk, build a prompt with it, or set it up. */}
      <nldd-title id="chat-titel" heading-level={1} size={2} text={project.name}></nldd-title>
      <nldd-spacer size="8"></nldd-spacer>
      <nldd-container layout="wrap" gap="8">
        <nldd-tag icon="text-document" text={String(fileCount)} accessible-label={`${fileCount} bronbestanden`}></nldd-tag>
        <nldd-tag icon="message-rectangle-text" text={String(chatCount)} accessible-label={`${chatCount} chats`}></nldd-tag>
      </nldd-container>
      <nldd-spacer size="24"></nldd-spacer>

      <nldd-button-group>
        <nldd-button appearance="primary" start-icon="add" text="Nieuwe chat" disabled={off} onClick={onNewChat}></nldd-button>
        {/* Always without the source files: the project instruction is usually
            enough, and whoever wants them switches them on in the builder. */}
        <nldd-button
          appearance="secondary"
          start-icon="magic"
          text="Prompt maken"
          disabled={off}
          onClick={() => onNewPrompt(false)}
        ></nldd-button>
        <nldd-button appearance="secondary" start-icon="settings" text="Instellingen" disabled={off} onClick={onOpenSettings}></nldd-button>
      </nldd-button-group>
      <nldd-spacer size="32"></nldd-spacer>

      {/* The instruction: the first thing to know about a project. Without one
          that is an invitation, not an error. */}
      <nldd-box>
        <nldd-container padding="16">
          <SectionTitle
            text="Projectinstructie"
            infoLabel="Uitleg over de projectinstructie"
            info="Elke chat in dit project volgt deze instructie. Je past hem aan bij Instellingen."
          />
          <nldd-spacer size="8"></nldd-spacer>
          {instructions ? (
            <>
              <nldd-text id="project-instructions-text" size="sm">
                <Lines text={shown} />
              </nldd-text>
              {overflow && (
                <>
                  <nldd-spacer size="8"></nldd-spacer>
                  <nldd-button
                    appearance="neutral-transparent"
                    size="sm"
                    start-icon={instructionsOpen ? 'chevron-up' : 'chevron-down'}
                    text={instructionsOpen ? 'Minder tonen' : 'Volledige instructie tonen'}
                    expanded={instructionsOpen || undefined}
                    aria-controls="project-instructions-text"
                    onClick={() => setInstructionsOpen((open) => !open)}
                  ></nldd-button>
                </>
              )}
            </>
          ) : (
            <>
              <nldd-text size="sm" color="secondary">Nog geen instructie.</nldd-text>
              <nldd-spacer size="8"></nldd-spacer>
              <nldd-button-group size="sm">
                <nldd-button appearance="secondary" text="Laat de AI er een maken" onClick={onMakeInstruction}></nldd-button>
                <nldd-button appearance="neutral-transparent" text="Schrijf er zelf een" onClick={onOpenSettings}></nldd-button>
              </nldd-button-group>
            </>
          )}
        </nldd-container>
      </nldd-box>
      <nldd-spacer size="32"></nldd-spacer>

      <SectionTitle
        text="Bronbestanden"
        infoLabel="Uitleg over bronbestanden"
        info="Documenten waar de chats in dit project uit putten. Je beheert ze bij Instellingen."
      />
      <nldd-spacer size="8"></nldd-spacer>
      <nldd-button
        appearance="secondary"
        start-icon="upload"
        text={fileCount > 0 ? 'Bestanden beheren' : 'Bestanden toevoegen'}
        disabled={off}
        onClick={onOpenSettings}
      ></nldd-button>
      <nldd-spacer size="32"></nldd-spacer>

      <SectionTitle
        text="Chats in dit project"
        infoLabel="Uitleg over chats in dit project"
        info="Een chat hier draait meteen op de instructie en de bronbestanden van dit project."
      />
      <nldd-spacer size="8"></nldd-spacer>
      <nldd-list accessible-label="Chats in dit project">
        {conversations.map((entry) => (
          <nldd-list-item key={entry.id}>
            <nldd-list-item-segment
              button
              width="full"
              disabled={off}
              onClick={() => onSelectConversation(entry.id)}
            >
              <nldd-icon-cell icon="message-rectangle-text" color="accent" size="20"></nldd-icon-cell>
              <nldd-spacer-cell size="12"></nldd-spacer-cell>
              <nldd-text-cell text={entry.title} supporting-text={formatDate(entry.updatedAt)}></nldd-text-cell>
            </nldd-list-item-segment>
            <nldd-list-item-segment
              button
              disabled={off}
              accessible-label={`Verwijder chat "${entry.title}"`}
              onClick={() => onRequestDeleteConversation(entry.id)}
            >
              <nldd-icon-cell icon="trash" color="secondary" size="20"></nldd-icon-cell>
            </nldd-list-item-segment>
          </nldd-list-item>
        ))}
        <nldd-inline-dialog slot="empty" text="Nog geen chats."></nldd-inline-dialog>
      </nldd-list>

      {/* At the bottom and quiet: deleting a project is rare and cannot be
          undone, so it does not sit beside the everyday actions. */}
      <nldd-spacer size="32"></nldd-spacer>
      <nldd-divider></nldd-divider>
      <nldd-spacer size="16"></nldd-spacer>
      <nldd-button
        appearance="critical-transparent"
        start-icon="trash"
        text="Project verwijderen"
        disabled={off}
        onClick={onRequestDeleteProject}
      ></nldd-button>
    </nldd-container>
  );
}
