import MenuAction from './MenuAction';

/**
 * Kept for callers that still import them: rows of a menu are nldd-menu-item
 * elements now, which bring their own look.
 * @deprecated
 */
export const MENU_ROW = '';
/** @deprecated See {@link MENU_ROW}. */
export const MENU_ICON = '';

/**
 * A row in a menu that turns something on or off: an nldd-menu-item of type
 * checkbox, so a screen reader reads its state. Goes inside an nldd-menu.
 */
export default function MenuSwitchRow({
  icon,
  label,
  hint,
  on,
  disabled,
  onClick,
}: {
  /** Icon name from the design system. */
  icon: string;
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <MenuAction
      type="checkbox"
      icon={icon}
      text={label}
      details={hint}
      selected={on || undefined}
      disabled={disabled || undefined}
      onSelect={onClick}
    />
  );
}
