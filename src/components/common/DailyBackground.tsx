import { lazy, Suspense, useMemo } from 'react';

// De achtergrond rouleert per kalenderdag langs zeven varianten. Vier zijn shaders
// in Three.js (tegels, getij, polder, lucht), drie tekenen in Canvas 2D (kavels,
// netwerk, regels). Alles is lazy, zodat de pagina direct rendert en three.js
// alleen laadt op een dag die het nodig heeft.
const DashboardBackground = lazy(() => import('@/components/three/DashboardBackground'));
const PromptLinesBackground = lazy(() => import('@/components/common/PromptLinesBackground'));
const KavelsBackground = lazy(() => import('@/components/common/KavelsBackground'));
const NetwerkBackground = lazy(() => import('@/components/common/NetwerkBackground'));

// Shader en canvas om en om. Zeven varianten op zeven dagen: elke weekdag houdt
// zo zijn eigen achtergrond.
const VARIANTS = ['tegels', 'kavels', 'getij', 'netwerk', 'polder', 'regels', 'lucht'] as const;
type Variant = (typeof VARIANTS)[number];

// Grondkleur, zichtbaar zolang de achtergrond nog laadt.
const BASE_CLASS: Record<Variant, string> = {
  tegels: 'bg-rijksblauw-700',
  kavels: 'bg-rijksblauw-900',
  getij: 'bg-rijksblauw-900',
  netwerk: 'bg-rijksblauw-900',
  polder: 'bg-rijksblauw-900',
  regels: 'bg-rijksblauw-900',
  lucht: 'bg-rijksblauw-800',
};

function variantForToday(): Variant {
  // Alleen tijdens het ontwikkelen: ?achtergrond=getij toont die variant.
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(window.location.search).get('achtergrond');
    if ((VARIANTS as readonly string[]).includes(forced ?? '')) return forced as Variant;
  }
  const now = new Date();
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return VARIANTS[dayNumber % VARIANTS.length];
}

function Background({ variant }: { variant: Variant }) {
  switch (variant) {
    case 'regels':
      return <PromptLinesBackground />;
    case 'kavels':
      return <KavelsBackground />;
    case 'netwerk':
      return <NetwerkBackground />;
    default:
      return <DashboardBackground variant={variant} />;
  }
}

/**
 * De bewegende achtergrond van de dag, over de hele pagina.
 *
 * Staat `fixed` op de grootte van het venster en niet op de hoogte van de
 * pagina: de inhoud schuift eroverheen, en de shader hoeft nooit een canvas te
 * vullen dat vele malen hoger is dan wat je ziet. `-z-10` legt hem achter de
 * kopbalk en de voetbalk; die hebben geen eigen stapelvolgorde.
 *
 * De ondergrond is altijd donkerblauw, ook in de lichte modus. Zet de inhoud
 * er daarom op een dekkend paneel, zoals op de pagina Prompt maken.
 */
export default function DailyBackground() {
  const variant = useMemo(variantForToday, []);
  return (
    <div className={`fixed inset-0 -z-10 ${BASE_CLASS[variant]}`} aria-hidden="true">
      <Suspense fallback={null}>
        <Background variant={variant} />
      </Suspense>
    </div>
  );
}
