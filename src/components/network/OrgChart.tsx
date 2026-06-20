import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Maximize2, Building2, Search, X, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { Organization, OrganizationType } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { orgTypeColor } from '@/config/brandColors';

/**
 * Stil, professioneel 2D-organogram (SVG) van het organisatienetwerk.
 *
 * - Vaste, automatische top-down hiërarchie op basis van `parent_id`
 *   (zelfde weergave voor iedereen — nodes zijn niet versleepbaar).
 * - Node-breedte groeit mee met de volledige naam; niets wordt afgekapt.
 * - Pannen door te slepen, zoomen met scroll of de knoppen; daardoor blijft
 *   een groot organogram met afdelingen eronder overzichtelijk.
 * - Zoekbalk om snel een ministerie/afdeling/dienstonderdeel te vinden.
 * - Logo's per organisatie (`logo_url`) met code-fallback (bijv. OCW, DUO).
 * - Klik op een node → geavanceerd zoeken, gefilterd op die organisatie.
 */

// --- Afmetingen (in SVG-eenheden = pixels op zoom 1) ---
const NODE_H = 64;
const NODE_PAD_L = 66; // ruimte links (logo-vierkant) tot de tekst begint
const NODE_PAD_R = 18; // ruimte rechts na de tekst
const NODE_MIN_W = 150;
const NODE_MAX_W = 460;
const H_GAP = 28; // horizontale ruimte tussen broers/zussen
const V_GAP = 72; // verticale ruimte tussen lagen

const TITLE_FONT = '600 13.5px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const SUB_FONT = '11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.5;

const TYPE_LABEL: Record<OrganizationType, string> = {
  ministry: 'Ministerie',
  department: 'Afdeling',
  agency: 'Dienstonderdeel',
};

const TYPE_ACCENT: Record<OrganizationType, string> = orgTypeColor;

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
  const titleW = measureText(org.name, TITLE_FONT);
  const sub = `${org.code ? `${org.code} · ` : ''}${TYPE_LABEL[org.organization_type]}`;
  const subW = measureText(sub, SUB_FONT);
  const content = Math.max(titleW, subW);
  return Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, Math.ceil(NODE_PAD_L + content + NODE_PAD_R)));
}

/**
 * Bouw een bos (meerdere roots mogelijk) en leg het tidy uit. Subtree-breedtes
 * worden bottom-up bepaald op basis van de werkelijke (variabele) nodebreedtes,
 * daarna wordt elk kind onder het midden van zijn ouder gecentreerd.
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
  const edges: Edge[] = [];
  const placed = new Map<string, LaidOutNode>();
  let cursorX = 0; // lopende linkerrand-offset bij het naast elkaar plaatsen

  // Plaats een subtree; retourneer het midden-x van deze knoop.
  function place(node: TreeNode, depth: number): number {
    const y = depth * (NODE_H + V_GAP);
    const w = widthOf.get(node.org.id) ?? NODE_MIN_W;
    if (node.children.length === 0) {
      const x = cursorX + w / 2;
      cursorX += w + H_GAP;
      const laid: LaidOutNode = { org: node.org, x, y, w, depth };
      nodes.push(laid);
      placed.set(node.org.id, laid);
      return x;
    }
    const childCenters = node.children.map((c) => place(c, depth + 1));
    let x = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
    // Als de ouder breder is dan zijn kinderen samen, schuif de cursor mee zodat
    // er geen overlap ontstaat met de volgende tak.
    const half = w / 2;
    if (x - half < cursorX) {
      const shift = cursorX - (x - half);
      x += shift;
    }
    cursorX = Math.max(cursorX, x + half + H_GAP);
    const laid: LaidOutNode = { org: node.org, x, y, w, depth };
    nodes.push(laid);
    placed.set(node.org.id, laid);
    return x;
  }

  forest.forEach((tree) => {
    place(tree, 0);
    cursorX += H_GAP; // extra lucht tussen losse bomen
  });

  for (const o of orgs) {
    const to = o.parent_id ? placed.get(o.parent_id) : undefined;
    const from = placed.get(o.id);
    if (to && from) edges.push({ from, to });
  }

  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.w / 2);
    maxY = Math.max(maxY, n.y + NODE_H);
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

interface OrgNodeProps {
  node: LaidOutNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: (org: Organization) => void;
  dark: boolean;
}

function OrgNode({ node, selected, dimmed, onSelect, dark }: OrgNodeProps) {
  const [imgOk, setImgOk] = useState(true);
  const accent = TYPE_ACCENT[node.org.organization_type] ?? TYPE_ACCENT.ministry;
  const hasLogo = Boolean(node.org.logo_url) && imgOk;
  const left = node.x - node.w / 2;
  const w = node.w;

  const cardBg = dark ? '#1e293b' : '#ffffff';
  const cardBorder = selected ? accent : dark ? '#334155' : '#e2e8f0';
  const titleColor = dark ? '#e2e8f0' : '#0f172a';
  const subColor = dark ? '#94a3b8' : '#64748b';
  const badgeBg = dark ? '#0f172a' : '#f1f5f9';
  const fallback = fallbackLabel(node.org);
  const subtitle = `${node.org.code ? `${node.org.code} · ` : ''}${TYPE_LABEL[node.org.organization_type]}`;

  return (
    <g
      transform={`translate(${left}, ${node.y})`}
      className="cursor-pointer"
      opacity={dimmed ? 0.25 : 1}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.org);
      }}
    >
      <rect width={w} height={NODE_H} rx={12} fill={cardBg} stroke={cardBorder} strokeWidth={selected ? 2.5 : 1.25} />
      {/* accentstreep links voor type-onderscheid */}
      <rect width={4} height={NODE_H} rx={2} fill={accent} />

      {/* logo / code-fallback */}
      <g transform="translate(14, 12)">
        <rect width={40} height={40} rx={9} fill={badgeBg} stroke={dark ? '#334155' : '#e2e8f0'} strokeWidth={1} />
        {hasLogo ? (
          <image
            href={node.org.logo_url!}
            x={5}
            y={5}
            width={30}
            height={30}
            preserveAspectRatio="xMidYMid meet"
            onError={() => setImgOk(false)}
            style={{ pointerEvents: 'none' }}
          />
        ) : (
          <text
            x={20}
            y={21}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fallback.length >= 4 ? 11 : fallback.length === 3 ? 13 : 15}
            fontWeight={700}
            fill={accent}
            style={{ pointerEvents: 'none' }}
          >
            {fallback}
          </text>
        )}
      </g>

      {/* volledige naam + type (geen afkapping) */}
      <text x={NODE_PAD_L} y={26} fontSize={13.5} fontWeight={600} fill={titleColor} style={{ pointerEvents: 'none' }}>
        {node.org.name}
      </text>
      <text x={NODE_PAD_L} y={45} fontSize={11} fill={subColor} style={{ pointerEvents: 'none' }}>
        {subtitle}
      </text>
    </g>
  );
}

/** Orthogonaal verbindingspad (ouder-onder → kind-boven). */
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

export default function OrgChart({ orgs }: { orgs: Organization[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const navigate = useNavigate();

  const { nodes, edges, width, height } = useMemo(() => buildLayout(orgs), [orgs]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<Organization | null>(null);
  const [search, setSearch] = useState('');
  const dragRef = useRef<{ active: boolean; moved: boolean; sx: number; sy: number; ox: number; oy: number }>({
    active: false,
    moved: false,
    sx: 0,
    sy: 0,
    ox: 0,
    oy: 0,
  });

  const edgeColor = dark ? '#475569' : '#cbd5e1';
  const PADDING = 56;

  // Zoekresultaten (op naam of code). Leeg → geen filtering.
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

  // Centreer/pas-in: bereken een view die het hele organogram netjes toont.
  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el || width === 0 || height === 0) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min((vw - PADDING * 2) / width, (vh - PADDING * 2) / height, 1)),
    );
    const x = (vw - width * scale) / 2;
    const y = Math.max(PADDING, (vh - height * scale) / 2);
    setView({ x, y, scale });
  }, [width, height]);

  // Centreer de view rond een specifieke node (na zoeken/selectie).
  const focusNode = useCallback(
    (orgId: string) => {
      const el = containerRef.current;
      const node = nodes.find((n) => n.org.id === orgId);
      if (!el || !node) return;
      setView((v) => {
        const scale = Math.max(v.scale, 0.85);
        return {
          scale,
          x: el.clientWidth / 2 - node.x * scale,
          y: el.clientHeight / 2 - (node.y + NODE_H / 2) * scale,
        };
      });
    },
    [nodes],
  );

  // Eerste keer inpassen zodra afmetingen bekend zijn.
  useLayoutEffect(() => {
    fitView();
  }, [fitView]);

  // --- Pannen (slepen op de achtergrond) ---
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    d.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer al vrijgegeven */
    }
    // Klik op de lege achtergrond (zonder slepen) → deselecteren.
    if (!d.moved) setSelected(null);
  };

  // --- Zoomen met scroll, rond de cursor ---
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
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

  // Wheel met { passive: false } zodat preventDefault werkt.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Zoom-knoppen: rond het midden van het veld.
  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };

  // Spring naar de eerste match terwijl er getypt wordt.
  useEffect(() => {
    if (matches && matches.size > 0) {
      const first = nodes.find((n) => matches.has(n.org.id));
      if (first) focusNode(first.org.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openPromptsFor(org: Organization) {
    navigate(`/zoeken?org=${encodeURIComponent(org.id)}`);
  }

  if (orgs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        Nog geen organisaties om te tonen.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-slate-50 dark:bg-slate-900/40"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ cursor: dragRef.current.active ? 'grabbing' : 'grab' }}
    >
      {/* Subtiel puntenraster als achtergrond — geeft diepte zonder beweging. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-30"
        style={{
          backgroundImage: `radial-gradient(${dark ? '#334155' : '#cbd5e1'} 1px, transparent 1px)`,
          backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      />

      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <g transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`} style={{ pointerEvents: 'auto' }}>
          {edges.map((e, i) => (
            <path key={i} d={edgePath(e)} fill="none" stroke={edgeColor} strokeWidth={1.5} strokeLinejoin="round" />
          ))}
          {nodes.map((n) => (
            <OrgNode
              key={n.org.id}
              node={n}
              dark={dark}
              selected={selected?.id === n.org.id}
              dimmed={matches ? !matches.has(n.org.id) : false}
              onSelect={setSelected}
            />
          ))}
        </g>
      </svg>

      {/* Zoekbalk linksboven */}
      <div className="absolute left-4 top-4 w-64">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Zoek ministerie of afdeling…"
            className="w-full rounded-lg border border-slate-200 bg-white/95 py-2 pl-9 pr-8 text-sm text-slate-700 shadow-sm outline-none backdrop-blur placeholder:text-slate-400 focus:border-rijksblauw-400 focus:ring-2 focus:ring-rijksblauw-500/20 dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              aria-label="Zoekopdracht wissen"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {matches && (
          <p className="mt-1.5 pl-1 text-xs text-slate-500 dark:text-slate-400">
            {matches.size} {matches.size === 1 ? 'organisatie gevonden' : 'organisaties gevonden'}
          </p>
        )}
      </div>

      {/* Zoomregelaars */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Inzoomen"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.8)}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Uitzoomen"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={fitView}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          aria-label="Passend maken"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {/* Detailpaneel bij selectie */}
      {selected && (
        <div
          className="absolute right-4 top-4 w-72 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-800/95"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg"
              style={{ backgroundColor: TYPE_ACCENT[selected.organization_type] + '1a' }}
            >
              {selected.logo_url ? (
                <img src={selected.logo_url} alt="" className="h-7 w-7 object-contain" />
              ) : (
                <Building2 size={18} style={{ color: TYPE_ACCENT[selected.organization_type] }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selected.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selected.code ? `${selected.code} · ` : ''}
                {TYPE_LABEL[selected.organization_type]}
              </p>
            </div>
          </div>
          {selected.description && (
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{selected.description}</p>
          )}
          <button
            type="button"
            onClick={() => openPromptsFor(selected)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-rijksblauw-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-rijksblauw-600 dark:bg-rijksblauw-600 dark:hover:bg-rijksblauw-500"
          >
            Prompts van deze organisatie
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={clsx(
              'mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
            )}
          >
            Sluiten
          </button>
        </div>
      )}
    </div>
  );
}
