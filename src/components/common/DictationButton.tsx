import type { CSSProperties, MouseEvent } from 'react';
import VoiceLevelMeter from './VoiceLevelMeter';
import { formatDictationTime, type DictationState } from '@/lib/useDictation';

interface DictationButtonProps {
  state: DictationState;
  seconds: number;
  /** The open microphone while recording, for the level meter. */
  stream: MediaStream | null;
  onToggle: () => void;
  disabled?: boolean;
  /** 'sm' sits in a text field (out of the tab order), 'md' in the chat toolbar. */
  size?: 'sm' | 'md';
  /** Ignored: the design system sets the look. Kept so existing callers compile. */
  className?: string;
  /** Ignored: the design system sets the look. Kept so existing callers compile. */
  style?: CSSProperties;
}

/**
 * The microphone. At rest a quiet icon button; while recording a row with a
 * stop button, a live level meter and the elapsed time; while transcribing the
 * same row with an activity indicator. Red only as a small signal (the dot and
 * the stop button), never as a surface.
 *
 * onMouseDown keeps the text field from losing its focus (and caret) to the
 * click: the text has to land exactly there.
 */
export default function DictationButton({
  state,
  seconds,
  stream,
  onToggle,
  disabled = false,
  size = 'sm',
}: DictationButtonProps) {
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  const noTab = size === 'sm' || undefined;

  if (state === 'recording') {
    return (
      <nldd-container layout="row" gap="8" vertical-alignment="center" role="status">
        <nldd-icon-button
          icon="stop-filled"
          appearance="critical-tinted"
          size="sm"
          no-tab={noTab}
          accessible-label="Stop met opnemen"
          onMouseDown={keepFocus}
          onClick={onToggle}
        ></nldd-icon-button>
        <VoiceLevelMeter stream={stream} />
        <nldd-badge color="critical" size="sm" pulse decorative></nldd-badge>
        <nldd-text size="xs" color="secondary">
          {formatDictationTime(seconds)}
        </nldd-text>
        <nldd-visually-hidden>Opname loopt</nldd-visually-hidden>
      </nldd-container>
    );
  }

  if (state === 'transcribing') {
    return (
      <nldd-container layout="row" gap="8" vertical-alignment="center">
        <nldd-activity-indicator size="16" timing="instant" text="Uitschrijven"></nldd-activity-indicator>
        <nldd-text size="xs" color="secondary">
          Uitschrijven…
        </nldd-text>
      </nldd-container>
    );
  }

  return (
    <nldd-tooltip text="Inspreken: klik, praat, klik nog eens. De opname wordt na het uitschrijven weggegooid.">
      <nldd-icon-button
        icon="microphone"
        appearance="neutral-transparent"
        size={size === 'sm' ? 'xs' : 'sm'}
        no-tab={noTab}
        tooltip-timing="never"
        accessible-label="Inspreken met de microfoon"
        disabled={disabled || undefined}
        onMouseDown={keepFocus}
        onClick={onToggle}
      ></nldd-icon-button>
    </nldd-tooltip>
  );
}
