import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from '@/components/common/icons';
import { ORG_TYPE_LABELS } from '@/services/orgService';
import type { Organization } from '@/types';

/**
 * Boomstructuur van de organisaties: Rijksoverheid bovenaan, daaronder de
 * ministeries en daaronder de afdelingen/agentschappen. Top-level zijn de
 * organisaties zonder bovenliggende (parent_id = null).
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

  const roots = childrenByParent.get(null) ?? [];

  if (orgs.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Geen organisaties beschikbaar.</p>;
  }

  return (
    <ul className="space-y-1 text-sm">
      {roots.map((o) => (
        <OrgNode key={o.id} org={o} childrenByParent={childrenByParent} depth={0} />
      ))}
    </ul>
  );
}

function OrgNode({
  org,
  childrenByParent,
  depth,
}: {
  org: Organization;
  childrenByParent: Map<string | null, Organization[]>;
  depth: number;
}) {
  const children = childrenByParent.get(org.id) ?? [];
  return (
    <li>
      <Link
        to={`/zoeken?org=${org.id}`}
        style={{ paddingLeft: `${depth * 16}px` }}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-md py-1.5 pr-2 text-slate-700 sm:min-h-0 transition-colors hover:bg-slate-50 hover:text-rijksblauw-700 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:hover:text-rijksblauw-200"
        title="Bekijk prompts van deze organisatie"
      >
        <Building2 size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />
        <span className="truncate font-medium">{org.name}</span>
        <span className="ml-auto shrink-0 text-[0.6875rem] text-slate-400 dark:text-slate-500">
          {ORG_TYPE_LABELS[org.organization_type]}
        </span>
      </Link>
      {children.length > 0 && (
        <ul className="space-y-1">
          {children.map((c) => (
            <OrgNode key={c.id} org={c} childrenByParent={childrenByParent} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
