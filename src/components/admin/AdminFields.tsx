import { useRef, type ComponentProps } from 'react';
import { useNlddValue } from '@/lib/nldd';

type FieldRef = HTMLElement & { value?: string };

/** An nldd-text-field bound to React state. */
export function BoundTextField({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<'nldd-text-field'>, 'ref' | 'value'> & { value: string; onValue: (v: string) => void }) {
  const ref = useRef<FieldRef>(null);
  useNlddValue(ref, value, onValue);
  return <nldd-text-field ref={ref} {...rest}></nldd-text-field>;
}

/** An nldd-multi-line-text-field bound to React state. */
export function BoundMultiLine({
  value,
  onValue,
  ...rest
}: Omit<ComponentProps<'nldd-multi-line-text-field'>, 'ref' | 'value'> & {
  value: string;
  onValue: (v: string) => void;
}) {
  const ref = useRef<FieldRef>(null);
  useNlddValue(ref, value, onValue);
  return <nldd-multi-line-text-field ref={ref} {...rest}></nldd-multi-line-text-field>;
}
