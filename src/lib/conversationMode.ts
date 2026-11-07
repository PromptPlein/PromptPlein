import { useSyncExternalStore } from 'react';

/**
 * Staat de gespreksmodus aan? Het tekstvak bestuurt hem en de berichtenlijst moet
 * het weten om het antwoord voor te lezen, dus dit staat los van beide.
 */
let active = false;
const listeners = new Set<() => void>();

export function setConversationActive(value: boolean): void {
  if (active === value) return;
  active = value;
  listeners.forEach((listener) => listener());
}

export function isConversationActive(): boolean {
  return active;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConversationActive(): boolean {
  return useSyncExternalStore(subscribe, isConversationActive);
}
