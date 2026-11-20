import { useId, useMemo } from 'react';
import { isSerif, STYLE_FONTS, styleFrom, type StyleChoice } from '@/lib/exportStyle';

const COLOR_FIELDS: { key: keyof Omit<StyleChoice, 'font'>; label: string }[] = [
  { key: 'heading', label: 'Koppen' },
  { key: 'accent', label: 'Lijnen en links' },
  { key: 'tableHead', label: 'Kop van een tabel' },
  { key: 'cover', label: 'Eerste dia' },
];

/** Letter en vier kleuren, elk zelf bij te stellen. */
export function StyleFields({ choice, onChange }: { choice: StyleChoice; onChange: (next: Partial<StyleChoice>) => void }) {
  const fontId = useId();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="opl-label" htmlFor={fontId}>
          Letter
        </label>
        <select id={fontId} className="opl-input" value={choice.font} onChange={(e) => onChange({ font: e.target.value })}>
          {[...new Set([choice.font, ...STYLE_FONTS])].map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </div>
      {COLOR_FIELDS.map((field) => (
        <ColorField key={field.key} label={field.label} value={choice[field.key]} onChange={(hex) => onChange({ [field.key]: hex })} />
      ))}
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
export function StylePreview({ choice }: { choice: StyleChoice }) {
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
