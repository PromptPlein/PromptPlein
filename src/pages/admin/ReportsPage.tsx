import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, FileText, CheckCircle2, Clock, XCircle, Building2, Users } from 'lucide-react';
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
  promptsByOrganization,
  promptsByRole,
  promptsByStatus,
  reportToCsv,
  type ReportData,
} from '@/services/reportService';

function Kpi({ icon: Icon, value, label }: { icon: typeof FileText; value: number; label: string }) {
  return (
    <div className="opl-card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-300">
        <Icon size={20} />
      </span>
      <div>
        <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { categoryById, roleById } = useReferenceData();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const catName = useMemo(
    () => (id: string) => categoryById(id)?.name ?? 'Onbekend',
    [categoryById],
  );
  const roleName = useMemo(() => (id: string) => roleById(id)?.name ?? 'Onbekend', [roleById]);

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
          <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Bestuurlijke rapportage</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Overzicht van prompts, organisaties en goedkeuringen.</p>
        </div>
        <div className="flex gap-2">
          <button className="opl-btn-secondary" onClick={() => reportToCsv(data, catName)}>
            <Download size={16} /> CSV
          </button>
          <button className="opl-btn-primary" onClick={() => printReport(data, catName)}>
            <Printer size={16} /> Rapport (PDF)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi icon={FileText} value={kpis.totalPrompts} label="Prompts" />
        <Kpi icon={CheckCircle2} value={kpis.approved} label="Goedgekeurd" />
        <Kpi icon={Clock} value={kpis.inReview} label="In behandeling" />
        <Kpi icon={XCircle} value={kpis.rejected} label="Afgewezen" />
        <Kpi icon={Building2} value={kpis.organizations} label="Organisaties" />
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
        <BarChartCard title="Prompts per functiegroep" data={promptsByRole(data.prompts, roleName)} />
        <BarChartCard
          title="Prompts per organisatie"
          data={promptsByOrganization(data)}
          emptyHint="Nog geen aan organisaties gekoppelde prompts."
        />
        <LineChartCard
          title="Goedkeuringen (laatste 30 dagen)"
          data={approvalsPerDay(data.approvals)}
          emptyHint="Nog geen goedkeuringsactiviteit."
        />
      </div>
    </div>
  );
}
