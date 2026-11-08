import { useRef } from 'react';
import { useNlddEvent } from '@/lib/nldd';
import { VISIBILITY_LEVELS } from '@/lib/utils';
import type { VisibilityLevel } from '@/types';
import '@nldd/design-system/cell';
import '@nldd/design-system/checkbox';
import '@nldd/design-system/form-section';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/tag';
import '@nldd/design-system/text-cell';

/**
 * Shared multi-select for the sharing levels of a prompt. Used EVERYWHERE a
 * prompt is shared (dashboard, search, generator), so the labels and the
 * explanation are identical everywhere.
 *
 * Privé sits at the top and is ALWAYS checked: a prompt always stays visible to
 * its owner, so it cannot be unchecked. The sharing levels (department and up)
 * stack on top of it, several at once. Each level says what happens after
 * saving (the department gets it at once, higher levels wait for approval). No
 * sharing level checked therefore means: private only.
 */
export default function VisibilityPicker({
  value,
  onChange,
}: {
  value: VisibilityLevel[];
  onChange: (next: VisibilityLevel[]) => void;
  /** Kept so existing callers compile; the list gives its rows their own ids. */
  idPrefix?: string;
}) {
  const listRef = useRef<HTMLElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useNlddEvent(listRef, 'change', (e) => {
    const level = (e.target as HTMLElement | null)?.dataset.level as VisibilityLevel | undefined;
    if (!level) return;
    const current = valueRef.current;
    onChange(current.includes(level) ? current.filter((l) => l !== level) : [...current, level]);
  });

  const isPrivate = value.length === 0;

  return (
    <nldd-form-section
      text="Wie mag deze prompt zien?"
      supporting-text="Kies één of meerdere niveaus. Standaard blijft de prompt privé, alleen voor jezelf."
    >
      <nldd-list ref={listRef} appearance="box-tinted" accessible-label="Wie mag deze prompt zien">
        <nldd-list-item checkbox checked disabled>
          <nldd-cell>
            <nldd-checkbox decorative checked></nldd-checkbox>
          </nldd-cell>
          <nldd-spacer-cell size="12"></nldd-spacer-cell>
          <nldd-text-cell
            text="Privé"
            supporting-text={`${
              isPrivate
                ? 'Alleen zichtbaar voor jezelf; je deelt deze prompt met niemand.'
                : 'Je blijft de prompt altijd zelf zien. Hieronder deel je hem daarnaast met anderen.'
            } Deze staat altijd aan; anders zou je je eigen prompt niet meer kunnen zien.`}
          ></nldd-text-cell>
          <nldd-cell>
            <nldd-tag size="sm" color="neutral" text="Altijd voor jou"></nldd-tag>
          </nldd-cell>
        </nldd-list-item>

        {VISIBILITY_LEVELS.map((lvl) => {
          const active = value.includes(lvl.value);
          return (
            <nldd-list-item key={lvl.value} data-level={lvl.value} checkbox checked={active || undefined}>
              <nldd-cell>
                <nldd-checkbox decorative checked={active || undefined}></nldd-checkbox>
              </nldd-cell>
              <nldd-spacer-cell size="12"></nldd-spacer-cell>
              <nldd-text-cell text={lvl.label} supporting-text={`${lvl.description} ${lvl.approval}`}></nldd-text-cell>
              <nldd-cell>
                <nldd-tag size="sm" color={lvl.autoApproved ? 'success' : 'warning'} text={lvl.approvalShort}></nldd-tag>
              </nldd-cell>
            </nldd-list-item>
          );
        })}
      </nldd-list>
    </nldd-form-section>
  );
}
