import type { Organization } from '@/types';

/** Een organisatie als kiesbare optie, met het volledige pad als context. */
export interface OrgOption {
  id: string;
  /** De naam van de organisatie zelf (bijv. "Bekostiging"). */
  label: string;
  /** Het pad van de bovenliggende lagen (bijv. "OCW › DUO"), zonder de org zelf. */
  path: string;
  /** De ministerie-wortel (eerste laag onder de Rijksoverheid), indien bekend. */
  ministryName: string | null;
}

/**
 * Bouw een platte, doorzoekbare lijst van kiesbare organisaties uit de boom.
 *
 * In dit netwerk hoort een persoon bij één organisatie-knoop; door de diepste
 * eenheid (de "afdeling") te kiezen, is iemand automatisch verbonden met alle
 * lagen daarboven (ministerie, DG, dienst …). Daarom kiezen gebruikers niet
 * apart een ministerie: ze zoeken hun eenheid en het pad eronder maakt duidelijk
 * onder welk ministerie die valt.
 *
 * We tonen elke organisatie behalve de Rijksoverheid-wortel zelf — iedereen zit
 * minimaal op ministerie-niveau. Het pad (de bovenliggende lagen) komt mee als
 * `path`, zodat zoeken op een ministerie of dienst ("DUO") ook de onderliggende
 * afdelingen vindt.
 */
export function buildOrgOptions(organizations: Organization[]): OrgOption[] {
  const byId = new Map(organizations.map((o) => [o.id, o]));

  // Loop de boom omhoog en verzamel de namen van de voorouders (dichtstbij eerst).
  function ancestors(org: Organization): Organization[] {
    const chain: Organization[] = [];
    let current = org.parent_id ? byId.get(org.parent_id) : undefined;
    // Begrens de diepte zodat een (kapotte) cyclus nooit oneindig loopt.
    for (let i = 0; i < 12 && current; i++) {
      chain.push(current);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return chain;
  }

  const options: OrgOption[] = [];
  for (const org of organizations) {
    // De Rijksoverheid-wortel zelf is geen kiesbare werkplek.
    if (org.organization_type === 'government') continue;

    const chain = ancestors(org);
    // Het ministerie is de voorouder direct onder de Rijksoverheid-wortel
    // (organization_type 'government'); valt die weg, dan is de org zelf het
    // hoogste niveau dat we kennen.
    const ministry =
      chain.find((a) => byId.get(a.parent_id ?? '')?.organization_type === 'government') ??
      (org.organization_type === 'ministry' ? org : null);

    // Het pad: de voorouders van hoog naar laag, zonder de Rijksoverheid-wortel.
    const path = chain
      .filter((a) => a.organization_type !== 'government')
      .reverse()
      .map((a) => a.name)
      .join(' › ');

    options.push({
      id: org.id,
      label: org.name,
      path,
      ministryName: ministry?.name ?? null,
    });
  }

  // Sorteer op pad + naam, zodat afdelingen netjes onder hun ministerie groeperen.
  options.sort((a, b) =>
    (a.path + a.label).localeCompare(b.path + b.label, 'nl', { sensitivity: 'base' }),
  );
  return options;
}

/** Vorm een OrgOption om tot het formaat dat SearchableSelect verwacht. */
export function orgOptionToSearchable(o: OrgOption): { id: string; label: string; hint?: string } {
  return { id: o.id, label: o.label, hint: o.path || undefined };
}

/**
 * Het ministerie waar een organisatie onder valt, de organisatie zelf als dat
 * een ministerie is. De Rijksoverheid-wortel valt onder geen ministerie.
 */
export function ministryOf(
  orgId: string,
  organizations: Organization[],
): Organization | null {
  const byId = new Map(organizations.map((o) => [o.id, o]));
  let current = byId.get(orgId);
  // Begrens de diepte zodat een (kapotte) cyclus nooit oneindig loopt.
  for (let i = 0; i < 12 && current; i++) {
    if (current.organization_type === 'ministry') return current;
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

/** Een organisatie met alles wat eronder hangt, voor filteren op een ministerie. */
export function orgSubtreeIds(rootId: string, organizations: Organization[]): string[] {
  const ids = new Set([rootId]);
  // Elke ronde pakt één laag dieper; stopt zodra er niets meer bijkomt.
  for (let grew = true; grew; ) {
    grew = false;
    for (const org of organizations) {
      if (org.parent_id && ids.has(org.parent_id) && !ids.has(org.id)) {
        ids.add(org.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/** De scheiding tussen de lagen van een pad, zoals in de rest van de app. */
export const ORG_PATH_SEPARATOR = ' › ';

/**
 * De keten van het ministerie tot en met de organisatie zelf, van boven naar
 * beneden, zonder de Rijksoverheid-wortel. Een onbekende id geeft een lege keten.
 */
export function orgChain(orgId: string | null | undefined, organizations: Organization[]): Organization[] {
  if (!orgId) return [];
  const byId = new Map(organizations.map((o) => [o.id, o]));
  const chain: Organization[] = [];
  let current = byId.get(orgId);
  // Begrens de diepte zodat een (kapotte) cyclus nooit oneindig loopt.
  for (let i = 0; i < 12 && current; i++) {
    if (current.organization_type !== 'government') chain.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return chain;
}

/** Het pad als tekst, bijvoorbeeld "BZK › ODI › RADIO". Leeg als de id onbekend is. */
export function orgPathLabel(
  orgId: string | null | undefined,
  organizations: Organization[],
  options: { short?: boolean } = {},
): string {
  return orgChain(orgId, organizations)
    .map((o) => (options.short && o.organization_type === 'ministry' ? o.code || o.name : o.name))
    .join(ORG_PATH_SEPARATOR);
}

/** De directe kinderen van een organisatie, op naam gesorteerd. */
export function childrenOf(parentId: string, organizations: Organization[]): Organization[] {
  return organizations
    .filter((o) => o.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

/**
 * Alles onder een organisatie als geordende lijst, elk onderdeel direct onder zijn
 * ouder. `depth` is 1 voor een direct kind, zodat een lijst kan inspringen.
 */
export function descendantsInOrder(
  rootId: string,
  organizations: Organization[],
): { org: Organization; depth: number }[] {
  const byParent = new Map<string, Organization[]>();
  for (const o of organizations) {
    if (!o.parent_id) continue;
    const list = byParent.get(o.parent_id) ?? [];
    list.push(o);
    byParent.set(o.parent_id, list);
  }
  const out: { org: Organization; depth: number }[] = [];
  const seen = new Set<string>([rootId]);
  function walk(parentId: string, depth: number) {
    const kids = (byParent.get(parentId) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }),
    );
    for (const kid of kids) {
      if (seen.has(kid.id) || depth > 12) continue;
      seen.add(kid.id);
      out.push({ org: kid, depth });
      walk(kid.id, depth + 1);
    }
  }
  walk(rootId, 1);
  return out;
}

/** De ministeries, op naam gesorteerd. */
export function listMinistries(organizations: Organization[]): Organization[] {
  return organizations
    .filter((o) => o.organization_type === 'ministry')
    .sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

/**
 * De organisaties waarop gezocht wordt. Een ministerie neemt alles mee wat eronder
 * hangt, behalve als er ook een afdeling van dat ministerie gekozen is: dan zoekt
 * het alleen in die afdeling. Zo werkt "eerst het ministerie, dan de afdeling".
 */
export function searchOrgIds(selected: string[], organizations: Organization[]): string[] {
  const trees = new Map(selected.map((id) => [id, orgSubtreeIds(id, organizations)]));
  const narrowed = selected.filter(
    (id) => !selected.some((other) => other !== id && trees.get(id)!.includes(other)),
  );
  return [...new Set(narrowed.flatMap((id) => trees.get(id)!))];
}
