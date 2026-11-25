import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, FileText, CheckCircle2, Clock, XCircle, Users } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { BarChartCard, LineChartCard, PieChartCard } from '@/components/analytics/Charts';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  approvalOutcomes,
  approvalsPerDay,
  computeKpis,
  loadReportData,
  printReport,
  promptsByCategory,
  promptsByStatus,
  reportToCsv,
  type ReportData,
} from '@/services/reportService';

function Kpi({ icon: Icon, value, label }: { icon: typeof FileText; value: number; label: string }) {
  return (
    <div className="opl-card flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
        <Icon size={20} />
      </span>
      <div className="min-w-0 max-w-full">
        <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { categoryById } = useReferenceData();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const catName = useMemo(
    () => (id: string) => categoryById(id)?.name ?? 'Onbekend',
    [categoryById],
  );

  useEffect(() => {
    loadReportData()
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="skeleton h-64 w-full rounded-xl" />;

  const kpis = computeKpis(data);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Rapportage</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Overzicht van prompts en goedkeuringen.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="opl-btn-secondary" onClick={() => reportToCsv(data, catName)}>
            <Download size={16} /> CSV
          </button>
          <button className="opl-btn-primary" onClick={() => printReport(data, catName)}>
            <Printer size={16} /> Rapport (PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={FileText} value={kpis.totalPrompts} label="Prompts" />
        <Kpi icon={CheckCircle2} value={kpis.approved} label="Goedgekeurd" />
        <Kpi icon={Clock} value={kpis.inReview} label="In behandeling" />
        <Kpi icon={XCircle} value={kpis.rejected} label="Afgewezen" />
        <Kpi icon={Users} value={kpis.users} label="Gebruikers" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Prompts per status" data={promptsByStatus(data.prompts)} />
        <PieChartCard
          title="Goedkeuringen"
          data={approvalOutcomes(data.approvals)}
          emptyHint="Nog geen goedkeuringsbeslissingen."
        />
        <BarChartCard title="Prompts per categorie" data={promptsByCategory(data.prompts, catName)} />
        <LineChartCard
          title="Goedkeuringen (laatste 30 dagen)"
          data={approvalsPerDay(data.approvals)}
          emptyHint="Nog geen goedkeuringsactiviteit."
        />
      </div>
    </div>
  );
}
