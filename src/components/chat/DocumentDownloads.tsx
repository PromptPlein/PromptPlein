import { useCallback, useId, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { ChevronDown, Download, FileCode, FileSpreadsheet, FileText, FileType, Loader2, Plus, Presentation, Sheet } from '@/components/common/icons';
import { downloadBinary } from '@/lib/download';
import { buildExcelWorkbook, excelLookFrom, hasTable, XLSX_MIME } from '@/lib/excelExport';
import { recommendFormat, TABLE_FORMATS, type ExportFormat } from '@/lib/exportRequest';
import useDismiss from '@/lib/useDismiss';
import { EENVOUDIG_STYLE, RIJK_STYLE, styleFrom, type ExportStyle } from '@/lib/exportStyle';
import {
  getOpmaak,
  setExportLook,
  useExportLook,
  useOpmaken,
  type ExcelLook,
  type ExportLook,
  type Opmaak,
} from '@/lib/exportTemplates';
import { trackEvent } from '@/services/analyticsService';
import type { ChatSource } from '@/types';

const BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-rijksblauw-700 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-200';

/** De naam van een opmaak in een zin: "in Rijkshuisstijl", "in Mijn huisstijl". */
function lookLabel(look: ExportLook, opmaken: Opmaak[] | undefined): string {
  if (look === 'rijk') return 'Rijkshuisstijl';
  if (look === 'eenvoudig') return 'eenvoudige opmaak';
  return opmaken?.find((o) => `opmaak:${o.id}` === look)?.naam ?? 'Rijkshuisstijl';
}

/** De keuzes: eerst de standaard, dan de eigen opmaken. */
function lookChoices(opmaken: Opmaak[] | undefined): { value: ExportLook; label: string }[] {
  return [
    { value: 'rijk', label: 'Rijkshuisstijl' },
    { value: 'eenvoudig', label: 'Eenvoudig' },
    ...(opmaken ?? []).map((o) => ({ value: `opmaak:${o.id}` as ExportLook, label: o.naam })),
  ];
}

interface Resolved {
  style: ExportStyle;
  excel: ExcelLook;
  word: Uint8Array | null;
  pptx: Uint8Array | null;
}

/**
 * De opmaak voor deze download. Een eigen opmaak gebruikt zijn Word- of
 * PowerPoint-sjabloon als dat er is; elk ander formaat krijgt de letter en de
 * kleuren van die opmaak, en Excel de tabelkop uit een Excel-sjabloon.
 */
async function resolveLook(look: ExportLook): Promise<Resolved> {
  if (look === 'eenvoudig') return { style: EENVOUDIG_STYLE, excel: excelLookFrom(EENVOUDIG_STYLE), word: null, pptx: null };
  if (look.startsWith('opmaak:')) {
    const opmaak = await getOpmaak(look.slice('opmaak:'.length));
    if (opmaak) {
      const style = styleFrom(opmaak.choice);
      return {
        style,
        excel: opmaak.excel ?? excelLookFrom(style),
        word: opmaak.word?.bytes ?? null,
        pptx: opmaak.pptx?.bytes ?? null,
      };
    }
    toast('Je eigen opmaak is niet gevonden. Het bestand heeft de Rijkshuisstijl.');
  }
  return { style: RIJK_STYLE, excel: excelLookFrom(RIJK_STYLE), word: null, pptx: null };
}

/** Een link naar Template-based Output, waar je een eigen opmaak maakt. */
function MakeOpmaakButton({ onMake, className }: { onMake?: () => void; className?: string }) {
  if (!onMake) return null;
  return (
    <button
      type="button"
      onClick={onMake}
      className={clsx(
        'opl-raak inline-flex items-center gap-1 text-xs font-medium text-rijksblauw-700 underline hover:no-underline dark:text-rijksblauw-200',
        className,
      )}
    >
      <Plus size={12} aria-hidden="true" /> Nieuwe opmaak maken
    </button>
  );
}

/** De opmaak, meteen in het menu te kiezen; standaard de Rijkshuisstijl. */
function LookChoice({ look, onMakeOpmaak }: { look: ExportLook; onMakeOpmaak?: () => void }) {
  const opmaken = useOpmaken();
  const name = useId();
  return (
    <fieldset className="mt-1 border-t border-slate-200 px-2.5 pb-1 pt-2 dark:border-slate-700">
      <legend className="sr-only">Opmaak van Word, PDF, PowerPoint en Excel</legend>
      <p aria-hidden="true" className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Opmaak
      </p>
      {lookChoices(opmaken).map((choice) => (
        <label key={choice.value} className="flex cursor-pointer items-center gap-2 py-1 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={look === choice.value}
            onChange={() => setExportLook(choice.value)}
            className="h-4 w-4 shrink-0 accent-rijksblauw-700"
          />
          <span className="min-w-0 truncate">{choice.label}</span>
        </label>
      ))}
      <MakeOpmaakButton onMake={onMakeOpmaak} className="mt-1" />
    </fieldset>
  );
}

/**
 * Maakt een bestand van een chatantwoord, in de browser: de AI levert de inhoud,
 * de opmaak komt uit de gekozen opmaak. Excel en CSV kunnen alleen als het
 * antwoord een tabel heeft. Elk formaat laadt zijn eigen code pas bij de eerste
 * download.
 */
function useDocumentExport(text: string, sources?: ChatSource[]) {
  const look = useExportLook();
  const opmaken = useOpmaken();
  const withTable = useMemo(() => hasTable(text), [text]);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  async function build(format: ExportFormat): Promise<{ data: Uint8Array; fileName: string; mime: string } | null> {
    const input = { markdown: text, sources };
    const resolved = format === 'csv' || format === 'md' ? null : await resolveLook(look);
    const style = resolved?.style ?? RIJK_STYLE;
    switch (format) {
      case 'word': {
        const { buildWordDocument, DOCX_MIME } = await import('@/lib/wordExport');
        const result = await buildWordDocument(input, style, resolved?.word);
        void trackEvent({ event_type: 'export_word', metadata: { vormgeving: look.startsWith('opmaak:') ? 'eigen' : look } });
        return { ...result, mime: DOCX_MIME };
      }
      case 'excel': {
        const result = await buildExcelWorkbook(text, resolved?.excel);
        if (result) void trackEvent({ event_type: 'export_excel' });
        return result && { ...result, mime: XLSX_MIME };
      }
      case 'pdf':
        return (await import('@/lib/pdfExport')).buildPdf(input, style);
      case 'pptx':
        return (await import('@/lib/pptxExport')).buildPptx(input, style, resolved?.pptx);
      case 'csv':
        return (await import('@/lib/textExport')).buildCsv(text);
      case 'md':
        return (await import('@/lib/textExport')).buildMarkdown(input);
    }
  }

  async function download(format: ExportFormat) {
    setBusy(format);
    try {
      const result = await build(format);
      if (!result) return;
      downloadBinary(result.fileName, result.data, result.mime);
      if (format !== 'word' && format !== 'excel') {
        void trackEvent({ event_type: 'export_file', metadata: { formaat: format } });
      }
    } catch (error) {
      toast.error(
        error instanceof Error && error.message && (format === 'word' || format === 'pptx')
          ? error.message
          : `Het ${FORMATS[format].noun} is niet gelukt.`,
      );
    } finally {
      setBusy(null);
    }
  }

  return { look, label: lookLabel(look, opmaken), withTable, busy, download };
}

const FORMATS: Record<ExportFormat, { file: string; noun: string; icon: typeof FileText }> = {
  word: { file: 'Word-document', noun: 'Word-bestand', icon: FileText },
  pdf: { file: 'PDF', noun: 'PDF-bestand', icon: FileType },
  pptx: { file: 'PowerPoint', noun: 'PowerPoint-bestand', icon: Presentation },
  excel: { file: 'Excel-bestand', noun: 'Excel-bestand', icon: FileSpreadsheet },
  csv: { file: 'CSV-bestand', noun: 'CSV-bestand', icon: Sheet },
  md: { file: 'Markdown', noun: 'Markdown-bestand', icon: FileCode },
};

/** Wat er in het menu onder elk formaat staat. */
function formatHint(format: ExportFormat, label: string): string {
  const plain = label;
  switch (format) {
    case 'word':
      return `tekst met opmaak, in ${label}`;
    case 'pdf':
      return `om te versturen of te printen, in ${plain}`;
    case 'pptx':
      return `een dia per kopje, in ${plain}`;
    case 'excel':
      return `de tabellen, om mee te rekenen, in ${plain}`;
    case 'csv':
      return 'de tabellen, voor een ander programma';
    case 'md':
      return 'platte tekst met opmaaktekens';
  }
}

/** De volgorde in het menu: eerst de documenten, dan de tabellen, dan tekst. */
const MENU_ORDER: ExportFormat[] = ['word', 'pdf', 'pptx', 'excel', 'csv', 'md'];

function FormatIcon({ format, busy }: { format: ExportFormat; busy: boolean }) {
  const Icon = FORMATS[format].icon;
  return busy ? (
    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
  ) : (
    <Icon size={12} aria-hidden="true" />
  );
}

/**
 * Eén knop Downloaden onder een antwoord, met de formaten in een menu. Zo blijft
 * de rij kort, ook als er later meer formaten bij komen.
 */
export default function DocumentDownloads({
  text,
  sources,
  onMakeOpmaak,
}: {
  text: string;
  sources?: ChatSource[];
  /** Naar Template-based Output om een eigen opmaak te maken. */
  onMakeOpmaak?: () => void;
}) {
  const { look, label, withTable, busy, download } = useDocumentExport(text, sources);
  const [open, setOpen] = useState(false);
  // Omhoog openen, tenzij de knop bovenin het gesprek staat: dan valt het menu
  // buiten de lijst.
  const [up, setUp] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDismiss(open, ref, useCallback(() => setOpen(false), []));

  const options = MENU_ORDER.filter((f) => withTable || !TABLE_FORMATS.includes(f)).map((format) => ({
    format,
    hint: formatHint(format, label),
  }));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => {
          const box = ref.current;
          const list = box?.closest('[data-chat-lijst]');
          if (box && list) setUp(box.getBoundingClientRect().top - list.getBoundingClientRect().top > 160);
          setOpen((v) => !v);
        }}
        disabled={busy !== null}
        aria-expanded={open}
        aria-controls={menuId}
        title="Download dit antwoord als bestand"
      >
        {busy ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Download size={12} aria-hidden="true" />}
        Downloaden
        <ChevronDown size={10} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          className={clsx(
            'z-30 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800',
            'max-sm:fixed max-sm:inset-x-4 max-sm:bottom-[calc(var(--onderbalk)+6rem)] sm:absolute sm:left-0 sm:w-72',
            up ? 'sm:bottom-full sm:mb-1' : 'sm:top-full sm:mt-1',
          )}
        >
        <ul aria-label="Download als">
          {options.map(({ format, hint }) => (
            <li key={format}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={() => {
                  setOpen(false);
                  void download(format);
                }}
              >
                <span className="mt-1 shrink-0">
                  <FormatIcon format={format} busy={false} />
                </span>
                <span>
                  <span className="block font-medium">{FORMATS[format].file}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <LookChoice look={look} onMakeOpmaak={onMakeOpmaak} />
        </div>
      )}
    </div>
  );
}

/**
 * Voorstel onder het laatste antwoord als dat er uitziet als iets om te bewaren:
 * een brief of stuk met kopjes wordt Word, een tabel wordt Excel.
 */
export function ExportSuggestion({
  text,
  sources,
  format,
}: {
  text: string;
  sources?: ChatSource[];
  format: ExportFormat;
}) {
  const { withTable, busy, download } = useDocumentExport(text, sources);
  if (TABLE_FORMATS.includes(format) && !withTable) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-rijksblauw-200 px-2 py-0.5 text-xs font-medium text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 disabled:opacity-60 dark:border-rijksblauw-500/40 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/15"
      onClick={() => void download(format)}
      disabled={busy !== null}
      title={`Download dit antwoord als ${FORMATS[format].file}`}
    >
      <FormatIcon format={format} busy={busy === format} />
      Als {FORMATS[format].file}
    </button>
  );
}

/**
 * Het antwoord op "maak hier een Word-document van": een kaart met het bestand.
 * Zonder formaat kiest de gebruiker, met het formaat dat bij het antwoord past
 * voorop. Vraagt iemand Excel bij een antwoord zonder tabel, dan biedt de kaart
 * aan om het eerst in een tabel te zetten.
 */
export function ExportCard({
  target,
  format,
  onMakeTable,
  onMakeOpmaak,
}: {
  /** Het antwoord waar het bestand van wordt gemaakt; weg = verwijderd. */
  target?: { content: string; sources?: ChatSource[] };
  format?: ExportFormat;
  onMakeTable?: () => void;
  /** Naar Template-based Output om een eigen opmaak te maken. */
  onMakeOpmaak?: () => void;
}) {
  const text = target?.content ?? '';
  const { look, label, withTable, busy, download } = useDocumentExport(text, target?.sources);
  const recommended = useMemo(() => recommendFormat(text), [text]);

  if (!target) {
    return <ExportFrame title="Bestand">Het antwoord waar dit bestand van zou komen, staat niet meer in dit gesprek.</ExportFrame>;
  }

  const button = (f: ExportFormat, primary: boolean) => (
    <button
      key={f}
      type="button"
      onClick={() => void download(f)}
      disabled={busy !== null}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
        primary
          ? 'bg-rijksblauw-600 text-white hover:bg-rijksblauw-700'
          : 'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700',
      )}
    >
      <FormatIcon format={f} busy={busy === f} />
      Download {FORMATS[f].file}
    </button>
  );

  // Excel of CSV gevraagd, maar er staat geen tabel in het antwoord.
  if (format && TABLE_FORMATS.includes(format) && !withTable) {
    return (
      <ExportFrame title={FORMATS[format].file}>
        <p>
          In dit antwoord staat geen tabel, en {format === 'csv' ? 'een CSV-bestand neemt' : 'Excel neemt'} alleen
          tabellen over. Zal ik het eerst in een tabel zetten?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onMakeTable && (
            <button
              type="button"
              onClick={onMakeTable}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rijksblauw-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rijksblauw-700"
            >
              <FileSpreadsheet size={14} aria-hidden="true" /> Zet het in een tabel
            </button>
          )}
          {button('word', false)}
        </div>
      </ExportFrame>
    );
  }

  if (format) {
    return (
      <ExportFrame title={FORMATS[format].file}>
        <p>{READY[format](label)}</p>
        {STYLED.includes(format) && <LookQuestion look={look} onMakeOpmaak={onMakeOpmaak} />}
        <div className="mt-3 flex flex-wrap gap-2">{button(format, true)}</div>
      </ExportFrame>
    );
  }

  // Geen formaat genoemd: zonder tabel kan alleen Word, met tabel kiest de gebruiker.
  if (!withTable) {
    return (
      <ExportFrame title="Word-document">
        <p>Dit antwoord is tekst met opmaak, dus het wordt een Word-document.</p>
        <LookQuestion look={look} onMakeOpmaak={onMakeOpmaak} />
        <div className="mt-3 flex flex-wrap gap-2">{button('word', true)}</div>
        <OtherFormats exclude={['word']} withTable={withTable} busy={busy} onPick={(f) => void download(f)} />
      </ExportFrame>
    );
  }
  const order: ExportFormat[] = recommended === 'excel' ? ['excel', 'word'] : ['word', 'excel'];
  return (
    <ExportFrame title="Word of Excel?">
      <p>
        {recommended === 'excel'
          ? 'Dit antwoord is vooral een tabel. In Excel kun je er meteen mee rekenen en filteren. Liever de tekst met opmaak? Kies dan Word.'
          : 'Dit antwoord is vooral tekst met opmaak, dus Word ligt voor de hand. Wil je alleen de tabel, om mee te rekenen? Kies dan Excel.'}
      </p>
      <LookQuestion look={look} onMakeOpmaak={onMakeOpmaak} />
      <div className="mt-3 flex flex-wrap gap-2">{order.map((f, i) => button(f, i === 0))}</div>
      <OtherFormats exclude={order} withTable={withTable} busy={busy} onPick={(f) => void download(f)} />
    </ExportFrame>
  );
}

/** Formaten met een opmaak; CSV en Markdown zijn kale tekst. */
const STYLED: ExportFormat[] = ['word', 'pdf', 'pptx', 'excel'];

/**
 * De vraag in de exportkaart: in welke opmaak? Standaard de Rijkshuisstijl; een
 * eigen opmaak die je eerder maakte staat erbij, en een nieuwe maak je in
 * Template-based Output.
 */
function LookQuestion({ look, onMakeOpmaak }: { look: ExportLook; onMakeOpmaak?: () => void }) {
  const opmaken = useOpmaken();
  const name = useId();
  return (
    <fieldset className="mt-3">
      <legend className="text-sm font-medium text-slate-900 dark:text-white">In welke opmaak?</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {lookChoices(opmaken).map((choice) => (
          <label
            key={choice.value}
            className={clsx(
              'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
              look === choice.value
                ? 'border-rijksblauw-600 bg-rijksblauw-50 text-rijksblauw-800 dark:border-rijksblauw-300 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700',
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={look === choice.value}
              onChange={() => setExportLook(choice.value)}
              className="h-4 w-4 shrink-0 accent-rijksblauw-700"
            />
            {choice.label}
            {choice.value === 'rijk' && <span className="text-xs text-slate-500 dark:text-slate-400">standaard</span>}
          </label>
        ))}
      </div>
      <MakeOpmaakButton onMake={onMakeOpmaak} className="mt-2" />
    </fieldset>
  );
}

const READY: Record<ExportFormat, (label: string) => string> = {
  word: () => 'Je Word-document staat klaar.',
  pdf: () => 'Je PDF staat klaar.',
  pptx: () => 'Je presentatie staat klaar: een titeldia en een dia per kopje.',
  excel: () => 'Je Excel-bestand staat klaar. Elke tabel krijgt een eigen tabblad.',
  csv: () => 'Je CSV-bestand staat klaar, met een puntkomma tussen de kolommen. Meer tabellen gaan samen in een zip.',
  md: () => 'Je Markdown-bestand staat klaar, met de tekst zoals de AI hem schreef.',
};

/** De overige formaten, klein onder de keuze, voor wie iets anders wil. */
function OtherFormats({
  exclude,
  withTable,
  busy,
  onPick,
}: {
  exclude: ExportFormat[];
  withTable: boolean;
  busy: ExportFormat | null;
  onPick: (format: ExportFormat) => void;
}) {
  const rest = MENU_ORDER.filter((f) => !exclude.includes(f) && (withTable || !TABLE_FORMATS.includes(f)));
  if (!rest.length) return null;
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
      <span className="mr-1">Of als</span>
      {rest.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onPick(f)}
          disabled={busy !== null}
          className="opl-raak inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-rijksblauw-700 hover:bg-slate-100 disabled:opacity-60 dark:text-rijksblauw-200 dark:hover:bg-slate-700"
        >
          <FormatIcon format={f} busy={busy === f} />
          {FORMATS[f].file}
        </button>
      ))}
    </p>
  );
}

function ExportFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
        <Download size={14} aria-hidden="true" /> {title}
      </p>
      {children}
    </div>
  );
}
