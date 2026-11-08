import type { NLDDNotification } from '@nldd/design-system/notification';

// The class comes from the registry, not from a second import: Vite bundles a
// subpath apart from the package entry, and the elements would be defined twice.
const Notification = () => customElements.get('nldd-notification') as unknown as typeof NLDDNotification;

type Variant = 'neutral' | 'success' | 'critical' | 'warning';
/** `duration` in milliseconds; a warning sign as `icon` makes it a warning. */
type Options = { duration?: number; icon?: string; id?: string };

/**
 * Short messages that arrive over the interface and leave on their own, through
 * nldd-notification. A critical one stays until it is dismissed: a failure is
 * worth reading.
 */
function show(text: string, variant: Variant, options?: Options) {
  const v = variant === 'neutral' && options?.icon?.startsWith('⚠') ? 'warning' : variant;
  return Notification().show({ text, variant: v, duration: options?.duration });
}

export const notify = Object.assign((text: string, options?: Options) => show(text, 'neutral', options), {
  success: (text: string, options?: Options) => show(text, 'success', options),
  error: (text: string, options?: Options) => show(text, 'critical', options),
  warning: (text: string, options?: Options) => show(text, 'warning', options),
});
