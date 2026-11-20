import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Sparkles, Trash2, Upload } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import type { WordLook } from '@/lib/wordExport';
import {
  cleanChoice,
  isSerif,
  RIJK_CHOICE,
  saveOwnStyle,
  STYLE_FONTS,
  styleFrom,
  useOwnStyle,
  type StyleChoice,
} from '@/lib/exportStyle';
import {
  MAX_TEMPLATE_BYTES,
  removePptxTemplate,
  removeWordTemplate,
  savePptxTemplate,
  saveWordTemplate,
  setWordLook,
  usePptxTemplateName,
  useWordLook,
  useWordTemplateName,
} from '@/lib/wordSettings';
import { describeExportStyle } from '@/services/optimizeService';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';
const SMALL_BUTTON =
  'opl-raak inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-rijksblauw-700 hover:bg-slate-100 dark:text-rijksblauw-200 dark:hover:bg-slate-700';

const LOOKS: { value: WordLook; label: string; hint: string }[] = [
  { value: 'rijk', label: 'Rijkshuisstijl', hint: 'Koppen in lintblauw, tabellen met een blauwe kop.' },
  { value: 'eenvoudig', label: 'Eenvoudig', hint: 'Zwart op wit, in Calibri.' },
  { value: 'eigen', label: 'Mijn eigen opmaak', hint: 'Beschrijf zelf de letter en de kleuren.' },
  { value: 'sjabloon', label: 'Mijn sjablonen', hint: 'Een Word- of PowerPoint-sjabloon, met logo en kop- en voettekst.' },
];

const COLOR_FIELDS: { key: keyof Omit<StyleChoice, 'font'>; label: string }[] = [
  { key: 'heading', label: 'Koppen' },
  { key: 'accent', label: 'Lijnen en links' },
  { key: 'tableHead', label: 'Kop van een tabel' },
  { key: 'cover', label: 'Eerste dia' },
];

/**
 * De opmaak van de downloads onder een chatantwoord: Word, PDF en PowerPoint.
 * Alles staat in deze browser, net als de sjablonen zelf: die gaan nergens heen.
 * Alleen de beschrijving van een eigen opmaak gaat naar de AI.
 */
export default function WordSettings() {
  const look = useWordLook();
  const own = useOwnStyle();
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const { hash } = useLocation();

  // Vanuit het menu Downloaden in de chat: meteen naar dit blok. Na het wisselen
  // van pagina zet RouteFocus de focus op de kop, dus even daarna.
  useEffect(() => {
    if (hash !== '#word-document') return;
    const timer = window.setTimeout(() => sectionRef.current?.scrollIntoView({ block: 'start' }), 150);
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <section ref={sectionRef} id="word-document" className={`${SECTION_CLASS} scroll-mt-24`} aria-labelledby={titleId}>
      <div className="flex items-center gap-1">
        <h2 id={titleId} className={TITLE_CLASS}>
          Opmaak van downloads
        </h2>
        <InfoDot
          label="Uitleg over de opmaak van downloads"
          text="Onder elk antwoord staat Downloaden. Word, PDF en PowerPoint krijgen de opmaak die je hier kiest. Bij een eigen opmaak beschrijf je in gewone woorden hoe het eruit moet zien; te lichte kleuren worden donkerder gemaakt, zodat tekst leesbaar blijft. In een eigen Word-sjabloon zet je {inhoud} waar de tekst moet komen, en eventueel {titel} en {datum}. Een PowerPoint-sjabloon gebruikt zijn eigen titeldia en de indeling Titel en inhoud. De bestanden worden in je browser gemaakt."
        />
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">Opmaak</legend>
        {LOOKS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-3 py-2">
            <input
              type="radio"
              name="word-vormgeving"
              value={option.value}
              checked={look === option.value}
              onChange={() => {
                if (option.value === 'eigen' && !own) saveOwnStyle({ beschrijving: '', choice: RIJK_CHOICE });
                setWordLook(option.value);
              }}
              className="mt-1 h-5 w-5 shrink-0 accent-rijksblauw-700"
            />
            <span>
              <span className="block font-medium text-slate-900 dark:text-slate-100">{option.label}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-300">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {look === 'eigen' && <OwnStyleEditor />}
      {look === 'sjabloon' && <Templates />}
    </section>
  );
}

/** Beschrijven, voorbeeld bekijken en bijstellen. Elke wijziging geldt meteen. */
function OwnStyleEditor() {
  const own = useOwnStyle();
  const choice = own?.choice ?? RIJK_CHOICE;
  const [wens, setWens] = useState(own?.beschrijving ?? '');
  const [busy, setBusy] = useState(false);
  const [uitleg, setUitleg] = useState('');
  const fieldId = useId();
  const fontId = useId();

  const update = (next: Partial<StyleChoice>) =>
    saveOwnStyle({ beschrijving: own?.beschrijving ?? wens, choice: { ...choice, ...next } });

  async function describe() {
    const text = wens.trim();
    if (!text) return;
    setBusy(true);
    setUitleg('');
    // Bestaat er al een eigen opmaak, dan verandert de AI alleen wat je noemt.
    const result = await describeExportStyle({
      wens: text,
      huidig: own?.beschrijving ? { ...choice } : undefined,
    });
    setBusy(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    const next = cleanChoice(result.opmaak);
    if (!next) {
      toast.error('De opmaak kon niet worden gemaakt. Probeer het opnieuw.');
      return;
    }
    saveOwnStyle({ beschrijving: text, choice: next });
    setUitleg(result.uitleg);
  }

  return (
    <div className="mt-2 space-y-4 sm:ml-8">
      <div>
        <label className="opl-label" htmlFor={fieldId}>
          Beschrijf de opmaak
        </label>
        <textarea
          id={fieldId}
          className="opl-input min-h-[96px] resize-y"
          value={wens}
          maxLength={2000}
          placeholder="Bijvoorbeeld: donkergroene koppen in Arial, tabellen met een lichtgrijze kop."
          onChange={(e) => setWens(e.target.value)}
          disabled={busy}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="opl-btn-primary" onClick={() => void describe()} disabled={busy || !wens.trim()}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {busy ? 'Bezig…' : own?.beschrijving ? 'Pas de opmaak aan' : 'Maak de opmaak'}
          </button>
        </div>
        {uitleg && (
          <p role="status" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            {uitleg}
          </p>
        )}
      </div>

      <StylePreview choice={choice} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="opl-label" htmlFor={fontId}>
            Letter
          </label>
          <select id={fontId} className="opl-input" value={choice.font} onChange={(e) => update({ font: e.target.value })}>
            {[...new Set([choice.font, ...STYLE_FONTS])].map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>
        {COLOR_FIELDS.map((field) => (
          <ColorField key={field.key} label={field.label} value={choice[field.key]} onChange={(hex) => update({ [field.key]: hex })} />
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const id = useId();
  return (
    <div>
      <label className="opl-label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={`#${value}`}
          onChange={(e) => onChange(e.target.value.slice(1).toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-800"
        />
        <span className="font-mono text-sm text-slate-600 dark:text-slate-300">#{value}</span>
      </div>
    </div>
  );
}

/** Een klein voorbeeld: een stukje document en de eerste dia, in de afgeleide kleuren. */
function StylePreview({ choice }: { choice: StyleChoice }) {
  const style = useMemo(() => styleFrom(choice), [choice]);
  const fontFamily = `"${choice.font}", ${isSerif(choice.font) ? 'Georgia, "Times New Roman", serif' : 'Arial, sans-serif'}`;
  return (
    <div aria-hidden="true" className="grid items-start gap-3 sm:grid-cols-[2fr_1fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-slate-800" style={{ fontFamily }}>
        <p className="text-lg font-bold" style={{ color: `#${style.heading}` }}>
          Notitie over de planning
        </p>
        <div className="mb-2 mt-1 h-0.5 w-16" style={{ background: `#${style.titleRule}` }} />
        <p className="text-sm" style={{ color: `#${style.text}` }}>
          De eerste fase start in januari. Zie ook{' '}
          <span className="underline" style={{ color: `#${style.link}` }}>
            de richtlijn
          </span>
          .
        </p>
        <div className="mt-2 overflow-hidden rounded text-xs">
          <div className="flex gap-4 px-2 py-1 font-bold" style={{ background: `#${style.tableHeadFill}`, color: `#${style.tableHeadText}` }}>
            <span className="w-16">Fase</span>
            <span>Wanneer</span>
          </div>
          <div className="flex gap-4 px-2 py-1" style={{ color: `#${style.text}` }}>
            <span className="w-16">1</span>
            <span>januari</span>
          </div>
          <div className="flex gap-4 px-2 py-1" style={{ background: style.tableBand ? `#${style.tableBand}` : undefined, color: `#${style.text}` }}>
            <span className="w-16">2</span>
            <span>maart</span>
          </div>
        </div>
      </div>
      <div
        className="flex aspect-video flex-col justify-center rounded-lg border border-slate-200 p-3"
        style={{ background: `#${style.coverFill}`, color: `#${style.coverText}`, fontFamily }}
      >
        <p className="text-sm font-bold leading-tight">Titel van de presentatie</p>
        <p className="mt-1 text-[0.6875rem]" style={{ color: `#${style.coverMuted}` }}>
          PromptPlein
        </p>
      </div>
    </div>
  );
}

const TEMPLATE_KINDS = {
  word: {
    label: 'Word-sjabloon',
    accept:
      '.docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    pattern: /\.(docx|dotx)$/i,
    wrongType: 'Kies een Word-bestand (.docx of .dotx).',
  },
  pptx: {
    label: 'PowerPoint-sjabloon',
    accept:
      '.pptx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.template',
    pattern: /\.(pptx|potx)$/i,
    wrongType: 'Kies een PowerPoint-bestand (.pptx of .potx).',
  },
} as const;

/** Twee sjablonen naast elkaar; een PDF krijgt de kleuren en de letter van het eerste. */
function Templates() {
  const wordName = useWordTemplateName();
  const pptxName = usePptxTemplateName();
  return (
    <div className="mt-2 space-y-3 sm:ml-8">
      <TemplateRow kind="word" name={wordName} />
      <TemplateRow kind="pptx" name={pptxName} />
      {(wordName || pptxName) && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          PDF krijgt de kleuren en de letter van je {wordName ? 'Word-sjabloon' : 'PowerPoint-sjabloon'}.
          {!wordName && ' Word ook.'}
          {!pptxName && ' PowerPoint ook.'}
        </p>
      )}
    </div>
  );
}

function TemplateRow({ kind, name }: { kind: keyof typeof TEMPLATE_KINDS; name: string | null | undefined }) {
  const info = TEMPLATE_KINDS[kind];
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  async function add(file: File) {
    if (!info.pattern.test(file.name)) {
      toast.error(info.wrongType);
      return;
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      toast.error('Het sjabloon is groter dan 10 MB.');
      return;
    }
    setSaving(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const problem =
        kind === 'word'
          ? await (await import('@/lib/wordExport')).checkWordTemplate(bytes)
          : await (await import('@/lib/pptxTemplate')).checkPptxTemplate(bytes);
      if (problem) {
        toast.error(problem);
        return;
      }
      await (kind === 'word' ? saveWordTemplate(file.name, bytes) : savePptxTemplate(file.name, bytes));
      setWordLook('sjabloon');
      toast.success('Sjabloon bewaard in deze browser.');
    } catch {
      toast.error('Het sjabloon kon niet worden bewaard.');
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <p className="font-medium text-slate-900 dark:text-slate-100">{info.label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {name ? (
          <>
            <span className="min-w-0 break-all text-sm text-slate-700 dark:text-slate-200">{name}</span>
            <button type="button" className={SMALL_BUTTON} onClick={() => fileRef.current?.click()} disabled={saving}>
              <Upload size={14} aria-hidden="true" /> Ander sjabloon
            </button>
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() => void (kind === 'word' ? removeWordTemplate() : removePptxTemplate())}
              disabled={saving}
              aria-label={`${info.label} verwijderen`}
            >
              <Trash2 size={14} aria-hidden="true" /> Verwijderen
            </button>
          </>
        ) : (
          <button type="button" className={SMALL_BUTTON} onClick={() => fileRef.current?.click()} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
            Sjabloon toevoegen
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={info.accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void add(file);
        }}
      />
    </div>
  );
}
