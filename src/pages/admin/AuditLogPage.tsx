import { useEffect, useState } from 'react';
import { ScrollText } from '@/components/common/icons';
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
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          <ScrollText size={22} /> Audit log
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Alle wijzigingen door beheerders.</p>
      </div>

      <div className="opl-card overflow-hidden">
        {loading ? (
          <div className="skeleton h-48 w-full" />
        ) : entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">Nog geen admin-acties geregistreerd.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Actie</th>
                <th className="px-4 py-3 font-medium">Entiteit</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Details</th>
                <th className="px-4 py-3 font-medium">Tijdstip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">
                    <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">{e.action}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.entity_type}</td>
                  <td className="hidden px-4 py-3 text-xs text-slate-400 sm:table-cell dark:text-slate-500">
                    {e.changes ? JSON.stringify(e.changes) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">{formatDate(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
