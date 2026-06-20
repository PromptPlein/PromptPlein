import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CountByLabel } from '@/services/analyticsService';
import { useTheme } from '@/context/ThemeContext';
import { categoryPalette, rijksblauw } from '@/config/brandColors';

const PALETTE = categoryPalette;

interface ChartCardProps {
  title: string;
  data: CountByLabel[];
  emptyHint?: string;
}

/** Themabewuste kleuren voor de recharts-elementen (assen, raster, tooltip). */
function useChartColors() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return {
    grid: dark ? '#334155' : '#e2e8f0',
    tick: dark ? '#94a3b8' : '#64748b',
    cursor: dark ? '#1e293b' : '#f1f5f9',
    tooltip: dark
      ? { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }
      : { borderRadius: 8 },
  };
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="opl-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ hint }: { hint?: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
      {hint ?? 'Nog geen data.'}
    </div>
  );
}

export function BarChartCard({ title, data, emptyHint }: ChartCardProps) {
  const c = useChartColors();
  return (
    <CardShell title={title}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.tick }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c.tick }} />
            <Tooltip cursor={{ fill: c.cursor }} contentStyle={c.tooltip} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}

export function LineChartCard({ title, data, emptyHint }: ChartCardProps) {
  const c = useChartColors();
  return (
    <CardShell title={title}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.tick }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c.tick }} />
            <Tooltip contentStyle={c.tooltip} />
            <Line type="monotone" dataKey="value" stroke={rijksblauw[400]} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}

export function PieChartCard({ title, data, emptyHint }: ChartCardProps) {
  const c = useChartColors();
  return (
    <CardShell title={title}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" outerRadius={90} label={{ fill: c.tick, fontSize: 11 }}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={c.tooltip} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}
