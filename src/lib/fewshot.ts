/**
 * Datamodel + serialisatie voor de Few-Shot-bouwer (Few-Shot Voorbeelden-stap van
 * de plan-bouwer). De bouwer leidt zelf af of het one-shot of few-shot moet zijn,
 * verzamelt input/output-paren, en laat de AI de te behouden kenmerken en de
 * casus-specifieke (weg te laten) details uit de voorbeelden halen. Het eindpunt
 * is één stuk gestructureerde tekst dat als antwoord in de analyse/compose landt.
 */

/** Wat de gebruiker wil bereiken (Q0-routing → bepaalt one-shot vs few-shot). */
export type FewShotIntent = 'herhaalbaar' | 'eenmalig' | 'weet_niet';

/** Vorm van de gewenste output (Q2). Classificatie dwingt few-shot af. */
export type OutputFormat = 'vrije_tekst' | 'gestructureerd' | 'lijst' | 'classificatie';

/** Eén input→output-voorbeeldpaar. */
export interface FewShotPair {
  id: string;
  input: string;
  output: string;
}

/** Een kandidaat-kenmerk uit de extractie (Q5/Q6), aan/uit te vinken. */
export interface FewShotFeature {
  /** Korte naam, bijv. "Toon en register". */
  label: string;
  /** Korte toelichting wat er in het voorbeeld gezien is. */
  detail?: string;
  /** Aangevinkt = overnemen (Q5) of weglaten (Q6). */
  checked: boolean;
}

/** De volledige staat van de few-shot-bouwer. */
export interface FewShotData {
  intent: FewShotIntent;
  /** Afgeleid uit intent (+ aantal patroonvarianten): één of meerdere voorbeelden. */
  mode: 'one-shot' | 'few-shot';
  // Taakdefinitie (Q1-Q2).
  inputBeschrijving: string;
  outputBeschrijving: string;
  outputFormaat: OutputFormat;
  /** Bij classificatie: de mogelijke labels. */
  labels: string;
  // Voorbeeldmateriaal (Q3-Q4).
  pairs: FewShotPair[];
  // Extractie (Q5-Q6) — door de AI voorgesteld, door de gebruiker bijgesteld.
  overnemen: FewShotFeature[];
  nietOvernemen: FewShotFeature[];
  // Few-shot-checks (Q7-Q9).
  /** Q9: welk voorbeeld leidend is bij tegenstrijdigheid (index, of leeg). */
  leidendVoorbeeld: string;
  /** Q8: wat te doen bij een randgeval (ontbrekende info / buiten scope). */
  randgeval: string;
  // Optioneel (Q10).
  tegenvoorbeeld: string;
}

/**
 * De routing-vraag (Q0). Eerst het enkele voorbeeld (one-shot), daarna het
 * herhaalbare geval (few-shot): zo loopt de lijst van één voorbeeld naar
 * meerdere, in dezelfde volgorde als de techniek zelf opbouwt.
 */
export const FEWSHOT_INTENT_OPTIONS: { value: FewShotIntent; label: string; hint: string }[] = [
  {
    value: 'eenmalig',
    label: 'Eén tekst, in de juiste vorm',
    hint: 'Bijv. één specifieke brief of nota in een bepaalde stijl. → één voorbeeld volstaat.',
  },
  {
    value: 'herhaalbaar',
    label: 'Steeds hetzelfde soort output',
    hint: 'Bijv. elke keer een burgervraag op dezelfde manier beantwoorden. → meerdere voorbeelden.',
  },
  {
    value: 'weet_niet',
    label: 'Weet ik nog niet',
    hint: 'De tool bepaalt het zelf op basis van je voorbeelden.',
  },
];

/** De vorm-opties (Q2). */
export const OUTPUT_FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'vrije_tekst', label: 'Vrije tekst' },
  { value: 'gestructureerd', label: 'Gestructureerd (vaste rubrieken)' },
  { value: 'lijst', label: 'Lijst / opsomming' },
  { value: 'classificatie', label: 'Classificatie / label' },
];

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

/** Maak een lege bouwer-staat. */
export function emptyFewShot(): FewShotData {
  return {
    intent: 'weet_niet',
    mode: 'one-shot',
    inputBeschrijving: '',
    outputBeschrijving: '',
    outputFormaat: 'vrije_tekst',
    labels: '',
    pairs: [{ id: 'pair-1', input: '', output: '' }],
    overnemen: [],
    nietOvernemen: [],
    leidendVoorbeeld: '',
    randgeval: '',
    tegenvoorbeeld: '',
  };
}

/** Leid de modus af: classificatie of "herhaalbaar" of ≥2 paren → few-shot. */
export function deriveMode(d: FewShotData): 'one-shot' | 'few-shot' {
  if (d.intent === 'herhaalbaar') return 'few-shot';
  if (d.outputFormaat === 'classificatie') return 'few-shot';
  if (d.pairs.filter((p) => p.input.trim() || p.output.trim()).length >= 2) return 'few-shot';
  return 'one-shot';
}

/** Is er genoeg ingevuld om iets zinvols te genereren? */
export function fewShotHasContent(d: FewShotData): boolean {
  return (
    d.pairs.some((p) => p.input.trim() || p.output.trim()) ||
    Boolean(d.inputBeschrijving.trim() || d.outputBeschrijving.trim())
  );
}

/**
 * Serialiseert de few-shot-definitie tot leesbare, gelabelde tekst. Dit is wat als
 * antwoord van de stap in de analyse/compose-pipeline landt, zodat de rest van de
 * flow ongewijzigd blijft werken.
 */
export function serializeFewShot(d: FewShotData): string {
  const parts: string[] = [];
  parts.push(`AANPAK: ${d.mode === 'few-shot' ? 'Few-shot (meerdere voorbeelden)' : 'One-shot (één voorbeeld)'}`);

  const taak: string[] = [];
  if (d.inputBeschrijving.trim()) taak.push(`Input: ${d.inputBeschrijving.trim()}`);
  if (d.outputBeschrijving.trim()) taak.push(`Gewenste output: ${d.outputBeschrijving.trim()}`);
  taak.push(`Vorm: ${OUTPUT_FORMAT_OPTIONS.find((o) => o.value === d.outputFormaat)?.label ?? d.outputFormaat}`);
  if (d.outputFormaat === 'classificatie' && d.labels.trim()) taak.push(`Mogelijke labels: ${d.labels.trim()}`);
  parts.push(`TAAK:\n${taak.map((t) => `- ${t}`).join('\n')}`);

  const filledPairs = d.pairs.filter((p) => p.input.trim() || p.output.trim());
  if (filledPairs.length > 0) {
    parts.push(
      `VOORBEELDEN:\n${filledPairs
        .map((p, i) => `Voorbeeld ${i + 1}:\n  Input: ${p.input.trim() || '[nog invullen]'}\n  Output: ${p.output.trim() || '[nog invullen]'}`)
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

  if (d.leidendVoorbeeld.trim()) parts.push(`LEIDEND VOORBEELD BIJ TWIJFEL: ${d.leidendVoorbeeld.trim()}`);
  if (d.randgeval.trim()) parts.push(`BIJ RANDGEVALLEN (ontbrekende info / buiten scope):\n${d.randgeval.trim()}`);
  if (d.tegenvoorbeeld.trim()) parts.push(`TEGENVOORBEELD (zo dus NIET):\n${d.tegenvoorbeeld.trim()}`);

  return parts.join('\n\n');
}
