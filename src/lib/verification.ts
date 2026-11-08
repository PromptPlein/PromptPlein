/**
 * Datamodel + serialisatie voor de Chain-of-Verification-bouwer.
 *
 * De kern van deze techniek is niet "laat de AI zijn werk nakijken". Dat doet
 * hij toch wel, en dan bevestigt hij zijn eigen fout. De kern is dat de
 * controle wordt LOSGEKOPPELD van het concept: eerst de beweringen eruit halen,
 * daar losse verificatievragen van maken, en die vragen beantwoorden zónder de
 * formulering uit het concept ernaast. Een smalle vraag ("welk bedrag staat in
 * artikel 4.2?") wordt betrouwbaarder beantwoord dan een brede ("klopt deze
 * alinea?"), omdat het foute antwoord niet meer als anker in beeld staat.
 *
 * Twee dingen bepalen of dat lukt, en die haalt deze bouwer op:
 *  1. WELKE soorten beweringen gecontroleerd moeten worden. Zonder die lijst
 *     controleert het model wat toevallig opvalt; met die lijst loopt het de
 *     tekst systematisch af.
 *  2. WAARTEGEN gecontroleerd wordt. Zonder bronafbakening betekent "klopt"
 *     alleen "het model herkent het", en dat is precies de fout die je zocht.
 */

/** Eén soort controleerbare bewering; de gebruiker vinkt aan wat meetelt. */
export interface ClaimType {
  id: string;
  label: string;
  /** Waarom deze soort in rijkswerk duur is als hij misgaat. */
  hint: string;
  checked: boolean;
  /** Door de scan gevonden fragment uit het concept, als bewijs dat het voorkomt. */
  voorbeeld?: string;
}

/**
 * De soorten beweringen die in rijksstukken fout gaan én consequenties hebben.
 * Bewust een vaste, korte lijst: een vrij tekstveld levert "controleer de
 * feiten" op, en daar kan een klein model niets mee.
 */
const CLAIM_TYPES: Omit<ClaimType, 'checked' | 'voorbeeld'>[] = [
  {
    id: 'cijfers',
    label: 'Cijfers, bedragen en percentages',
    hint: 'Een bedrag dat één nul verschilt haalt de nota onderuit in het debat.',
  },
  {
    id: 'data',
    label: 'Data, termijnen en ingangsdatums',
    hint: 'Een verkeerde inwerkingtredingsdatum maakt de rest van het stuk onjuist.',
  },
  {
    id: 'juridisch',
    label: 'Wetsartikelen en juridische grondslag',
    hint: 'Een verkeerd artikelnummer is het makkelijkst te controleren en het pijnlijkst.',
  },
  {
    id: 'verwijzingen',
    label: 'Verwijzingen naar Kamerstukken, brieven en rapporten',
    hint: 'Modellen verzinnen kenmerken en vindplaatsen die er geloofwaardig uitzien.',
  },
  {
    id: 'toezeggingen',
    label: 'Toezeggingen, beloftes en termijnen aan derden',
    hint: 'Een toezegging die nooit is gedaan, is na verzending wél gedaan.',
  },
  {
    id: 'bevoegdheden',
    label: 'Namen, functies, organisaties en bevoegdheden',
    hint: 'Wie waarover gaat, klopt vaak net niet, zeker na een herindeling of reorganisatie.',
  },
  {
    id: 'causaal',
    label: 'Oorzaak-gevolg-beweringen ("leidt tot", "zorgt voor")',
    hint: 'Dit zijn beweringen die als feit gelezen worden maar zelden onderbouwd zijn.',
  },
  {
    id: 'citaten',
    label: 'Citaten en weergaven van wat een ander vindt',
    hint: 'Een geparafraseerd standpunt wordt in een reactie letterlijk teruggeciteerd.',
  },
];

/**
 * Waartegen mag gecontroleerd worden? Dit is de scherpste knop van de techniek:
 * hoe strakker het regime, hoe minder "klopt" op modelkennis leunt.
 */
export type SourceRegime = 'alleen_bijlagen' | 'bijlagen_plus_recht' | 'openbaar';

export const SOURCE_REGIMES: { value: SourceRegime; label: string; hint: string }[] = [
  {
    value: 'alleen_bijlagen',
    label: 'Alleen de stukken die ik meestuur',
    hint: 'Strengst. Alles wat niet in de stukken staat, geldt als niet geverifieerd, ook als het waar is.',
  },
  {
    value: 'bijlagen_plus_recht',
    label: 'Mijn stukken + gepubliceerde wet- en regelgeving en Kamerstukken',
    hint: 'Werkbaar bij juridische controle: het model mag naar wetten en kenmerken verwijzen, maar moet de vindplaats noemen.',
  },
  {
    value: 'openbaar',
    label: 'Elke openbare bron, mits met vindplaats',
    hint: 'Ruimst. Alleen bruikbaar als je de genoemde vindplaatsen daarna zelf natrekt.',
  },
];

/** Wat gebeurt er met een bewering die niet te verifiëren blijkt? */
export type UnverifiableRule = 'markeren' | 'afzwakken' | 'schrappen';

export const UNVERIFIABLE_RULES: { value: UnverifiableRule; label: string; hint: string }[] = [
  {
    value: 'markeren',
    label: 'Laten staan, maar markeren',
    hint: 'De tekst blijft leesbaar; jij ziet waar je nog achteraan moet.',
  },
  {
    value: 'afzwakken',
    label: 'Afzwakken tot wat wél te onderbouwen is',
    hint: 'Van "leidt tot 30% minder meldingen" naar "kan het aantal meldingen verlagen".',
  },
  {
    value: 'schrappen',
    label: 'Uit de tekst halen',
    hint: 'Voor stukken die de deur uitgaan: liever een gat dan een fout.',
  },
];

/** De volledige staat van de Chain-of-Verification-bouwer. */
export interface VerificationData {
  /** Het concept zelf, of een omschrijving van wat er straks ingeplakt wordt. */
  teControleren: string;
  /** Heeft de gebruiker de tekst zelf geplakt (dan kan de scan draaien)? */
  claims: ClaimType[];
  regime: SourceRegime;
  /** De concreet genoemde bronnen, bijv. "de vier bijlagen en de nota van juli". */
  bronnen: string;
  onverifieerbaar: UnverifiableRule;
  /** Welke fout hier het duurst is; bepaalt de volgorde van controleren. */
  duursteFout: string;
  /** Is de scan gedraaid? Bepaalt of de checklist als "voorstel" wordt getoond. */
  gescand: boolean;
}

export function emptyVerification(): VerificationData {
  return {
    teControleren: '',
    claims: CLAIM_TYPES.map((c) => ({ ...c, checked: false })),
    regime: 'bijlagen_plus_recht',
    bronnen: '',
    onverifieerbaar: 'markeren',
    duursteFout: '',
    gescand: false,
  };
}

/**
 * Serialiseert de controle-opzet tot gelabelde tekst. Dit is wat als
 * bouwer-invoer in de compose landt; de structuurinstructie in de edge function
 * bepaalt daarna de vorm van de prompt zelf.
 */
export function serializeVerification(d: VerificationData): string {
  const parts: string[] = [];

  if (d.teControleren.trim()) {
    parts.push(`TE CONTROLEREN TEKST (of omschrijving daarvan):\n${d.teControleren.trim()}`);
  }

  const checked = d.claims.filter((c) => c.checked);
  if (checked.length > 0) {
    parts.push(
      `SOORTEN BEWERINGEN DIE GECONTROLEERD MOETEN WORDEN:\n` +
        checked
          .map((c) => `- ${c.label}${c.voorbeeld?.trim() ? ` (gezien in het concept: ${c.voorbeeld.trim()})` : ''}`)
          .join('\n'),
    );
  }

  const regime = SOURCE_REGIMES.find((r) => r.value === d.regime);
  const bronRegels = [`Regime: ${regime?.label ?? d.regime}`];
  if (d.bronnen.trim()) bronRegels.push(`Concreet: ${d.bronnen.trim()}`);
  parts.push(`BRONAFBAKENING (hiertegen wordt geverifieerd, en tegen niets anders):\n${bronRegels
    .map((r) => `- ${r}`)
    .join('\n')}`);

  const rule = UNVERIFIABLE_RULES.find((r) => r.value === d.onverifieerbaar);
  parts.push(`NIET TE VERIFIËREN BEWERINGEN: ${rule?.label ?? d.onverifieerbaar}`);

  if (d.duursteFout.trim()) {
    parts.push(`DUURSTE FOUT (controleer dit als eerste):\n${d.duursteFout.trim()}`);
  }

  return parts.join('\n\n');
}
