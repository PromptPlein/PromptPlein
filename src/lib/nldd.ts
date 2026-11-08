import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Listens for an event on an nldd-* element. React's own handlers do not reach
 * these: a component such as nldd-dropdown stops the native `change` of its
 * slotted control and dispatches its own CustomEvent from the host, and `close`
 * on overlays does not bubble. The listener therefore sits on the element itself.
 */
export function useNlddEvent<E extends Event = CustomEvent>(
  ref: RefObject<HTMLElement | null>,
  type: string,
  handler: (event: E) => void,
) {
  const latest = useRef(handler);
  latest.current = handler;
  const bound = useRef<{ el: HTMLElement; listener: EventListener } | null>(null);
  // Runs after every render: the element behind the ref can appear, change or
  // disappear later (a field that only renders once a step opens), and a listener
  // bound on the first render only would never reach it.
  useEffect(() => {
    const el = ref.current;
    if (bound.current?.el === el) return;
    if (bound.current) bound.current.el.removeEventListener(type, bound.current.listener);
    bound.current = null;
    if (!el) return;
    const listener = (e: Event) => latest.current(e as E);
    el.addEventListener(type, listener);
    bound.current = { el, listener };
  });
  useEffect(
    () => () => {
      if (bound.current) bound.current.el.removeEventListener(type, bound.current.listener);
      bound.current = null;
    },
    [type],
  );
}

/**
 * Keeps the `value` property of an nldd field in step with React state. The
 * attribute alone is not enough: once someone types, the property moves on and
 * setting the same attribute again (clearing to '' twice) changes nothing.
 */
export function useNlddValue(
  ref: RefObject<HTMLElement & { value?: string } | null>,
  value: string,
  onValue: (value: string) => void,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
  });
  useNlddEvent(ref, 'input', (e) => {
    const target = e.currentTarget as (HTMLElement & { value?: string }) | null;
    const next = (e as CustomEvent<{ value?: string }>).detail?.value ?? target?.value ?? '';
    onValue(next);
  });
}

/**
 * Sends a click on a same-origin link that an nldd-* component renders in its
 * shadow root through the router, instead of reloading the page. React Router's
 * own <Link> handles its clicks first and marks them as handled. A click with a
 * modifier key, the middle button, a target or a download keeps its native meaning.
 */
export function installNlddRouterLinks(navigate: (to: string) => void) {
  const onClick = (e: globalThis.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement);
    if (!anchor || anchor.getRootNode() === document) return;
    if (anchor.target || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
