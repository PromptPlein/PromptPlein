import { lazy, Suspense, useMemo } from 'react';
import LightSweepBackground from '@/components/common/LightSweepBackground';

// De achtergrond rouleert per kalenderdag langs vier varianten: tegels en polder
// (Three.js), promptregels (Canvas 2D) en effen met lichtbaan (alleen CSS). De
// zware twee zijn lazy, zodat de pagina direct rendert en three.js alleen laadt
// op een dag die het nodig heeft.
const DashboardBackground = lazy(() => import('@/components/three/DashboardBackground'));
const PromptLinesBackground = lazy(() => import('@/components/common/PromptLinesBackground'));

const VARIANTS = ['tegels', 'polder', 'effen', 'regels'] as const;
type Variant = (typeof VARIANTS)[number];

// Grondkleur, zichtbaar zolang de achtergrond nog laadt.
const BASE_CLASS: Record<Variant, string> = {
  tegels: 'bg-rijksblauw-700',
  polder: 'bg-rijksblauw-900',
  effen: 'bg-rijksblauw-800',
  regels: 'bg-rijksblauw-900',
};

function variantForToday(): Variant {
  const now = new Date();
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return VARIANTS[dayNumber % VARIANTS.length];
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
      {variant === 'effen' ? (
        <LightSweepBackground />
      ) : (
        <Suspense fallback={null}>
          {variant === 'regels' ? (
            <PromptLinesBackground />
          ) : (
            <DashboardBackground variant={variant} />
          )}
        </Suspense>
      )}
    </div>
  );
}
