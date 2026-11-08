import type { ReactNode } from 'react';

/**
 * Wraps a table. An nldd-table is its own scroll container and drops columns
 * per breakpoint itself (`sm-columns` with `hide-below` on the cells), so on a
 * phone nothing needs to be turned into cards here any more. The wrapper stays
 * so existing callers keep their markup.
 */
export default function StackTable({ children }: { children: ReactNode }) {
  return <nldd-container>{children}</nldd-container>;
}
