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

const PALETTE = ['#154273', '#e17000', '#39870c', '#d52b1e', '#5377d3', '#a9bbe9', '#0e2e51', '#e8a33d'];

interface ChartCardProps {
  title: string;
  data: CountByLabel[];
  emptyHint?: string;
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="opl-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ hint }: { hint?: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-slate-400">
      {hint ?? 'Nog geen data.'}
    </div>
  );
}

export function BarChartCard({ title, data, emptyHint }: ChartCardProps) {
  return (
    <CardShell title={title}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip cursor={{ fill: '#f1f5f9' }} />
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
  return (
    <CardShell title={title}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#154273" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}

export function PieChartCard({ title, data, emptyHint }: ChartCardProps) {
  return (
    <CardShell title={title}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" outerRadius={90} label>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}
