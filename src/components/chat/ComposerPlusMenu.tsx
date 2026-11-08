import MenuAction from '@/components/common/MenuAction';
import ThinkingToggle from '@/components/common/ThinkingToggle';
import WebSearchToggle from '@/components/common/WebSearchToggle';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/menu';

/**
 * De plusknop van het tekstvak: één overzicht van alles wat je aan een bericht
 * kunt toevoegen en welke opties er zijn. De balk zelf blijft daardoor rustig en
 * laat alleen zien wat er aanstaat.
 *
 * The menu sits in the popup slot of the button, so it lives in the top layer
 * and the button anchors, opens and closes it.
 */
export default function ComposerPlusMenu({
  disabled,
  busy,
  canAddFile,
  addFileHint,
  onAddFile,
  onContext,
  onMakePrompt,
  thinking,
  onToggleThinking,
  thinkingUnavailable,
  webSearch,
  onToggleWebSearch,
  onDictate,
}: {
  disabled: boolean;
  /** Er wordt een document gelezen. */
  busy: boolean;
  canAddFile: boolean;
  addFileHint: string;
  onAddFile: () => void;
  onContext: () => void;
  onMakePrompt: () => void;
  thinking: boolean;
  onToggleThinking?: (value: boolean) => void;
  thinkingUnavailable?: string;
  webSearch: boolean;
  onToggleWebSearch?: (value: boolean) => void;
  /** Afwezig als deze browser niet kan opnemen. */
  onDictate?: () => void;
}) {
  const hasOptions = Boolean(onToggleThinking || onToggleWebSearch || onDictate);
  return (
    <nldd-icon-button
      icon="add"
      text="Toevoegen en opties"
      appearance="neutral-transparent"
      expandable
      disabled={disabled || undefined}
      loading={busy || undefined}
      loading-text="Document lezen"
    >
      <nldd-menu slot="popup" placement="top-start" accessible-label="Toevoegen en opties">
        <nldd-menu-group text="Toevoegen">
          <MenuAction
            icon="paperclip"
            text="Bestand"
            details={addFileHint}
            disabled={!canAddFile || undefined}
            onSelect={onAddFile}
          />
          <MenuAction icon="folder-open" text="Projecten" onSelect={onContext} />
          <MenuAction icon="sparkles" text="Context prompt" onSelect={onMakePrompt} />
        </nldd-menu-group>
        {hasOptions && (
          <nldd-menu-group text="Opties">
            {onToggleThinking && (
              <ThinkingToggle
                variant="menu"
                value={thinking}
                onChange={onToggleThinking}
                unavailableReason={thinkingUnavailable}
              />
            )}
            {onToggleWebSearch && (
              <WebSearchToggle variant="menu" value={webSearch} onChange={onToggleWebSearch} />
            )}
            {onDictate && (
              <MenuAction icon="microphone" text="Inspreken" onSelect={onDictate} />
            )}
          </nldd-menu-group>
        )}
      </nldd-menu>
    </nldd-icon-button>
  );
}
