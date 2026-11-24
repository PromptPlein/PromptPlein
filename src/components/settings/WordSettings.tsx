import { useEffect, useId, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from '@/components/common/icons';
import InfoDot from '@/components/common/InfoDot';
import { removeOpmaak, setExportLook, useExportLook, useOpmaken, type ExportLook } from '@/lib/exportTemplates';

const SECTION_CLASS = 'opl-card p-5 sm:p-6';
const TITLE_CLASS = 'text-lg font-semibold text-rijksblauw-700 dark:text-rijksblauw-200';
const SMALL_BUTTON =
  'opl-raak inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-rijksblauw-700 hover:bg-slate-100 dark:text-rijksblauw-200 dark:hover:bg-slate-700';

/**
 * De opmaak van de downloads onder een chatantwoord. Standaard de Rijkshuisstijl;
 * een eigen opmaak maak je in Template-based Output, hier kies en beheer je ze.
 * Alles staat in deze browser.
 */
export default function WordSettings() {
  const look = useExportLook();
  const opmaken = useOpmaken();
  const navigate = useNavigate();
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

  const choices: { value: ExportLook; label: string; hint: string; id?: string }[] = [
    { value: 'rijk', label: 'Rijkshuisstijl', hint: 'De standaard. Koppen in lintblauw, tabellen met een blauwe kop.' },
    { value: 'eenvoudig', label: 'Eenvoudig', hint: 'Zwart op wit, in Calibri.' },
    ...(opmaken ?? []).map((o) => ({
      value: `opmaak:${o.id}` as ExportLook,
      label: o.naam,
      id: o.id,
      hint:
        [
          o.word && 'Word-sjabloon',
          o.pptx && 'PowerPoint-sjabloon',
          o.excel && 'Excel-opmaak',
        ]
          .filter(Boolean)
          .join(', ') || (o.beschrijving ? 'Beschreven' : 'Eigen letter en kleuren'),
    })),
  ];

  async function remove(id: string, naam: string) {
    try {
      await removeOpmaak(id);
      toast.success(`"${naam}" is verwijderd.`);
    } catch {
      toast.error('De opmaak kon niet worden verwijderd.');
    }
  }

  return (
    <section ref={sectionRef} id="word-document" className={`${SECTION_CLASS} scroll-mt-24`} aria-labelledby={titleId}>
      <div className="flex items-center gap-1">
        <h2 id={titleId} className={TITLE_CLASS}>
          Opmaak van downloads
        </h2>
        <InfoDot
          label="Uitleg over de opmaak van downloads"
          text="Onder elk antwoord staat Downloaden. Word, PDF, PowerPoint en Excel krijgen de opmaak die je hier kiest. Een eigen opmaak maak je in Template-based Output: uit een Word-, PowerPoint- of Excel-bestand, of door te beschrijven hoe het eruit moet zien. De opmaken en bestanden blijven in deze browser."
        />
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">Opmaak</legend>
        {choices.map((option) => (
          <div key={option.value} className="flex flex-wrap items-start gap-x-3 py-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="word-vormgeving"
                value={option.value}
                checked={look === option.value}
                onChange={() => setExportLook(option.value)}
                className="mt-1 h-5 w-5 shrink-0 accent-rijksblauw-700"
              />
              <span className="min-w-0">
                <span className="block break-words font-medium text-slate-900 dark:text-slate-100">{option.label}</span>
                <span className="block text-sm text-slate-600 dark:text-slate-300">{option.hint}</span>
              </span>
            </label>
            {option.id && (
              <div className="ml-8 flex gap-1 sm:ml-0">
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => navigate('/genereren', { state: { opmaak: option.id } })}
                  aria-label={`${option.label} aanpassen`}
                >
                  <Pencil size={14} aria-hidden="true" /> Aanpassen
                </button>
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => void remove(option.id!, option.label)}
                  aria-label={`${option.label} verwijderen`}
                >
                  <Trash2 size={14} aria-hidden="true" /> Verwijderen
                </button>
              </div>
            )}
          </div>
        ))}
      </fieldset>

      <button
        type="button"
        className="opl-btn-secondary mt-2"
        onClick={() => navigate('/genereren', { state: { opmaak: 'nieuw' } })}
      >
        <Plus size={16} aria-hidden="true" /> Nieuwe opmaak maken
      </button>
    </section>
  );
}
