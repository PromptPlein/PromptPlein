import { useMemo, useState } from 'react';
import { ORG_TYPE_LABELS } from '@/services/orgService';
import type { Organization } from '@/types';

/**
 * Tree of the organizations: Rijksoverheid on top, the ministries below it and
 * the departments and agencies below those. The top level holds the
 * organizations without a parent (parent_id = null). Every branch starts open;
 * its chevron folds it away. Each row leads to the prompts of that organization.
 */
export default function OrgTree({ orgs }: { orgs: Organization[] }) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Organization[]>();
    for (const o of orgs) {
      const key = o.parent_id ?? null;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [orgs]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const roots = childrenByParent.get(null) ?? [];

  return (
    <nldd-list type="tree" accessible-label="Organisaties">
      <nldd-inline-dialog slot="empty" text="Geen organisaties beschikbaar"></nldd-inline-dialog>
      {roots.map((o) => (
        <OrgNode
          key={o.id}
          org={o}
          childrenByParent={childrenByParent}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
        />
      ))}
    </nldd-list>
  );
}

/** One spacer per level: the visual indent of a row in the tree. */
function Indent({ levels }: { levels: number }) {
  return (
    <>
      {Array.from({ length: levels }, (_, i) => (
        <nldd-spacer-cell key={i} size="44"></nldd-spacer-cell>
      ))}
    </>
  );
}

function OrgNode({
  org,
  childrenByParent,
  depth,
  collapsed,
  onToggle,
  child = false,
}: {
  org: Organization;
  childrenByParent: Map<string | null, Organization[]>;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  child?: boolean;
}) {
  const children = childrenByParent.get(org.id) ?? [];
  const href = `/zoeken?org=${org.id}`;
  const typeLabel = ORG_TYPE_LABELS[org.organization_type];
  const slot = child ? 'children' : undefined;

  if (children.length === 0) {
    return (
      <nldd-list-item slot={slot} href={href}>
        <Indent levels={depth + 1} />
        <nldd-spacer-cell size="8" divider-start></nldd-spacer-cell>
        <nldd-icon-cell icon="building" size="20" color="secondary"></nldd-icon-cell>
        <nldd-spacer-cell size="8"></nldd-spacer-cell>
        <nldd-text-cell text={org.name} supporting-text={typeLabel}></nldd-text-cell>
      </nldd-list-item>
    );
  }

  const open = !collapsed.has(org.id);
  return (
    <nldd-list-item slot={slot} expanded={open || undefined}>
      <Indent levels={depth} />
      <nldd-list-item-segment
        button
        disclosure
        accessible-label={org.name}
        onClick={() => onToggle(org.id)}
      >
        <nldd-icon-cell size="20" color="secondary" icon="chevron-right" disclosure divider-start></nldd-icon-cell>
      </nldd-list-item-segment>
      <nldd-list-item-segment href={href} width="full">
        <nldd-icon-cell icon="building" size="20" color="secondary"></nldd-icon-cell>
        <nldd-spacer-cell size="8"></nldd-spacer-cell>
        <nldd-text-cell text={org.name} supporting-text={typeLabel}></nldd-text-cell>
      </nldd-list-item-segment>
      {children.map((c) => (
        <OrgNode
          key={c.id}
          org={c}
          childrenByParent={childrenByParent}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          child
        />
      ))}
    </nldd-list-item>
  );
}
