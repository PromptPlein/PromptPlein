import { useEffect, useMemo, useState } from 'react';
import { notify } from '@/lib/notify';
import { BarChartCard, KeyFigure, LineChartCard, PieChartCard } from '@/components/analytics/Charts';
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
import '@nldd/design-system/activity-indicator';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/title';

const PAGE_TITLE = 'Bestuurlijke rapportage';
const PAGE_INTRO = 'Overzicht van prompts, organisaties en goedkeuringen.';

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
      .catch((err) => notify.error(err instanceof Error ? err.message : 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <nldd-container layout="stack" gap="24">
        <nldd-title heading-level={1} size={3} text={PAGE_TITLE} supporting-text={PAGE_INTRO}></nldd-title>
        <nldd-container min-height="16rem">
          {loading && <nldd-activity-indicator></nldd-activity-indicator>}
        </nldd-container>
      </nldd-container>
    );
  }

  const kpis = computeKpis(data);

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-container gap="16">
        <nldd-title heading-level={1} size={3} text={PAGE_TITLE} supporting-text={PAGE_INTRO}></nldd-title>
        <nldd-button-group>
          <nldd-button
            appearance="secondary"
            start-icon="download"
            text="CSV"
            onClick={() => reportToCsv(data, catName)}
          ></nldd-button>
          <nldd-button
            appearance="primary"
            start-icon="printer"
            text="Rapport (PDF)"
            onClick={() => printReport(data, catName)}
          ></nldd-button>
        </nldd-button-group>
      </nldd-container>

      <nldd-container layout="grid" gap="16" column-count={2} md-column-count={3}>
        <KeyFigure value={kpis.totalPrompts} label="Prompts" />
        <KeyFigure value={kpis.organizations} label="Organisaties" />
        <KeyFigure value={kpis.users} label="Gebruikers" />
        <KeyFigure value={kpis.approved} label="Goedgekeurd" />
        <KeyFigure value={kpis.inReview} label="In behandeling" />
        <KeyFigure value={kpis.rejected} label="Afgewezen" />
      </nldd-container>

      <nldd-container layout="grid" gap="16" column-count={1} md-column-count={2}>
        <PieChartCard title="Prompts per status" data={promptsByStatus(data.prompts)} />
        <PieChartCard
          title="Goedkeuringen"
          data={approvalOutcomes(data.approvals)}
          emptyHint="Besluiten verschijnen hier zodra een beoordelaar een aanvraag afhandelt."
        />
      </nldd-container>
      <LineChartCard
        title="Goedkeuringen (laatste 30 dagen)"
        data={approvalsPerDay(data.approvals)}
        emptyHint="Hier zie je per dag hoeveel aanvragen zijn afgehandeld."
      />
      <nldd-container layout="grid" gap="16" column-count={1} md-column-count={2}>
        <BarChartCard title="Prompts per categorie" data={promptsByCategory(data.prompts, catName)} />
        <BarChartCard title="Prompts per functiegroep" data={promptsByRole(data.prompts, roleName)} />
      </nldd-container>
      <BarChartCard
        title="Prompts per organisatie"
        data={promptsByOrganization(data)}
        emptyHint="Prompts die aan een organisatie gekoppeld zijn, verschijnen hier."
      />
    </nldd-container>
  );
}
