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
