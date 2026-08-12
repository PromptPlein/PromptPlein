/**
 * Datamodel + serialisatie voor de Step-Back-bouwer.
 *
 * Step-Back Prompting laat de AI eerst uitzoomen: welke algemenere vraag ligt
 * hieronder, welke uitgangspunten gelden op dát niveau, en pas daarna terug naar
 * de gestelde vraag. De winst zit er niet in dat het antwoord "breder" wordt,
 * maar dat zichtbaar wordt wanneer de gestelde vraag de verkeerde vraag is.
 *
 * In rijkswerk zitten daar twee scherpe randen aan, en die haalt deze bouwer op:
 *
 *  1. HOOGTE. Eén trede omhoog helpt ("hoe krijgen we verhuurders zover dat ze
 *     zich aan de regels houden?"); vier treden omhoog levert een essay op
 *     ("wat is de rol van de overheid?"). De gebruiker kiest daarom zelf de
 *     trede; dat is het mechanisme dat deze techniek onderscheidt.
 *
 *  2. WAT VASTSTAAT. Een opdracht komt vaak al versmald binnen ("werk een
 *     meldplicht uit"). Zonder onderscheid wordt uitzoomen óf ongehoorzaam
 *     (het model gooit het besluit overboord) óf tandeloos (het model neemt
 *     alles als gegeven). Vaststaand = besloten, daar tornt de AI niet aan.
 *     Aanname = nooit besloten, alleen overgenomen, en dáár gaat het over.
 */

/** Eén trede van de ladder: een kandidaat-vraag op een bepaald abstractieniveau. */
export interface LadderRung {
  /** 1 = net boven de vraag, 3 = het beleidsdoel erachter. */
  niveau: number;
  /** De algemenere vraag zelf. */
  vraag: string;
  /** Wat je wint door hier te gaan staan, en wat je verliest. */
  winst: string;
}

/** De vaste betekenis van de drie treden, zodat de AI en de UI hetzelfde bedoelen. */
export const LADDER_LEVELS: { niveau: number; label: string; uitleg: string }[] = [
  {
    niveau: 1,
    label: 'De vraag achter de vraag',
    uitleg:
      'Eén trede omhoog: hetzelfde onderwerp, maar zonder de gekozen oplossing erin. Dichtbij genoeg om het antwoord bruikbaar te houden.',
  },
  {
    niveau: 2,
    label: 'Het werkende mechanisme',
    uitleg:
      'Twee treden: waardoor verandert gedrag hier eigenlijk? Hier komen alternatieven in beeld die in de opdracht niet stonden.',
  },
  {
    niveau: 3,
    label: 'Het beleidsdoel',
    uitleg:
      'Drie treden: welk maatschappelijk doel dient dit? Scherp voor een fundamentele heroverweging, te ver weg voor een nota van volgende week.',
  },
];

/** Een randvoorwaarde: écht besloten, of alleen overgenomen. */
export interface Constraint {
  id: string;
  text: string;
  status: 'vast' | 'aanname';
}

/** De volledige staat van de Step-Back-bouwer. */
export interface StepBackData {
  /** De opdracht zoals hij binnenkwam. */
  concreteVraag: string;
  /** De oplossing/richting die al op tafel ligt. */
  opTafel: string;
  /** Door de AI voorgestelde treden; de gebruiker kiest er één. */
  ladder: LadderRung[];
  /** De gekozen (of zelf geschreven) stap-terug-vraag. */
  gekozenVraag: string;
  /** Het niveau van de gekozen vraag; 0 = zelf geschreven. */
  gekozenNiveau: number;
  /** Wat vaststaat en wat alleen is aangenomen. */
  randvoorwaarden: Constraint[];
  /** Kaders die op het algemenere niveau gelden (uitvoerbaarheid, regeldruk, …). */
  kaders: string;
}

export function emptyStepBack(): StepBackData {
  return {
    concreteVraag: '',
    opTafel: '',
    ladder: [],
    gekozenVraag: '',
    gekozenNiveau: 0,
    randvoorwaarden: [],
    kaders: '',
  };
}

/** Is er genoeg ingevuld om een zinvolle prompt te bouwen? */
export function stepBackHasContent(d: StepBackData): boolean {
  return Boolean(d.concreteVraag.trim() || d.gekozenVraag.trim());
}

/**
 * Serialiseert de step-back-opzet tot gelabelde tekst voor de compose. De
 * splitsing vast/aanname staat er expliciet in: dat is de instructie die
 * voorkomt dat de prompt óf een besluit terugdraait óf niets meer durft.
 */
export function serializeStepBack(d: StepBackData): string {
  const parts: string[] = [];

  if (d.concreteVraag.trim()) {
    parts.push(`CONCRETE VRAAG DIE VOORLIGT:\n${d.concreteVraag.trim()}`);
  }
  if (d.opTafel.trim()) {
    parts.push(`OPLOSSING DIE AL OP TAFEL LIGT:\n${d.opTafel.trim()}`);
  }
  if (d.gekozenVraag.trim()) {
    const niveau = LADDER_LEVELS.find((l) => l.niveau === d.gekozenNiveau);
    parts.push(
      `GEKOZEN STAP-TERUG-VRAAG (hier moet de AI eerst antwoord op geven):\n${d.gekozenVraag.trim()}` +
        (niveau ? `\nAbstractieniveau: ${niveau.label}: ${niveau.uitleg}` : ''),
    );
  }

  const vast = d.randvoorwaarden.filter((c) => c.status === 'vast' && c.text.trim());
  if (vast.length > 0) {
    parts.push(
      `STAAT VAST (besloten; hier NIET aan tornen, ook niet na het uitzoomen):\n` +
        vast.map((c) => `- ${c.text.trim()}`).join('\n'),
    );
  }

  const aanname = d.randvoorwaarden.filter((c) => c.status === 'aanname' && c.text.trim());
  if (aanname.length > 0) {
    parts.push(
      `AANNAME (nooit besloten, alleen overgenomen; dit mag ter discussie):\n` +
        aanname.map((c) => `- ${c.text.trim()}`).join('\n'),
    );
  }

  if (d.kaders.trim()) {
    parts.push(`KADERS DIE OP HET ALGEMENERE NIVEAU GELDEN:\n${d.kaders.trim()}`);
  }

  return parts.join('\n\n');
}
