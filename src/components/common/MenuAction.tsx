import { useRef, type ComponentProps } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import '@nldd/design-system/menu';

type Props = Omit<ComponentProps<'nldd-menu-item'>, 'onSelect'> & { onSelect: () => void };

/**
 * An nldd-menu-item that runs an action. The item fires its own `select` event
 * for mouse and keyboard alike; React's onSelect is a text-selection event and
 * never hears it.
 */
export default function MenuAction({ onSelect, ...rest }: Props) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'select', () => onSelect());
  return <nldd-menu-item ref={ref} {...rest}></nldd-menu-item>;
}
