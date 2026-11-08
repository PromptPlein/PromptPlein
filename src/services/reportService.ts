import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { listPrompts } from '@/services/repository';
import { listOrganizations, listProfiles } from '@/services/orgService';
import { PROMPT_STATUS_META } from '@/services/collaborationService';
import { downloadText } from '@/lib/download';
import { documentStyle } from '@/config/brandColors';
import type { CountByLabel } from '@/services/analyticsService';
import type { Organization, Profile, Prompt, PromptApproval, PromptStatus } from '@/types';

/** Geaggregeerde rapportagegegevens voor het bestuurlijke dashboard. */

export interface ReportData {
  prompts: Prompt[];
  profiles: Profile[];
  organizations: Organization[];
  approvals: PromptApproval[];
}

export async function listAllApprovals(): Promise<PromptApproval[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('prompt_approvals')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as PromptApproval[]) ?? [];
}

export async function loadReportData(): Promise<ReportData> {
  const [prompts, profiles, organizations, approvals] = await Promise.all([
    listPrompts({}),
    listProfiles(),
    listOrganizations(true),
    listAllApprovals(),
  ]);
  return { prompts, profiles, organizations, approvals };
}

// --- Aggregaties ---

const STATUS_ORDER: PromptStatus[] = ['draft', 'submitted', 'approved', 'rejected', 'archived'];

export function promptsByStatus(prompts: Prompt[]): CountByLabel[] {
  const counts = new Map<PromptStatus, number>();
  for (const p of prompts) {
    const s = (p.status ?? 'approved') as PromptStatus;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return STATUS_ORDER.filter((s) => counts.get(s)).map((s) => ({
    label: PROMPT_STATUS_META[s].label,
    value: counts.get(s)!,
  }));
}

/** Generieke telling op een sleutel met label-resolver, gesorteerd aflopend. */
function countBy(
  prompts: Prompt[],
  keyFn: (p: Prompt) => string | null | undefined,
  labelFn: (key: string) => string,
  topN = 8,
): CountByLabel[] {
  const counts = new Map<string, number>();
  for (const p of prompts) {
    const key = keyFn(p) ?? '__none__';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, value]) => ({ label: key === '__none__' ? 'Onbekend' : labelFn(key), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

export function promptsByCategory(prompts: Prompt[], name: (id: string) => string): CountByLabel[] {
  return countBy(prompts, (p) => p.category_id, name);
}

export function promptsByRole(prompts: Prompt[], name: (id: string) => string): CountByLabel[] {
  return countBy(prompts, (p) => p.role_id, name);
}

/** Prompts per organisatie, via eigenaar → profiel → organisatie. */
export function promptsByOrganization(data: ReportData): CountByLabel[] {
  const profileOrg = new Map(data.profiles.map((p) => [p.id, p.organization_id ?? null]));
  const orgName = new Map(data.organizations.map((o) => [o.id, o.name]));
  return countBy(
    data.prompts,
    (p) => (p.created_by_user ? profileOrg.get(p.created_by_user) ?? null : null),
    (id) => orgName.get(id) ?? 'Onbekend',
  );
}

export function approvalsPerDay(approvals: PromptApproval[], days = 30): CountByLabel[] {
  const buckets = new Map<string, number>();
  for (const a of approvals) {
    const day = a.created_at.slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([label, value]) => ({ label, value }));
}

export function approvalOutcomes(approvals: PromptApproval[]): CountByLabel[] {
  const approved = approvals.filter((a) => a.status === 'approved').length;
  const rejected = approvals.filter((a) => a.status === 'rejected').length;
  const out: CountByLabel[] = [];
  if (approved) out.push({ label: 'Goedgekeurd', value: approved });
  if (rejected) out.push({ label: 'Afgewezen', value: rejected });
  return out;
}

export interface ReportKpis {
  totalPrompts: number;
  approved: number;
  inReview: number;
  rejected: number;
  organizations: number;
  users: number;
}

export function computeKpis(data: ReportData): ReportKpis {
  const byStatus = (s: PromptStatus) => data.prompts.filter((p) => (p.status ?? 'approved') === s).length;
  return {
    totalPrompts: data.prompts.length,
    approved: byStatus('approved'),
    inReview: byStatus('submitted'),
    rejected: byStatus('rejected'),
    organizations: data.organizations.length,
    users: data.profiles.length,
  };
}

// --- Export ---

export function reportToCsv(data: ReportData, catName: (id: string) => string): void {
  const lines: string[] = ['sectie,label,waarde'];
  const push = (section: string, rows: CountByLabel[]) =>
    rows.forEach((r) => lines.push(`${section},"${r.label.replace(/"/g, '""')}",${r.value}`));
  push('status', promptsByStatus(data.prompts));
  push('categorie', promptsByCategory(data.prompts, catName));
  push('organisatie', promptsByOrganization(data));
  push('goedkeuringen', approvalOutcomes(data.approvals));
  downloadText('rapportage.csv', lines.join('\n'), 'text/csv');
}

/**
 * Opens a formatted, printable management report (Save as PDF).
 *
 * Generated document: the HTML below is a standalone page in a new window that
 * leaves the app. The design system's web components do not exist there, so it
 * is plain HTML with its own stylesheet; the purity gate reports its elements
 * and class attributes on purpose. Colors and fonts come from the design system
 * tokens through documentStyle().
 */
export function printReport(data: ReportData, catName: (id: string) => string): void {
  const kpis = computeKpis(data);
  const c = documentStyle();
  const generated = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' });

  const table = (heading: string, rows: CountByLabel[]) => `
    <h2>${heading}</h2>
    <table>${rows.map((r) => `<tr><td>${r.label}</td><td class="num">${r.value}</td></tr>`).join('')}</table>`;

  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"/>
  <title>Bestuurlijke rapportage</title>
  <style>
    @page { margin: 22mm 18mm; }
    body { font-family: ${c.fontFamily}; color:${c.content}; max-width:800px; margin:0 auto; }
    .classification { text-align:center; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:${c.primary}; border-top:2px solid ${c.primary}; border-bottom:2px solid ${c.primary}; padding:6px 0; font-size:12px; }
    .brand { font-weight:700; color:${c.primary}; font-size:18px; margin-top:16px; }
    .generated { color:${c.secondary}; font-size:13px; }
    h1 { color:${c.heading}; font-size:22px; }
    h2 { color:${c.primary}; font-size:15px; margin-top:24px; border-bottom:1px solid ${c.border}; padding-bottom:4px; }
    .kpis { display:flex; flex-wrap:wrap; gap:12px; margin:16px 0; }
    .kpi { flex:1 1 120px; border:1px solid ${c.border}; border-radius:8px; padding:12px; text-align:center; }
    .kpi b { display:block; font-size:24px; color:${c.primary}; }
    .kpi span { font-size:12px; color:${c.secondary}; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    td { padding:4px 8px; border-bottom:1px solid ${c.faint}; }
    td.num { text-align:right; font-weight:600; }
    footer { margin-top:32px; border-top:1px solid ${c.border}; padding-top:8px; font-size:11px; color:${c.muted}; text-align:center; }
  </style></head><body>
    <div class="classification">Intern: bestuurlijke rapportage</div>
    <div class="brand">Rijksoverheid</div>
    <h1>Bestuurlijke rapportage: Overheid Prompt Library</h1>
    <p class="generated">Gegenereerd: ${generated}</p>
    <div class="kpis">
      <div class="kpi"><b>${kpis.totalPrompts}</b><span>Prompts</span></div>
      <div class="kpi"><b>${kpis.approved}</b><span>Goedgekeurd</span></div>
      <div class="kpi"><b>${kpis.inReview}</b><span>In behandeling</span></div>
      <div class="kpi"><b>${kpis.rejected}</b><span>Afgewezen</span></div>
      <div class="kpi"><b>${kpis.organizations}</b><span>Organisaties</span></div>
      <div class="kpi"><b>${kpis.users}</b><span>Gebruikers</span></div>
    </div>
    ${table('Prompts per status', promptsByStatus(data.prompts))}
    ${table('Prompts per categorie', promptsByCategory(data.prompts, catName))}
    ${table('Prompts per organisatie', promptsByOrganization(data))}
    ${table('Goedkeuringen', approvalOutcomes(data.approvals))}
    <footer>Automatisch gegenereerd uit de Overheid Prompt Library · Rubricering: Intern</footer>
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    downloadText('rapportage.html', html, 'text/html');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}
