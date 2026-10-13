/**
 * Datamodel + serialisatie voor de Few-Shot-bouwer. De bouwer loopt in drie
 * stappen: eerst de context (waar werkt de prompt straks in, wat komt er
 * binnen), dan een reeks input/output-paren (wat herkent de AI, en hoe reageert
 * hij dan), en tot slot een analyse waarin de AI de paren tegen de context legt.
 * Het eindpunt is één stuk gestructureerde tekst dat als antwoord in de
 * analyse/compose landt en waar de generator een agent-prompt van bouwt.
 */

/** Eén input→output-paar: een situatie of voorbeeldinvoer met de gewenste reactie. */
export interface FewShotPair {
  id: string;
  input: string;
  output: string;
}

/** Een kandidaat-kenmerk uit de analyse, aan/uit te vinken. */
export interface FewShotFeature {
  /** Korte naam, bijv. "Toon en register". */
  label: string;
  /** Korte toelichting wat er in de paren gezien is. */
  detail?: string;
  /** Aangevinkt = overnemen of weglaten, afhankelijk van de lijst. */
  checked: boolean;
}

/** De volledige staat van de few-shot-bouwer. */
export interface FewShotData {
  /** Afgeleid uit het aantal ingevulde paren: één of meerdere voorbeelden. */
  mode: 'one-shot' | 'few-shot';
  /** Stap 1: de context waarin de prompt straks werkt. */
  context: string;
  /** Stap 2: de input/output-paren. */
  pairs: FewShotPair[];
  // Stap 3: de analyse, door de AI voorgesteld en door de gebruiker bijgesteld.
  overnemen: FewShotFeature[];
  nietOvernemen: FewShotFeature[];
  /** Wat de AI doet als geen enkele input op de binnenkomende tekst past. */
  randgeval: string;
}

/** Standaard-kenmerken die de checklist toont als de AI niets kon afleiden (fallback). */
export const DEFAULT_FEATURE_LABELS = [
  'Opbouw / volgorde',
  'Toon en register',
  'Lengte',
  'Detailniveau',
  'Aanhef / afsluiting',
  'Mate van stelligheid',
  'Gebruik van vaktaal',
  'Opmaak / koppen',
];

/** Maak een lege bouwer-staat, eventueel met de context al ingevuld. */
export function emptyFewShot(context = ''): FewShotData {
  return {
    mode: 'one-shot',
    context,
    pairs: [{ id: 'pair-1', input: '', output: '' }],
    overnemen: [],
    nietOvernemen: [],
    randgeval: '',
  };
}

/** De paren waar de gebruiker iets in heeft gezet. */
export function filledPairs(d: FewShotData): FewShotPair[] {
  return d.pairs.filter((p) => p.input.trim() || p.output.trim());
}

/** Leid de modus af: twee of meer ingevulde paren is few-shot. */
export function deriveMode(d: FewShotData): 'one-shot' | 'few-shot' {
  return filledPairs(d).length >= 2 ? 'few-shot' : 'one-shot';
}

/**
 * Serialiseert de few-shot-definitie tot leesbare, gelabelde tekst. Dit is wat als
 * antwoord van de stap in de analyse/compose-pipeline landt, zodat de rest van de
 * flow ongewijzigd blijft werken.
 */
export function serializeFewShot(d: FewShotData): string {
  const parts: string[] = [];
  parts.push(`AANPAK: ${d.mode === 'few-shot' ? 'Few-shot (meerdere voorbeelden)' : 'One-shot (één voorbeeld)'}`);

  if (d.context.trim()) parts.push(`CONTEXT:\n${d.context.trim()}`);

  const pairs = filledPairs(d);
  if (pairs.length > 0) {
    parts.push(
      `INPUT EN OUTPUT:\n${pairs
        .map((p, i) => `Paar ${i + 1}:\n  Input: ${p.input.trim() || '[nog invullen]'}\n  Output: ${p.output.trim() || '[nog invullen]'}`)
        .join('\n\n')}`,
    );
  }

  const keep = d.overnemen.filter((f) => f.checked).map((f) => f.label);
  if (keep.length > 0) parts.push(`KENMERKEN OM OVER TE NEMEN:\n${keep.map((k) => `- ${k}`).join('\n')}`);

  const drop = d.nietOvernemen.filter((f) => f.checked).map((f) => f.label);
  if (drop.length > 0)
    parts.push(
      `NIET OVERNEMEN (casus-specifiek; vervang door plaatshouder of laat weg):\n${drop
        .map((k) => `- ${k}`)
        .join('\n')}`,
    );

  if (d.randgeval.trim()) parts.push(`ALS GEEN ENKELE INPUT PAST:\n${d.randgeval.trim()}`);

  return parts.join('\n\n');
}
