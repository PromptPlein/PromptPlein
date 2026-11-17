import { useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Trash2, Upload } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import type { WordLook } from '@/lib/wordExport';
import {
  MAX_TEMPLATE_BYTES,
  removeWordTemplate,
  saveWordTemplate,
  setWordLook,
  useWordLook,
  useWordTemplateName,
} from '@/lib/wordSettings';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';
const SMALL_BUTTON =
  'opl-raak inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-rijksblauw-700 hover:bg-slate-100 dark:text-rijksblauw-200 dark:hover:bg-slate-700';

const LOOKS: { value: WordLook; label: string; hint: string }[] = [
  { value: 'rijk', label: 'Rijkshuisstijl', hint: 'Koppen in lintblauw, tabellen met een blauwe kop.' },
  { value: 'eenvoudig', label: 'Eenvoudig', hint: 'Zwart op wit, in Calibri.' },
  { value: 'sjabloon', label: 'Mijn eigen Word-sjabloon', hint: 'Met de kop- en voettekst, het logo en de stijlen van je sjabloon.' },
];

/**
 * De vormgeving van de Word-knop onder een chatantwoord. Staat in deze browser,
 * net als het sjabloon zelf: dat gaat nergens heen.
 */
export default function WordSettings() {
  const look = useWordLook();
  const templateName = useWordTemplateName();
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  async function addTemplate(file: File) {
    if (!/\.(docx|dotx)$/i.test(file.name)) {
      toast.error('Kies een Word-bestand (.docx of .dotx).');
      return;
    }
    if (file.size > MAX_TEMPLATE_BYTES) {
      toast.error('Het sjabloon is groter dan 10 MB.');
      return;
    }
    setSaving(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { checkWordTemplate } = await import('@/lib/wordExport');
      const problem = await checkWordTemplate(bytes);
      if (problem) {
        toast.error(problem);
        return;
      }
      await saveWordTemplate(file.name, bytes);
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
    <section className={SECTION_CLASS} aria-labelledby={titleId}>
      <div className="flex items-center gap-1">
        <h2 id={titleId} className={TITLE_CLASS}>
          Word-document
        </h2>
        <InfoDot
          label="Uitleg over het Word-document"
          text="Onder elk antwoord staat Word. Je krijgt het antwoord als Word-document in de vormgeving die je hier kiest. Zet in je eigen sjabloon {inhoud} waar de tekst moet komen, en eventueel {titel} en {datum}. Zonder {inhoud} vervangt de tekst de inhoud van het sjabloon en blijven kop- en voettekst staan. Het document wordt in je browser gemaakt."
        />
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">Vormgeving</legend>
        {LOOKS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-3 py-2">
            <input
              type="radio"
              name="word-vormgeving"
              value={option.value}
              checked={look === option.value}
              onChange={() => {
                setWordLook(option.value);
                if (option.value === 'sjabloon' && templateName === null) fileRef.current?.click();
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

      {look === 'sjabloon' && (
        <div className="ml-8 mt-1 flex flex-wrap items-center gap-2">
          {templateName ? (
            <>
              <span className="min-w-0 break-all text-sm text-slate-700 dark:text-slate-200">{templateName}</span>
              <button type="button" className={SMALL_BUTTON} onClick={() => fileRef.current?.click()} disabled={saving}>
                <Upload size={14} aria-hidden="true" /> Ander sjabloon
              </button>
              <button
                type="button"
                className={SMALL_BUTTON}
                onClick={() => void removeWordTemplate()}
                disabled={saving}
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
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.wordprocessingml.template"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addTemplate(file);
        }}
      />
    </section>
  );
}
