import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Organization, OrganizationType } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { orgTypeTokens, readRawToken, readToken, type Scheme } from '@/config/brandColors';
import { useNlddValue } from '@/lib/nldd';

/**
 * A quiet 2D organization chart of the network, drawn on a canvas.
 *
 * - Fixed automatic top-down hierarchy from `parent_id` (the same view for
 *   everyone; nodes cannot be dragged).
 * - Node width grows with the full name; nothing is cut off.
 * - Pan by dragging, zoom with the wheel or the buttons, so a large chart with
 *   departments below it stays readable.
 * - A search field to find a ministry, department or agency.
 * - Logos per organization (`logo_url`) with a code fallback (OCW, DUO).
 * - A click on a node shows its details, with a link to its prompts.
 *
 * The design system has no chart component in 0.18.0, so the chart is drawn on
 * a canvas; the toolbar and the detail panel are nldd components. The list view
 * on the network page is the keyboard and screen reader route to the same data.
 */

// --- Sizes (in chart units = pixels at zoom 1) ---
const NODE_H = 64;
const NODE_PAD_L = 66; // room on the left (logo square) before the text
const NODE_PAD_R = 18; // room on the right after the text
const NODE_MIN_W = 150;
const NODE_MAX_W = 460;
const H_GAP = 28; // horizontal room between siblings
const V_GAP = 72; // vertical room between layers

/** Height of the drawing in CSS pixels; the page leaves room around it to scroll. */
const CHART_H = 420;

function fontFamily(): string {
  return readRawToken('--primitives-font-family-sans-serif') || 'sans-serif';
}
const titleFont = () => `600 13.5px ${fontFamily()}`;
const subFont = () => `11px ${fontFamily()}`;

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

const TYPE_LABEL: Record<OrganizationType, string> = {
  government: 'Rijksoverheid',
  ministry: 'Ministerie',
  directorate_general: 'Directoraat-generaal',
  directorate: 'Directie',
  agency: 'Dienstonderdeel',
  department: 'Afdeling',
};

/** The Rijkshuisstijl color name per type, as nldd-icon takes it. */
const TYPE_ICON_COLOR: Record<OrganizationType, 'lintblauw' | 'donkerblauw' | 'hemelblauw' | 'paars' | 'groen' | 'bruin'> = {
  government: 'lintblauw',
  ministry: 'donkerblauw',
  directorate_general: 'hemelblauw',
  directorate: 'paars',
  agency: 'groen',
  department: 'bruin',
};

/**
 * Vaste rij (verticale laag) per organisatietype, zodat de boom strak top-down
 * uitlijnt ongeacht de werkelijke boomdiepte:
 *   0 Rijksoverheid → 1 Ministeries → 2 DG's → 3 Directies/Dienstonderdelen → 4 Afdelingen.
 * Alle ouder→kind-relaties lopen hierdoor strikt naar beneden.
 */
const TYPE_ROW: Record<OrganizationType, number> = {
  government: 0,
  ministry: 1,
  directorate_general: 2,
  directorate: 3,
  agency: 3,
  department: 4,
};

interface LaidOutNode {
  org: Organization;
  x: number; // midden-x
  y: number; // boven-y
  w: number; // node-breedte (variabel, op basis van de naam)
  depth: number;
}

interface Edge {
  from: LaidOutNode;
  to: LaidOutNode;
}

interface TreeNode {
  org: Organization;
  children: TreeNode[];
}

/** Meet tekstbreedte met een gedeeld canvas (geen DOM-reflow). */
let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return text.length * 7.5; // veilige schatting zonder canvas
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Bepaal de benodigde nodebreedte zodat de volledige naam + ondertitel passen. */
function nodeWidth(org: Organization): number {
  const titleW = measureText(org.name, titleFont());
  const sub = `${org.code ? `${org.code} · ` : ''}${TYPE_LABEL[org.organization_type]}`;
  const subW = measureText(sub, subFont());
  const content = Math.max(titleW, subW);
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, Math.ceil(NODE_PAD_L + content + NODE_PAD_R)));
}

/** Verticale positie (boven-y) van een rij; rijhoogtes zijn vast en gelijk. */
function rowY(row: number): number {
  return row * (NODE_H + V_GAP);
}

/**
 * Bouw een bos (meerdere roots mogelijk) en leg het tidy top-down uit.
 *
 * - Verticaal: elke knoop staat op een vaste rij per organisatietype
 *   (Rijksoverheid → Ministeries → DG's → Directies/Dienstonderdelen → Afdelingen).
 *   Zo staat alles van hetzelfde type netjes op één hoogte.
 * - Horizontaal: een klassieke "tidy tree" — bladeren komen links→rechts naast
 *   elkaar, elke ouder komt exact gecentreerd boven de span van zijn kinderen.
 *   Is een ouder breder dan zijn kinderen samen, dan schuift de hele subtree mee
 *   zodat de ouder gecentreerd blijft én er geen overlap met de buurtak ontstaat.
 * - De enige root (Rijksoverheid) eindigt zo vanzelf in het midden boven alles.
 *
 * Cycli/zwevende parents worden veilig als root behandeld.
 */
function buildLayout(orgs: Organization[]): {
  nodes: LaidOutNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const childrenOf = new Map<string, Organization[]>();
  const roots: Organization[] = [];

  for (const o of orgs) {
    const hasParent = o.parent_id && byId.has(o.parent_id) && o.parent_id !== o.id;
    if (hasParent) {
      const arr = childrenOf.get(o.parent_id!) ?? [];
      arr.push(o);
      childrenOf.set(o.parent_id!, arr);
    } else {
      roots.push(o);
    }
  }

  const visited = new Set<string>();
  function toTree(org: Organization): TreeNode {
    visited.add(org.id);
    const kids = (childrenOf.get(org.id) ?? []).filter((c) => !visited.has(c.id));
    return { org, children: kids.map(toTree) };
  }
  const forest = roots.map(toTree);

  const widthOf = new Map<string, number>();
  orgs.forEach((o) => widthOf.set(o.id, nodeWidth(o)));

  const nodes: LaidOutNode[] = [];
  const placed = new Map<string, LaidOutNode>();
  let cursorX = 0; // lopende linkerrand-offset bij het naast elkaar plaatsen

  // Verschuif een reeds geplaatste subtree horizontaal (gebruikt om een ouder
  // recht boven zijn kinderen te centreren wanneer de ouder breder is).
  function shiftSubtree(node: TreeNode, dx: number) {
    const laid = placed.get(node.org.id);
    if (laid) laid.x += dx;
    node.children.forEach((c) => shiftSubtree(c, dx));
  }

  // Plaats een subtree; retourneer het midden-x van deze knoop.
  function place(node: TreeNode): number {
    const row = TYPE_ROW[node.org.organization_type] ?? 0;
    const y = rowY(row);
    const w = widthOf.get(node.org.id) ?? NODE_MIN_W;

    if (node.children.length === 0) {
      const x = cursorX + w / 2;
      cursorX += w + H_GAP;
      const laid: LaidOutNode = { org: node.org, x, y, w, depth: row };
      nodes.push(laid);
      placed.set(node.org.id, laid);
      return x;
    }

    const childCenters = node.children.map((c) => place(c));
    const half = w / 2;
    // Gewenst midden = midden van de span van de kinderen.
    let x = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;

    // Is de ouder breder dan de span van zijn kinderen, schuif dan de hele
    // kinder-subtree naar rechts zodat de ouder gecentreerd blijft.
    if (x - half < cursorX) {
      const shift = cursorX - (x - half);
      node.children.forEach((c) => shiftSubtree(c, shift));
      x += shift;
    }

    cursorX = Math.max(cursorX, x + half + H_GAP);
    const laid: LaidOutNode = { org: node.org, x, y, w, depth: row };
    nodes.push(laid);
    placed.set(node.org.id, laid);
    return x;
  }

  forest.forEach((tree) => {
    place(tree);
    cursorX += H_GAP * 2; // extra lucht tussen losse bomen
  });

  // --- Botsingen per rij wegwerken ---------------------------------------
  // Omdat de rij wordt bepaald door het organisatietype (niet de boomdiepte),
  // kunnen knopen uit verschillende takken op dezelfde rij naast elkaar komen.
  // We lopen elke rij links→rechts na en duwen, zodra twee knopen elkaar raken,
  // de tweede knoop én zijn hele subtree naar rechts. Daarna centreren we elke
  // ouder opnieuw boven zijn kinderen (bottom-up), zodat de boom strak blijft.
  const treeOf = new Map<string, TreeNode>();
  forest.forEach(function walk(n) {
    treeOf.set(n.org.id, n);
    n.children.forEach(walk);
  });

  function shiftLaidSubtree(node: TreeNode, dx: number) {
    const laid = placed.get(node.org.id);
    if (laid) laid.x += dx;
    node.children.forEach((c) => shiftLaidSubtree(c, dx));
  }

  const byRow = new Map<number, LaidOutNode[]>();
  for (const n of nodes) {
    const arr = byRow.get(n.depth) ?? [];
    arr.push(n);
    byRow.set(n.depth, arr);
  }
  for (const row of byRow.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const cur = row[i];
      const minLeft = prev.x + prev.w / 2 + H_GAP; // gewenste linkerrand
      const curLeft = cur.x - cur.w / 2;
      if (curLeft < minLeft) {
        const dx = minLeft - curLeft;
        const tree = treeOf.get(cur.org.id);
        if (tree) shiftLaidSubtree(tree, dx);
        else cur.x += dx;
      }
    }
  }

  // Re-centreer ouders boven hun kinderen (bottom-up: diepste rij eerst).
  // We klemmen het nieuwe midden tussen de buren op dezelfde rij, zodat het
  // centreren nooit een nieuwe botsing op de ouder-rij introduceert.
  const rowsDesc = [...byRow.keys()].sort((a, b) => b - a);
  for (const rowKey of rowsDesc) {
    const row = byRow.get(rowKey)!; // al gesorteerd op x
    for (let i = 0; i < row.length; i++) {
      const parent = row[i];
      const kids = (treeOf.get(parent.org.id)?.children ?? [])
        .map((c) => placed.get(c.org.id))
        .filter((c): c is LaidOutNode => Boolean(c));
      if (kids.length === 0) continue;
      const xs = kids.map((k) => k.x).sort((a, b) => a - b);
      let target = (xs[0] + xs[xs.length - 1]) / 2;
      const half = parent.w / 2;
      const leftBound = i > 0 ? row[i - 1].x + row[i - 1].w / 2 + H_GAP + half : -Infinity;
      const rightBound = i < row.length - 1 ? row[i + 1].x - row[i + 1].w / 2 - H_GAP - half : Infinity;
      target = Math.min(Math.max(target, leftBound), rightBound);
      parent.x = target;
    }
  }

  const edges: Edge[] = [];
  for (const o of orgs) {
    const to = o.parent_id ? placed.get(o.parent_id) : undefined;
    const from = placed.get(o.id);
    if (to && from) edges.push({ from, to });
  }

  let minX = Infinity;
  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
    maxY = Math.max(maxY, n.y + NODE_H);
  }
  // Normaliseer zodat de linkerrand op x=0 begint.
  if (Number.isFinite(minX) && minX !== 0) {
    for (const n of nodes) n.x -= minX;
    maxX -= minX;
  }
  return { nodes, edges, width: maxX, height: maxY };
}

/**
 * Tekst-fallback in het logo-vakje wanneer er geen logo is: bij voorkeur de
 * officiële code (bijv. OCW, DUO, ODI), anders afgeleide initialen.
 */
function fallbackLabel(org: Organization): string {
  if (org.code && org.code.trim()) return org.code.trim().toUpperCase();
  const words = org.name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/);
  const skip = new Set(['van', 'de', 'der', 'het', 'en', 'voor', 'in', 'te']);
  const significant = words.filter((w) => !skip.has(w.toLowerCase()));
  const pick = significant.length ? significant : words;
  return pick
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Orthogonal connecting path (bottom of the parent to the top of the child). */
function edgePath(e: Edge): string {
  const x1 = e.to.x;
  const y1 = e.to.y + NODE_H;
  const x2 = e.from.x;
  const y2 = e.from.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

interface ChartColors {
  bg: string;
  dots: string;
  edge: string;
  card: string;
  border: string;
  title: string;
  sub: string;
  badge: string;
  accent: Record<OrganizationType, string>;
}

function chartColors(scheme: Scheme): ChartColors {
  const t = (name: string) => readToken(name, scheme);
  const accent = {} as Record<OrganizationType, string>;
  for (const [type, token] of Object.entries(orgTypeTokens)) {
    accent[type as OrganizationType] = t(token);
  }
  return {
    bg: t('--semantics-surfaces-tinted-background-color'),
    dots: t('--primitives-color-neutral-200'),
    edge: t('--primitives-color-neutral-200'),
    card: t('--semantics-surfaces-base-background-color'),
    border: t('--primitives-color-neutral-150'),
    title: t('--semantics-content-color'),
    sub: t('--semantics-content-secondary-color'),
    badge: t('--semantics-surfaces-tinted-background-color'),
    accent,
  };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

interface View {
  x: number;
  y: number;
  scale: number;
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  view: View,
  nodes: LaidOutNode[],
  edges: Edge[],
  colors: ChartColors,
  dark: boolean,
  selectedId: string | null,
  matches: Set<string> | null,
  logo: (url: string) => HTMLImageElement | null,
) {
  ctx.clearRect(0, 0, size.w, size.h);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, size.w, size.h);

  // A faint dot grid that moves with the chart: depth without motion.
  const step = 24 * view.scale;
  if (step >= 6) {
    ctx.globalAlpha = dark ? 0.3 : 0.5;
    ctx.fillStyle = colors.dots;
    const ox = ((view.x % step) + step) % step;
    const oy = ((view.y % step) + step) % step;
    for (let x = ox; x < size.w; x += step) {
      for (let y = oy; y < size.h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.scale, view.scale);

  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  for (const e of edges) ctx.stroke(new Path2D(edgePath(e)));

  for (const node of nodes) {
    const org = node.org;
    const accent = colors.accent[org.organization_type] ?? colors.accent.ministry;
    const selected = selectedId === org.id;
    const left = node.x - node.w / 2;
    const top = node.y;
    ctx.globalAlpha = matches && !matches.has(org.id) ? 0.25 : 1;

    roundedRect(ctx, left, top, node.w, NODE_H, 12);
    ctx.fillStyle = colors.card;
    ctx.fill();
    ctx.strokeStyle = selected ? accent : colors.border;
    ctx.lineWidth = selected ? 2.5 : 1.25;
    ctx.stroke();

    // Accent strip on the left tells the types apart.
    roundedRect(ctx, left, top, 4, NODE_H, 2);
    ctx.fillStyle = accent;
    ctx.fill();

    // Logo square, or the code as a fallback.
    roundedRect(ctx, left + 14, top + 12, 40, 40, 9);
    ctx.fillStyle = colors.badge;
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    const img = org.logo_url ? logo(org.logo_url) : null;
    if (img) {
      const k = Math.min(30 / img.naturalWidth, 30 / img.naturalHeight);
      const iw = img.naturalWidth * k;
      const ih = img.naturalHeight * k;
      ctx.drawImage(img, left + 14 + 5 + (30 - iw) / 2, top + 12 + 5 + (30 - ih) / 2, iw, ih);
    } else {
      const label = fallbackLabel(org);
      const fs = label.length >= 4 ? 11 : label.length === 3 ? 13 : 15;
      ctx.font = `700 ${fs}px ${fontFamily()}`;
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, left + 14 + 20, top + 12 + 21);
    }

    // Full name and type, never cut off.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = titleFont();
    ctx.fillStyle = colors.title;
    ctx.fillText(org.name, left + NODE_PAD_L, top + 26);
    ctx.font = subFont();
    ctx.fillStyle = colors.sub;
    ctx.fillText(`${org.code ? `${org.code} · ` : ''}${TYPE_LABEL[org.organization_type]}`, left + NODE_PAD_L, top + 45);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export default function OrgChart({ orgs }: { orgs: Organization[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const colors = useMemo(() => chartColors(dark ? 'dark' : 'light'), [dark]);

  // Node widths depend on the font, so lay out again once the fonts are in.
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => {
    let active = true;
    document.fonts?.ready.then(() => active && setFontsVersion((v) => v + 1));
    return () => {
      active = false;
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { nodes, edges, width, height } = useMemo(() => buildLayout(orgs), [orgs, fontsVersion]);

  const wrapRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchRef = useRef<HTMLElement & { value?: string }>(null);
  const [size, setSize] = useState({ w: 0, h: CHART_H });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<Organization | null>(null);
  const [search, setSearch] = useState('');
  useNlddValue(searchRef, search, setSearch);
  const dragRef = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });

  // Logos load once per URL; a loaded or failed logo redraws the chart.
  const logos = useRef(new Map<string, HTMLImageElement | null>());
  const [logoVersion, setLogoVersion] = useState(0);
  const logo = useCallback((url: string) => {
    const cache = logos.current;
    if (!cache.has(url)) {
      const img = new Image();
      img.onload = () => setLogoVersion((v) => v + 1);
      img.onerror = () => {
        cache.set(url, null);
        setLogoVersion((v) => v + 1);
      };
      img.src = url;
      cache.set(url, img);
    }
    const img = cache.get(url);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }, []);

  const PADDING = 56;

  // Search hits on name or code. Empty means no filtering.
  const matches = useMemo(() => {
    const q = norm(search.trim());
    if (!q) return null;
    const ids = new Set<string>();
    for (const n of nodes) {
      if (norm(n.org.name).includes(q) || (n.org.code && norm(n.org.code).includes(q))) {
        ids.add(n.org.id);
      }
    }
    return ids;
  }, [search, nodes]);

  // The drawing is as wide as its container.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: CHART_H });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A view that shows the whole chart.
  const fitView = useCallback(() => {
    const vw = size.w;
    const vh = size.h;
    if (vw === 0 || width === 0 || height === 0) return;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((vw - PADDING * 2) / width, (vh - PADDING * 2) / height, 1)),
    );
    const x = (vw - width * scale) / 2;
    const y = Math.max(PADDING, (vh - height * scale) / 2);
    setView({ x, y, scale });
  }, [width, height, size.w, size.h]);

  // Centers the view on one node (after a search).
  const focusNode = useCallback(
    (orgId: string) => {
      const node = nodes.find((n) => n.org.id === orgId);
      if (!node || size.w === 0) return;
      setView((v) => {
        const scale = Math.max(v.scale, 0.85);
        return {
          scale,
          x: size.w / 2 - node.x * scale,
          y: size.h / 2 - (node.y + NODE_H / 2) * scale,
        };
      });
    },
    [nodes, size.w, size.h],
  );

  // Fit once the sizes are known.
  useLayoutEffect(() => {
    fitView();
  }, [fitView]);

  // Draw. The canvas buffer follows the device pixel ratio, so its CSS size is
  // set apart from its buffer size: a canvas has no other way to stay sharp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    canvas.style.touchAction = 'none';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart(ctx, size, view, nodes, edges, colors, dark, selected?.id ?? null, matches, logo);
  }, [size, view, nodes, edges, colors, dark, selected, matches, logo, logoVersion]);

  function nodeAt(clientX: number, clientY: number): Organization | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const wx = (clientX - rect.left - view.x) / view.scale;
    const wy = (clientY - rect.top - view.y) / view.scale;
    const hit = nodes.find(
      (n) => wx >= n.x - n.w / 2 && wx <= n.x + n.w / 2 && wy >= n.y && wy <= n.y + NODE_H,
    );
    return hit?.org ?? null;
  }

  function setCursor(value: string) {
    if (canvasRef.current) canvasRef.current.style.cursor = value;
  }

  // --- Pan by dragging; a click without dragging selects ---
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setCursor('grabbing');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.active) {
      setCursor(nodeAt(e.clientX, e.clientY) ? 'pointer' : 'grab');
      return;
    }
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    setCursor('grab');
    // A click on a node selects it; a click on the background deselects.
    if (!d.moved) setSelected(nodeAt(e.clientX, e.clientY));
  };

  // --- Zoom with the wheel, around the pointer ---
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  // The wheel listener is not passive, so preventDefault works.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel, orgs.length]);

  // Zoom buttons: around the middle of the drawing.
  const zoomBy = (factor: number) => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };

  // Jump to the first hit while typing.
  useEffect(() => {
    if (matches && matches.size > 0) {
      const first = nodes.find((n) => matches.has(n.org.id));
      if (first) focusNode(first.org.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (orgs.length === 0) {
    return <nldd-inline-dialog icon="info-circle" text="Nog geen organisaties om te tonen."></nldd-inline-dialog>;
  }

  return (
    <nldd-container layout="stack" gap="12" padding="12">
      <nldd-container layout="wrap" gap="8" vertical-alignment="center">
        <nldd-search-field
          ref={searchRef}
          width="280px"
          placeholder="Zoek ministerie of afdeling…"
          accessible-label="Zoek ministerie of afdeling"
        ></nldd-search-field>
        <nldd-icon-button icon="plus" accessible-label="Inzoomen" onClick={() => zoomBy(1.25)}></nldd-icon-button>
        <nldd-icon-button icon="minus" accessible-label="Uitzoomen" onClick={() => zoomBy(0.8)}></nldd-icon-button>
        <nldd-icon-button icon="fit-to-view" accessible-label="Passend maken" onClick={fitView}></nldd-icon-button>
      </nldd-container>
      {matches && (
        <nldd-text size="xs" color="secondary" role="status">
          {matches.size} {matches.size === 1 ? 'organisatie gevonden' : 'organisaties gevonden'}
        </nldd-text>
      )}

      <nldd-container ref={wrapRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Organogram van de organisaties. De lijstweergave toont dezelfde organisaties."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </nldd-container>

      {selected && (
        <nldd-box>
          <nldd-container padding="16" gap="12">
            <nldd-container layout="row" gap="12" vertical-alignment="center">
              {selected.logo_url ? (
                <nldd-image src={selected.logo_url} decorative width="40" aspect-ratio="1/1" object-fit="contain"></nldd-image>
              ) : (
                <nldd-icon icon="building" size="40" box color={TYPE_ICON_COLOR[selected.organization_type]}></nldd-icon>
              )}
              <nldd-title
                heading-level={2}
                size={6}
                text={selected.name}
                supporting-text={`${selected.code ? `${selected.code} · ` : ''}${TYPE_LABEL[selected.organization_type]}`}
              ></nldd-title>
            </nldd-container>
            {selected.description && (
              <nldd-text size="xs" color="secondary">
                {selected.description}
              </nldd-text>
            )}
            <nldd-button-group>
              <nldd-button
                appearance="primary"
                end-icon="arrow-right"
                text="Prompts van deze organisatie"
                href={`/zoeken?org=${encodeURIComponent(selected.id)}`}
              ></nldd-button>
              <nldd-button appearance="secondary" text="Sluit" onClick={() => setSelected(null)}></nldd-button>
            </nldd-button-group>
          </nldd-container>
        </nldd-box>
      )}
    </nldd-container>
  );
}
