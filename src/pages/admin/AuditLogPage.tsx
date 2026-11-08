import { useEffect, useState } from 'react';
import { listAuditEntries } from '@/services/adminService';
import { formatDate } from '@/lib/utils';
import type { AuditLogEntry } from '@/types';

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAuditEntries()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <nldd-container layout="stack" gap="24">
      <nldd-title heading-level={1} size={2} text="Audit log" supporting-text="Alle wijzigingen door beheerders."></nldd-title>

      {loading ? (
        <nldd-container min-height="12rem">
          <nldd-activity-indicator></nldd-activity-indicator>
        </nldd-container>
      ) : (
        <nldd-table
          accessible-label="Audit log"
          columns="minmax(8rem,1fr) minmax(7rem,1fr) minmax(10rem,2fr) minmax(8rem,auto)"
          sm-columns="minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)"
        >
          <nldd-table-row slot="header">
            <nldd-text-cell text="Actie"></nldd-text-cell>
            <nldd-text-cell text="Entiteit"></nldd-text-cell>
            <nldd-text-cell text="Details" hide-below="md"></nldd-text-cell>
            <nldd-text-cell text="Tijdstip"></nldd-text-cell>
          </nldd-table-row>
          {entries.map((e) => (
            <nldd-table-row key={e.id}>
              <nldd-cell row-header>
                <nldd-tag size="sm" color="lintblauw" text={e.action}></nldd-tag>
              </nldd-cell>
              <nldd-text-cell text={e.entity_type} color="secondary"></nldd-text-cell>
              <nldd-text-cell
                size="sm"
                color="secondary"
                text={e.changes ? JSON.stringify(e.changes) : 'Geen'}
                hide-below="md"
              ></nldd-text-cell>
              <nldd-text-cell size="sm" color="secondary" text={formatDate(e.created_at)}></nldd-text-cell>
            </nldd-table-row>
          ))}
          <nldd-inline-dialog slot="empty" icon="history" text="Nog geen admin-acties geregistreerd."></nldd-inline-dialog>
        </nldd-table>
      )}
    </nldd-container>
  );
}
