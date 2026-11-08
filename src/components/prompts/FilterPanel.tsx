import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useNlddEvent } from '@/lib/nldd';
import { SHARING_LEVELS, toggled } from '@/lib/utils';
import type { AdvancedPromptFilters, SharingLevel } from '@/types';

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: AdvancedPromptFilters;
  onChange: (patch: Partial<AdvancedPromptFilters>) => void;
  /** Number of results with these filters; null while searching. */
  resultCount: number | null;
}

type SheetElement = HTMLElement & { show?: () => void };
type DateElement = HTMLElement & { value?: string };

/**
 * The filter panel of Ontdekken, an nldd-sheet. A choice applies to the results
 * at once, so there is nothing to lose: it closes with Klaar, Escape and a click
 * beside it. The number of results stands under the title.
 *
 * Only ministries and the Rijksoverheid are in it, as a short code with the full
 * name as the second line. Filtering on a ministry takes everything under it
 * along (see SearchPage).
 */
export default function FilterPanel({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
}: FilterPanelProps) {
  const { categories, organizations, roles } = useReferenceData();
  const sheetRef = useRef<SheetElement>(null);
  const fromRef = useRef<DateElement>(null);
  const toRef = useRef<DateElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useNlddEvent(sheetRef, 'close', () => {
    if (openRef.current) onClose();
  });
  useNlddEvent(fromRef, 'change', () => onChange({ date_from: fromRef.current?.value || null }));
  useNlddEvent(toRef, 'change', () => onChange({ date_to: toRef.current?.value || null }));

  const resultsText =
    resultCount === null
      ? 'Resultaten worden geteld'
      : `${resultCount} ${resultCount === 1 ? 'resultaat' : 'resultaten'}`;

  const ministries = organizations.filter(
    (o) => o.organization_type === 'ministry' || o.organization_type === 'government',
  );

  return createPortal(
    <nldd-sheet ref={sheetRef} open={open || undefined} width="28rem">
      <nldd-page>
        <nldd-top-title-bar
          slot="header"
          text="Filters"
          supporting-text={resultsText}
          heading-level={2}
          dismiss-text="Klaar"
          collapse-anchor="filter-kop"
        ></nldd-top-title-bar>

        <nldd-simple-section>
          <nldd-title
            id="filter-kop"
            slot="header"
            size={3}
            heading-level={2}
            text="Filters"
            supporting-text={resultsText}
          ></nldd-title>
          <nldd-container gap="24">
            <FilterList
              title="Categorie"
              items={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={filters.category_ids ?? []}
              onToggle={(id) => onChange({ category_ids: toggled(filters.category_ids, id) })}
            />

            {ministries.length > 0 && (
              <FilterList
                title="Organisatie"
                items={ministries.map((o) => ({
                  id: o.id,
                  label: o.code ?? o.name,
                  hint: o.code ? o.name : undefined,
                }))}
                selected={filters.organization_ids ?? []}
                onToggle={(id) => onChange({ organization_ids: toggled(filters.organization_ids, id) })}
              />
            )}

            {roles.length > 0 && (
              <FilterList
                title="Functie"
                items={roles.map((r) => ({ id: r.id, label: r.name }))}
                selected={filters.role_ids ?? []}
                onToggle={(id) => onChange({ role_ids: toggled(filters.role_ids, id) })}
              />
            )}

            <FilterList
              title="Deelniveau"
              items={SHARING_LEVELS.map((s) => ({ id: s.value, label: s.label }))}
              selected={filters.sharing_levels ?? []}
              onToggle={(id) =>
                onChange({ sharing_levels: toggled<SharingLevel>(filters.sharing_levels, id as SharingLevel) })
              }
            />

            <nldd-container layout="grid" column-count={2} sm-column-count={1} gap="12">
              <nldd-form-field label="Vanaf">
                <nldd-date-field ref={fromRef} value={filters.date_from ?? ''}></nldd-date-field>
              </nldd-form-field>
              <nldd-form-field label="Tot">
                <nldd-date-field ref={toRef} value={filters.date_to ?? ''}></nldd-date-field>
              </nldd-form-field>
            </nldd-container>

            <nldd-button-group>
              <nldd-button
                appearance="neutral-tinted"
                start-icon="dismiss"
                text="Wis alle filters"
                onClick={() =>
                  onChange({
                    category_ids: [],
                    organization_ids: [],
                    role_ids: [],
                    sharing_levels: [],
                    date_from: null,
                    date_to: null,
                  })
                }
              ></nldd-button>
            </nldd-button-group>
          </nldd-container>
        </nldd-simple-section>

      </nldd-page>
    </nldd-sheet>,
    document.body,
  );
}

/** One group of filters: a row per option, and the row is the checkbox. */
function FilterList({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; label: string; hint?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent(ref, 'change', (e) => {
    const id = (e.target as HTMLElement | null)?.dataset.id;
    if (id) onToggle(id);
  });
  return (
    <nldd-container gap="8">
      <nldd-title heading-level={3} size={6} text={title}></nldd-title>
      <nldd-list ref={ref} appearance="box-tinted" accessible-label={title}>
        {items.map((item) => {
          const on = selected.includes(item.id);
          return (
            <nldd-list-item key={item.id} data-id={item.id} checkbox checked={on || undefined}>
              <nldd-cell>
                <nldd-checkbox decorative checked={on || undefined}></nldd-checkbox>
              </nldd-cell>
              <nldd-spacer-cell size="12"></nldd-spacer-cell>
              <nldd-text-cell text={item.label} supporting-text={item.hint}></nldd-text-cell>
            </nldd-list-item>
          );
        })}
        <nldd-inline-dialog slot="empty" text={`Geen ${title.toLowerCase()} om op te filteren.`}></nldd-inline-dialog>
      </nldd-list>
    </nldd-container>
  );
}
