import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';
import type { CountByLabel } from '@/services/analyticsService';
import { prefersReducedMotion } from '@/context/AccessibilityContext';
import { tooltipStyle, useChartColors } from './chartColors';
import '@nldd/design-system/badge';
import '@nldd/design-system/card';
import '@nldd/design-system/cell';
import '@nldd/design-system/container';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/spacer-cell';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/title';

type HeadingLevel = 2 | 3 | 4;

interface ChartCardProps {
  title: string;
  data: CountByLabel[];
  emptyHint?: string;
  /** Heading level of the card title (default 2). */
  headingLevel?: HeadingLevel;
}

interface BarChartCardProps extends ChartCardProps {
  /** Maakt de staven klikbaar; krijgt het label van de aangeklikte staaf. */
  onBarClick?: (label: string) => void;
  /** Het label van de momenteel geselecteerde staaf (krijgt nadruk). */
  activeLabel?: string | null;
}

const TICK_SIZE = 12;
/** Height of one bar row in the horizontal bar chart, bar plus the space around it. */
const BAR_ROW = 36;
const MAX_LABEL_CHARS = 22;

function CardShell({
  title,
  headingLevel = 2,
  children,
}: {
  title: string;
  headingLevel?: HeadingLevel;
  children: ReactNode;
}) {
  return (
    <nldd-card>
      <nldd-container padding="24" sm-padding="16" gap="16">
        <nldd-title heading-level={headingLevel} size={5} text={title}></nldd-title>
        {children}
      </nldd-container>
    </nldd-card>
  );
}

function EmptyState({ hint, icon }: { hint?: string; icon: string }) {
  return (
    <nldd-container padding-block="8">
      <nldd-inline-dialog
        icon={icon}
        icon-color="secondary"
        text="Nog geen gegevens"
        supporting-text={hint}
      ></nldd-inline-dialog>
    </nldd-container>
  );
}

function shortLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

/**
 * Horizontal bars, ranked: the labels read left to right without turning,
 * and every bar carries its own value, so no value axis is needed.
 */
export function BarChartCard({ title, data, emptyHint, onBarClick, activeLabel, headingLevel }: BarChartCardProps) {
  const c = useChartColors();
  const clickable = Boolean(onBarClick);
  const longest = Math.max(0, ...data.map((d) => shortLabel(d.label).length));
  const labelWidth = Math.min(150, Math.max(64, longest * 8 + 16));
  return (
    <CardShell title={title} headingLevel={headingLevel}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} icon="bar-chart" />
      ) : (
        <ResponsiveContainer width="100%" height={data.length * BAR_ROW + 8}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }} barCategoryGap={8}>
            <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={labelWidth}
              tickFormatter={shortLabel}
              tick={{ fontSize: TICK_SIZE, fill: c.tick }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip cursor={{ fill: c.cursor }} contentStyle={tooltipStyle} formatter={(v) => [v, 'Aantal']} />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
              isAnimationActive={!prefersReducedMotion()}
              animationDuration={300}
              cursor={clickable ? 'pointer' : undefined}
              onClick={(d) => {
                const label = (d as { payload?: CountByLabel }).payload?.label;
                if (label) onBarClick?.(label);
              }}
            >
              {data.map((d, i) => {
                const dimmed = clickable && activeLabel != null && activeLabel !== d.label;
                return <Cell key={i} fill={c.line} fillOpacity={dimmed ? 0.25 : 1} />;
              })}
              <LabelList dataKey="value" position="right" fill={c.tick} fontSize={TICK_SIZE} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}

export function LineChartCard({ title, data, emptyHint, headingLevel }: ChartCardProps) {
  const c = useChartColors();
  return (
    <CardShell title={title} headingLevel={headingLevel}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} icon="line-chart" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: TICK_SIZE, fill: c.tick }}
              axisLine={{ stroke: c.grid }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: TICK_SIZE, fill: c.tick }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Aantal']} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={c.line}
              strokeWidth={2}
              dot={data.length > 14 ? false : { r: 3, fill: c.line }}
              activeDot={{ r: 4 }}
              isAnimationActive={!prefersReducedMotion()}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </CardShell>
  );
}

export function PieChartCard({ title, data, emptyHint, headingLevel }: ChartCardProps) {
  const c = useChartColors();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <CardShell title={title} headingLevel={headingLevel}>
      {data.length === 0 ? (
        <EmptyState hint={emptyHint} icon="bar-chart" />
      ) : (
        <nldd-container gap="16">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius={52}
                outerRadius={84}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={!prefersReducedMotion()}
                animationDuration={300}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={c.series[i % c.series.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <nldd-list accessible-label={`Verdeling ${title.toLowerCase()}`}>
            {data.map((d, i) => (
              <nldd-list-item key={d.label} size="sm">
                <nldd-cell vertical-alignment="center">
                  <nldd-badge size="sm" custom-color={c.series[i % c.series.length]} decorative></nldd-badge>
                </nldd-cell>
                <nldd-spacer-cell size="8"></nldd-spacer-cell>
                <nldd-text-cell text={d.label}></nldd-text-cell>
                <nldd-text-cell
                  width="fit-content"
                  horizontal-alignment="right"
                  color="secondary"
                  text={`${d.value} (${total > 0 ? Math.round((d.value / total) * 100) : 0}%)`}
                ></nldd-text-cell>
              </nldd-list-item>
            ))}
          </nldd-list>
        </nldd-container>
      )}
    </CardShell>
  );
}

/** One key figure: the number is the point, the label says what it counts. */
export function KeyFigure({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <nldd-card>
      <nldd-container padding="20" sm-padding="16" gap="4">
        <nldd-text size="sm" color="secondary">
          {label}
        </nldd-text>
        <nldd-text size="display-1">{value}</nldd-text>
        {hint && (
          <nldd-text size="xs" color="secondary">
            {hint}
          </nldd-text>
        )}
      </nldd-container>
    </nldd-card>
  );
}
