/**
 * Datamodel + serialisatie voor de Rubric-bouwer.
 *
 * Een rubric is geen lijstje criteria. Een lijstje criteria levert een oordeel
 * op dat nergens op rust: "uitvoerbaarheid: 3 van de 5" is niet navolgbaar en
 * niet reproduceerbaar. Wat een rubric onderscheidt, zijn de NIVEAUBESCHRIJVINGEN
 * (anchors): per criterium staat vóór het beoordelen vast wanneer iets een 3 is
 * en wanneer een 4. Twee collega's die dezelfde rubric gebruiken komen dan op
 * hetzelfde uit, en een afgewezen aanvrager kan zien waaróp is afgewezen, wat
 * in bezwaar het enige is dat telt.
 *
 * Deze bouwer dwingt daarom drie dingen af die in de praktijk meestal ontbreken:
 *  1. Een niveaubeschrijving per criterium per schaalpunt.
 *  2. Een bewijsregel: elke score verwijst naar een letterlijke passage.
 *  3. Een uitweg: staat het er niet, dan is het "niet te beoordelen", nooit een
 *     gok. Zonder die uitweg vult het model het gat met iets aannemelijks.
 */

/** De schaal waarop gescoord wordt. */
export type RubricScale = 'voldoet' | 'vijfpunts' | 'janee';

export const RUBRIC_SCALES: { value: RubricScale; label: string; hint: string; levels: string[] }[] = [
  {
    value: 'voldoet',
    label: 'Voldoet / voldoet deels / voldoet niet',
    hint: 'De werkpaardschaal voor toetsen op een concept. Genoeg onderscheid, weinig discussie.',
    levels: ['Voldoet', 'Voldoet deels', 'Voldoet niet'],
  },
  {
    value: 'vijfpunts',
    label: '1 tot en met 5',
    hint: 'Voor het rangschikken van meerdere aanvragen of offertes; vraagt wel scherpe beschrijvingen per punt.',
    levels: ['5', '4', '3', '2', '1'],
  },
  {
    value: 'janee',
    label: 'Ja / nee',
    hint: 'Voor harde eisen waar geen tussenweg bestaat, zoals een ontvankelijkheidstoets.',
    levels: ['Ja', 'Nee'],
  },
];

/** De schaalpunten van een schaal, hoogste eerst. */
export function scaleLevels(scale: RubricScale): string[] {
  return RUBRIC_SCALES.find((s) => s.value === scale)?.levels ?? [];
}

/** Hoe zwaar telt dit criterium mee in het eindoordeel? */
export type CriterionWeight = 'normaal' | 'dubbel' | 'knockout';

export const CRITERION_WEIGHTS: { value: CriterionWeight; label: string; hint: string }[] = [
  { value: 'normaal', label: 'Telt normaal mee', hint: '' },
  { value: 'dubbel', label: 'Telt dubbel', hint: 'Voor het criterium waar het echt om draait.' },
  {
    value: 'knockout',
    label: 'Knock-out',
    hint: 'Scoort dit criterium het laagst, dan is het geheel onvoldoende, hoe goed de rest ook is.',
  },
];

/** Eén criterium met zijn niveaubeschrijvingen. */
export interface RubricCriterion {
  id: string;
  naam: string;
  /** Wat dit criterium precies meet; voorkomt dat iedereen er iets anders in leest. */
  betekenis: string;
  weging: CriterionWeight;
  /** Niveaubeschrijving per schaalpunt: wanneer is het een "3"? */
  niveaus: Record<string, string>;
}

/** De volledige staat van de Rubric-bouwer. */
export interface RubricData {
  /** Wat er beoordeeld wordt (soort stuk, aantal). */
  teBeoordelen: string;
  /** Waar het oordeel voor dient; bepaalt hoe streng en hoe formeel. */
  doel: string;
  schaal: RubricScale;
  criteria: RubricCriterion[];
  /** Wanneer is het geheel voldoende? */
  drempel: string;
  /** Moet elke score een letterlijke passage uit het stuk aanhalen? */
  bewijsverplicht: boolean;
}

let counter = 0;
/** Stabiele client-side id voor een nieuw criterium. */
export function newCriterionId(): string {
  counter += 1;
  return `crit-${counter}`;
}

export function emptyCriterion(): RubricCriterion {
  return { id: newCriterionId(), naam: '', betekenis: '', weging: 'normaal', niveaus: {} };
}

export function emptyRubric(): RubricData {
  return {
    teBeoordelen: '',
    doel: '',
    schaal: 'voldoet',
    criteria: [emptyCriterion()],
    drempel: '',
    bewijsverplicht: true,
  };
}

/** Hoeveel criteria hebben nog geen enkele niveaubeschrijving? Stuurt de UI-waarschuwing. */
export function criteriaZonderNiveaus(d: RubricData): RubricCriterion[] {
  return d.criteria.filter(
    (c) => c.naam.trim() && !Object.values(c.niveaus).some((v) => v?.trim()),
  );
}

/**
 * Serialiseert de rubric tot gelabelde tekst voor de compose. De
 * niveaubeschrijvingen staan per criterium onder elkaar: dat is de vorm die de
 * structuurinstructie straks één-op-één in de prompt overneemt.
 */
export function serializeRubric(d: RubricData): string {
  const parts: string[] = [];
  const levels = scaleLevels(d.schaal);

  if (d.teBeoordelen.trim()) parts.push(`TE BEOORDELEN:\n${d.teBeoordelen.trim()}`);
  if (d.doel.trim()) parts.push(`WAAR HET OORDEEL VOOR DIENT:\n${d.doel.trim()}`);

  const schaal = RUBRIC_SCALES.find((s) => s.value === d.schaal);
  parts.push(`SCHAAL: ${schaal?.label ?? d.schaal} (${levels.join(' / ')})`);

  const gevuld = d.criteria.filter((c) => c.naam.trim());
  if (gevuld.length > 0) {
    parts.push(
      `TOETSINGSKADER:\n` +
        gevuld
          .map((c, i) => {
            const kop = `${i + 1}. ${c.naam.trim()}`;
            const regels: string[] = [];
            if (c.betekenis.trim()) regels.push(`   Meet: ${c.betekenis.trim()}`);
            const weging = CRITERION_WEIGHTS.find((w) => w.value === c.weging);
            if (c.weging !== 'normaal') regels.push(`   Weging: ${weging?.label ?? c.weging}`);
            const niveaus = levels
              .filter((l) => c.niveaus[l]?.trim())
              .map((l) => `   ${l} = ${c.niveaus[l].trim()}`);
            if (niveaus.length > 0) regels.push(...niveaus);
            return [kop, ...regels].join('\n');
          })
          .join('\n\n'),
    );
  }

  if (d.drempel.trim()) parts.push(`DREMPEL VOOR EEN VOLDOENDE GEHEEL:\n${d.drempel.trim()}`);

  parts.push(
    d.bewijsverplicht
      ? `BEWIJSREGEL: elke score wordt onderbouwd met een letterlijke passage uit het beoordeelde stuk.`
      : `BEWIJSREGEL: een score mag worden onderbouwd met een samenvatting; een letterlijk citaat is niet verplicht.`,
  );

  return parts.join('\n\n');
}
