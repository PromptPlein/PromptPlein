import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, ChevronDown, FileSpreadsheet, FileText, Loader2, Presentation, Sparkles, Upload, X } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { cleanChoice, RIJK_CHOICE, type StyleChoice } from '@/lib/exportStyle';
import {
  getOpmaak,
  MAX_TEMPLATE_BYTES,
  newOpmaakId,
  saveOpmaak,
  setExportLook,
  type ExcelLook,
  type Opmaak,
} from '@/lib/exportTemplates';
import { readTemplate, templateKindOf, type TemplateKind } from '@/lib/templateAnalysis';
import { describeExportStyle } from '@/services/optimizeService';
import { StyleFields, StylePreview } from './StyleControls';

const KIND_LABEL: Record<TemplateKind, string> = { word: 'Word', pptx: 'PowerPoint', xlsx: 'Excel' };
const KIND_ICON = { word: FileText, pptx: Presentation, xlsx: FileSpreadsheet } as const;
const ACCEPT =
  '.docx,.dotx,.pptx,.potx,.xlsx,.xltx,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Source {
  kind: TemplateKind;
  name: string;
  /** Alleen Word en PowerPoint: daar bouwen de downloads echt op het bestand. */
  bytes?: Uint8Array;
  excel?: ExcelLook;
  gelezen: string[];
}

/**
 * Een eigen opmaak voor de downloads onder een chatantwoord, gemaakt in
 * Template-based Output. Uit een Word-, PowerPoint- of Excel-bestand lezen we
 * hoe het is opgemaakt; daarnaast of in plaats daarvan beschrijft de gebruiker
 * zelf wat hij wil. Alles blijft in deze browser; alleen een beschrijving gaat
 * naar de AI.
 */
export default function OpmaakMaker({
  incomingFile,
  editId,
  terugChat,
  startOpen,
}: {
  /** Een Word-, PowerPoint- of Excel-bestand dat bij het voorbeelddocument werd toegevoegd. */
  incomingFile?: File | null;
  /** Een bestaande opmaak aanpassen. */
  editId?: string | null;
  /** Het gesprek waar de gebruiker vandaan kwam; daar kan hij na het bewaren naar terug. */
  terugChat?: string | null;
  startOpen?: boolean;
}) {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const wensId = useId();
  const naamId = useId();
  const [open, setOpen] = useState(Boolean(startOpen || editId));
  const [id, setId] = useState(editId ?? newOpmaakId());
  const [naam, setNaam] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [choice, setChoice] = useState<StyleChoice>(RIJK_CHOICE);
  const [beschrijving, setBeschrijving] = useState('');
  const [wens, setWens] = useState('');
  const [uitleg, setUitleg] = useState('');
  const [reading, setReading] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [saved, setSaved] = useState(false);

  // Een bestaande opmaak laden om aan te passen.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    void getOpmaak(editId).then((o) => {
      if (!alive || !o) return;
      setId(o.id);
      setNaam(o.naam);
      setChoice(o.choice);
      setBeschrijving(o.beschrijving ?? '');
      setWens(o.beschrijving ?? '');
      setSources(
        (o.bronnen ?? []).map((b) => ({
          ...b,
          bytes: b.kind === 'word' ? o.word?.bytes : b.kind === 'pptx' ? o.pptx?.bytes : undefined,
          excel: b.kind === 'xlsx' ? o.excel : undefined,
        })),
      );
      setOpen(true);
    });
    return () => {
      alive = false;
    };
  }, [editId]);

  // Vanuit de chat: meteen in beeld.
  useEffect(() => {
    if (!startOpen) return;
    const timer = window.setTimeout(() => sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 200);
    return () => window.clearTimeout(timer);
  }, [startOpen]);

  // Het voorbeelddocument van Template-based Output: lees ook de opmaak.
  useEffect(() => {
    if (incomingFile && templateKindOf(incomingFile.name)) {
      setOpen(true);
      void addFile(incomingFile);
    }
    // addFile hangt alleen van state-setters af.
  }, [incomingFile]);

  async function addFile(file: File) {
    const kind = templateKindOf(file.name);
    if (!kind) {
      toast.error('Kies een Word-, PowerPoint- of Excel-bestand.');
      return;
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      toast.error('Het bestand is groter dan 10 MB.');
      return;
    }
    setReading(true);
    setSaved(false);
    try {
      const result = await readTemplate(file.name, new Uint8Array(await file.arrayBuffer()));
      if (result.probleem) {
        toast.error(result.probleem);
        return;
      }
      const source: Source = {
        kind,
        name: file.name,
        gelezen: result.gelezen,
        ...(kind === 'xlsx' ? { excel: result.excel } : { bytes: result.bytes }),
      };
      // Eén bestand per soort: een nieuw Word-bestand vervangt het vorige.
      setSources((prev) => [...prev.filter((s) => s.kind !== kind), source]);
      setChoice(result.choice);
      setNaam((prev) => prev || file.name.replace(/\.[^.]+$/, ''));
      toast.success(`De opmaak van "${file.name}" is gelezen.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Het bestand kon niet worden gelezen.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function describe() {
    const text = wens.trim();
    if (!text) return;
    setDescribing(true);
    setUitleg('');
    setSaved(false);
    // Staat er al een opmaak (uit een bestand of eerder beschreven), dan past de AI alleen aan wat je noemt.
    const result = await describeExportStyle({
      wens: text,
      huidig: sources.length || beschrijving ? { ...choice } : undefined,
    });
    setDescribing(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    const next = cleanChoice(result.opmaak);
    if (!next) {
      toast.error('De opmaak kon niet worden gemaakt. Probeer het opnieuw.');
      return;
    }
    setChoice(next);
    setBeschrijving(text);
    setUitleg(result.uitleg);
  }

  async function save() {
    const word = sources.find((s) => s.kind === 'word');
    const pptx = sources.find((s) => s.kind === 'pptx');
    const xlsx = sources.find((s) => s.kind === 'xlsx');
    const opmaak: Opmaak = {
      id,
      naam: naam.trim() || 'Mijn opmaak',
      choice,
      ...(beschrijving ? { beschrijving } : {}),
      ...(word?.bytes ? { word: { name: word.name, bytes: word.bytes } } : {}),
      ...(pptx?.bytes ? { pptx: { name: pptx.name, bytes: pptx.bytes } } : {}),
      ...(xlsx?.excel ? { excel: xlsx.excel } : {}),
      bronnen: sources.map(({ kind, name, gelezen }) => ({ kind, name, gelezen })),
      gemaakt: new Date().toISOString(),
    };
    try {
      await saveOpmaak(opmaak);
      setExportLook(`opmaak:${opmaak.id}`);
      setSaved(true);
      toast.success(`"${opmaak.naam}" is bewaard in deze browser.`);
    } catch {
      toast.error('De opmaak kon niet worden bewaard.');
    }
  }

  return (
    <section ref={sectionRef} aria-labelledby={titleId} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:p-5">
      <div className="flex items-center gap-1">
        <h3 id={titleId} className="font-semibold text-slate-900 dark:text-white">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 text-left"
          >
            <ChevronDown size={14} aria-hidden="true" className={open ? '' : '-rotate-90'} />
            Eigen opmaak voor downloads
          </button>
        </h3>
        <InfoDot
          label="Uitleg over een eigen opmaak"
          text="Standaard krijgen Word, PDF, PowerPoint en Excel onder een chatantwoord de Rijkshuisstijl. Hier maak je een eigen opmaak: uit een Word-, PowerPoint- of Excel-bestand lezen we de letter, de kleuren en de indeling, of je beschrijft zelf hoe het eruit moet zien. In de chat kies je hem bij Downloaden. De opmaak en de bestanden blijven in deze browser."
        />
      </div>

      {open && (
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">Uit een bestand</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Een Word-, PowerPoint- of Excel-bestand in de opmaak die je wilt.</p>
            <button type="button" className="opl-btn-secondary mt-2" onClick={() => fileRef.current?.click()} disabled={reading}>
              {reading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
              Bestand toevoegen
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void addFile(file);
              }}
            />
            {sources.length > 0 && (
              <ul className="mt-3 space-y-3">
                {sources.map((source) => {
                  const Icon = KIND_ICON[source.kind];
                  return (
                    <li key={source.kind} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex items-start gap-2">
                        <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-rijksblauw-700 dark:text-rijksblauw-200" />
                        <p className="min-w-0 flex-1 break-all text-sm font-medium text-slate-900 dark:text-white">
                          {KIND_LABEL[source.kind]}: {source.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSources((prev) => prev.filter((s) => s.kind !== source.kind))}
                          className="opl-raak shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          aria-label={`${source.name} weghalen`}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-sm text-slate-700 dark:text-slate-200">
                        {source.gelezen.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-900 dark:text-white" htmlFor={wensId}>
              {sources.length ? 'Iets anders? Beschrijf het' : 'Of beschrijf hoe het eruit moet zien'}
            </label>
            <textarea
              id={wensId}
              className="opl-input mt-1 min-h-[88px] resize-y"
              value={wens}
              maxLength={2000}
              placeholder="Bijvoorbeeld: donkergroene koppen in Georgia, tabellen met een lichtgrijze kop."
              onChange={(e) => setWens(e.target.value)}
              disabled={describing}
            />
            <button type="button" className="opl-btn-secondary mt-2" onClick={() => void describe()} disabled={describing || !wens.trim()}>
              {describing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {describing ? 'Bezig…' : 'Maak de opmaak'}
            </button>
            {uitleg && (
              <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                {uitleg}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Zo ziet het eruit</p>
            <StylePreview choice={choice} />
            {sources.some((s) => s.kind !== 'xlsx') && (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {sources.some((s) => s.kind === 'pptx') && sources.some((s) => s.kind === 'word')
                  ? 'Word en PowerPoint bouwen op je bestanden. PDF en Excel krijgen deze letter en kleuren.'
                  : sources.some((s) => s.kind === 'pptx')
                    ? 'PowerPoint bouwt op je bestand. Word, PDF en Excel krijgen deze letter en kleuren.'
                    : 'Word bouwt op je bestand. PDF, PowerPoint en Excel krijgen deze letter en kleuren.'}
              </p>
            )}
            <StyleFields
              choice={choice}
              onChange={(next) => {
                setChoice((prev) => ({ ...prev, ...next }));
                setSaved(false);
              }}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="min-w-[12rem] flex-1">
              <label className="opl-label" htmlFor={naamId}>
                Naam van de opmaak
              </label>
              <input
                id={naamId}
                className="opl-input"
                value={naam}
                maxLength={60}
                placeholder="Bijvoorbeeld: Huisstijl van ons programma"
                onChange={(e) => {
                  setNaam(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
            <button type="button" className="opl-btn-primary" onClick={() => void save()}>
              <Check size={16} aria-hidden="true" /> Bewaar opmaak
            </button>
          </div>

          {saved && (
            <div role="status" className="flex flex-wrap items-center gap-3 text-sm text-slate-800 dark:text-slate-100">
              <span>Bewaard. In de chat kies je hem bij Downloaden.</span>
              {terugChat !== undefined && (
                <button
                  type="button"
                  className="opl-btn-primary"
                  onClick={() => navigate('/chat', { state: terugChat ? { openConversation: terugChat } : null })}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Terug naar je chat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
