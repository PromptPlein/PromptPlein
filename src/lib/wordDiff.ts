/** Eén stuk van een vergelijking: gelijk, erbij gekomen of eruit gegaan. */
export interface DiffPart {
  type: 'same' | 'ins' | 'del';
  text: string;
}

/**
 * Vergelijkt twee korte teksten per woord (langste gemeenschappelijke reeks).
 * Bedoeld voor een veld van een paar zinnen: bij een tekst van honderden woorden
 * wordt de tabel groot, en dan geeft hij het geheel als vervangen terug.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 250_000) {
    return [
      ...(before ? [{ type: 'del' as const, text: before }] : []),
      ...(after ? [{ type: 'ins' as const, text: after }] : []),
    ];
  }
  // lcs[i][j]: lengte van de langste gemeenschappelijke reeks vanaf a[i] en b[j].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('del', a[i++]);
    } else {
      push('ins', b[j++]);
    }
  }
  while (i < a.length) push('del', a[i++]);
  while (j < b.length) push('ins', b[j++]);
  return groupChanges(parts);
}

/** Zoveel woorden mag een gelijk stuk tussen twee wijzigingen hebben om mee te tellen. */
const LOS_GELIJK = 3;

/**
 * Per woord springt een vergelijking heen en weer ("weg nieuw weg nieuw"), en
 * dat leest slecht. Een kort gelijk stuk tussen twee wijzigingen telt daarom
 * mee als wijziging, en elke reeks wijzigingen wordt één doorgestreept stuk
 * gevolgd door één nieuw stuk.
 */
function groupChanges(parts: DiffPart[]): DiffPart[] {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const out: DiffPart[] = [];
  let del = '';
  let ins = '';
  const flush = () => {
    if (del) out.push({ type: 'del', text: del });
    if (ins) out.push({ type: 'ins', text: ins });
    del = '';
    ins = '';
  };
  parts.forEach((part, k) => {
    if (part.type === 'del') del += part.text;
    else if (part.type === 'ins') ins += part.text;
    else {
      const tussen = (del || ins) && k < parts.length - 1 && words(part.text) <= LOS_GELIJK;
      if (tussen) {
        del += part.text;
        ins += part.text;
      } else {
        flush();
        out.push(part);
      }
    }
  });
  flush();
  return out;
}
