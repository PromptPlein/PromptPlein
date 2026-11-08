import { downloadText } from '@/lib/download';
import { PROMPT_STATUS_META } from '@/services/collaborationService';
import { documentStyle } from '@/config/brandColors';
import type { Prompt, SharingLevel } from '@/types';

/**
 * Exporteren van prompts naar overheidsconforme documenten. Volledig client-side
 * en zonder externe afhankelijkheden:
 *   - HTML / Markdown / JSON / CSV → directe download
 *   - Word (.doc) → HTML met Word-MIME (opent in Microsoft Word)
 *   - PDF → opent een opgemaakt printvenster (Opslaan als PDF)
 */

export type ExportFormat = 'pdf' | 'word' | 'html' | 'markdown' | 'json';

export interface ExportMeta {
  categoryName?: string;
  roleName?: string;
}

/** Vertaal het deelniveau naar een rubriceringslabel voor de documentkop. */
const CLASSIFICATION: Record<SharingLevel, string> = {
  private: 'Vertrouwelijk: persoonlijk',
  department: 'Intern: afdeling',
  ministry: 'Intern: ministerie',
  public: 'Openbaar',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'prompt'
  );
}

function formatStamp(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * Builds a formatted HTML document for one prompt.
 *
 * Generated document: this string is a standalone file that leaves the app
 * (download, Word, print). The design system's web components do not exist
 * there, so it is plain HTML with its own stylesheet; the purity gate reports
 * its elements and class attributes on purpose. Colors and fonts come from the
 * design system tokens through documentStyle().
 */
export function buildPromptHtml(prompt: Prompt, meta: ExportMeta = {}): string {
  const classification = CLASSIFICATION[prompt.sharing_level] ?? 'Intern';
  const status = prompt.status ? PROMPT_STATUS_META[prompt.status].label : '—';
  const generated = new Date().toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short' });
  const c = documentStyle();

  const row = (label: string, value: string) =>
    `<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(prompt.title)}</title>
<style>
  @page { margin: 25mm 20mm; }
  body { font-family: ${c.fontFamily}; color: ${c.content}; line-height: 1.55; max-width: 800px; margin: 0 auto; padding: 24px; }
  .classification { text-align: center; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${c.primary}; border-top: 2px solid ${c.primary}; border-bottom: 2px solid ${c.primary}; padding: 6px 0; font-size: 12px; }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-top: 18px; }
  .brand { font-weight: 700; color: ${c.primary}; font-size: 18px; }
  .brand small { display:block; font-weight: 400; color: ${c.secondary}; font-size: 11px; letter-spacing: .04em; }
  .generated { font-size: 12px; color: ${c.secondary}; }
  h1 { font-size: 24px; color: ${c.heading}; margin: 24px 0 4px; }
  .description { color: ${c.secondary}; margin: 0 0 18px; }
  table.meta { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 13px; }
  table.meta th { text-align: left; width: 180px; color: ${c.secondary}; font-weight: 600; padding: 4px 8px; vertical-align: top; }
  table.meta td { padding: 4px 8px; }
  .content { white-space: pre-wrap; background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 8px; padding: 16px; font-family: ${c.monoFamily}; font-size: 13px; }
  .signature { margin-top: 40px; display: flex; gap: 48px; }
  .signature div { flex: 1; border-top: 1px solid ${c.muted}; padding-top: 6px; font-size: 12px; color: ${c.secondary}; }
  footer { margin-top: 32px; border-top: 1px solid ${c.border}; padding-top: 8px; font-size: 11px; color: ${c.muted}; text-align: center; }
</style>
</head>
<body>
  <div class="classification">${escapeHtml(classification)}</div>
  <header>
    <div class="brand">Rijksoverheid<small>Overheid Prompt Library</small></div>
    <div class="generated">Gegenereerd: ${escapeHtml(generated)}</div>
  </header>

  <h1>${escapeHtml(prompt.title)}</h1>
  ${prompt.description ? `<p class="description">${escapeHtml(prompt.description)}</p>` : ''}

  <table class="meta">
    ${row('Status', status)}
    ${row('Rubricering', classification)}
    ${row('Categorie', meta.categoryName ?? '—')}
    ${row('Functiegroep', meta.roleName ?? '—')}
    ${row('Auteur', prompt.created_by || '—')}
    ${row('Aangemaakt', formatStamp(prompt.created_at))}
    ${row('Laatst bijgewerkt', formatStamp(prompt.updated_at))}
  </table>

  <div class="content">${escapeHtml(prompt.content)}</div>

  <div class="signature">
    <div>Opgesteld door<br/>&nbsp;</div>
    <div>Geaccordeerd door<br/>&nbsp;</div>
  </div>

  <footer>
    Dit document is automatisch gegenereerd uit de Overheid Prompt Library. Rubricering: ${escapeHtml(classification)}.
  </footer>
</body>
</html>`;
}

function buildMarkdown(prompt: Prompt, meta: ExportMeta): string {
  const classification = CLASSIFICATION[prompt.sharing_level] ?? 'Intern';
  const status = prompt.status ? PROMPT_STATUS_META[prompt.status].label : '—';
  return [
    `> **${classification}** · Overheid Prompt Library`,
    '',
    `# ${prompt.title}`,
    prompt.description ? `\n_${prompt.description}_` : '',
    '',
    `| Veld | Waarde |`,
    `| --- | --- |`,
    `| Status | ${status} |`,
    `| Categorie | ${meta.categoryName ?? '—'} |`,
    `| Functiegroep | ${meta.roleName ?? '—'} |`,
    `| Auteur | ${prompt.created_by || '—'} |`,
    `| Aangemaakt | ${formatStamp(prompt.created_at)} |`,
    '',
    '## Prompt',
    '',
    '```',
    prompt.content,
    '```',
    '',
  ].join('\n');
}

export function exportPrompt(prompt: Prompt, format: ExportFormat, meta: ExportMeta = {}): void {
  const base = safeFilename(prompt.title);
  switch (format) {
    case 'html':
      downloadText(`${base}.html`, buildPromptHtml(prompt, meta), 'text/html');
      break;
    case 'word':
      // Word opent een HTML-bestand met deze MIME als .doc.
      downloadText(`${base}.doc`, buildPromptHtml(prompt, meta), 'application/msword');
      break;
    case 'markdown':
      downloadText(`${base}.md`, buildMarkdown(prompt, meta), 'text/markdown');
      break;
    case 'json':
      downloadText(`${base}.json`, JSON.stringify({ ...prompt, ...meta }, null, 2), 'application/json');
      break;
    case 'pdf':
      printPdf(buildPromptHtml(prompt, meta));
      break;
  }
}

/** Open een printvenster zodat de gebruiker als PDF kan opslaan. */
function printPdf(html: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    // Pop-up geblokkeerd → val terug op HTML-download.
    downloadText('prompt.html', html, 'text/html');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Korte vertraging zodat stijlen/lettertypen geladen zijn vóór de printdialoog.
  setTimeout(() => win.print(), 350);
}

/** Bulk-export van meerdere prompts naar CSV. */
export function exportPromptsCsv(prompts: Prompt[], filename = 'prompts.csv'): void {
  const header = ['title', 'status', 'sharing_level', 'created_by', 'created_at', 'content'];
  const rows = prompts.map((p) =>
    [p.title, p.status ?? '', p.sharing_level, p.created_by, p.created_at, p.content]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  );
  downloadText(filename, [header.join(','), ...rows].join('\n'), 'text/csv');
}
