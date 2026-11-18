import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText, Loader2 } from '@/components/common/icons';
import { downloadBinary } from '@/lib/download';
import { buildExcelWorkbook, hasTable, XLSX_MIME } from '@/lib/excelExport';
import { loadWordTemplate, useWordLook } from '@/lib/wordSettings';
import { trackEvent } from '@/services/analyticsService';

const BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-rijksblauw-700 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-200';

const LOOK_LABEL = { rijk: 'Rijkshuisstijl', eenvoudig: 'eenvoudige opmaak', sjabloon: 'je eigen sjabloon' };

/**
 * Word en Excel onder een chatantwoord. Het bestand wordt in de browser gemaakt:
 * de AI levert de inhoud, de opmaak komt uit de gekozen vormgeving (Instellingen,
 * Chat). Excel staat er alleen als het antwoord een tabel heeft.
 */
export default function DocumentDownloads({
  text,
  sources,
}: {
  text: string;
  sources?: { title: string; url: string }[];
}) {
  const look = useWordLook();
  const withTable = useMemo(() => hasTable(text), [text]);
  const [busy, setBusy] = useState<'word' | 'excel' | null>(null);

  async function downloadWord() {
    setBusy('word');
    try {
      const { buildWordDocument, DOCX_MIME } = await import('@/lib/wordExport');
      const template = look === 'sjabloon' ? await loadWordTemplate() : null;
      if (look === 'sjabloon' && !template) {
        toast('Je sjabloon is niet gevonden. Het document heeft de Rijkshuisstijl.');
      }
      const effective = template ? 'sjabloon' : look === 'sjabloon' ? 'rijk' : look;
      const result = await buildWordDocument({ markdown: text, sources }, effective, template?.bytes);
      downloadBinary(result.fileName, result.data, DOCX_MIME);
      void trackEvent({ event_type: 'export_word', metadata: { vormgeving: effective } });
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : 'Het Word-bestand is niet gelukt.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadExcel() {
    setBusy('excel');
    try {
      const result = await buildExcelWorkbook(text);
      if (result) {
        downloadBinary(result.fileName, result.data, XLSX_MIME);
        void trackEvent({ event_type: 'export_excel' });
      }
    } catch {
      toast.error('Het Excel-bestand is niet gelukt.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => void downloadWord()}
        disabled={busy !== null}
        title={`Download als Word-document, in ${LOOK_LABEL[look]}`}
      >
        {busy === 'word' ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}
        Word
      </button>
      {withTable && (
        <button
          type="button"
          className={BUTTON_CLASS}
          onClick={() => void downloadExcel()}
          disabled={busy !== null}
          title="Download de tabellen als Excel-bestand"
        >
          {busy === 'excel' ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet size={12} aria-hidden="true" />
          )}
          Excel
        </button>
      )}
    </>
  );
}
