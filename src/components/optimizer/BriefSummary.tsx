import { useState } from 'react';
import { Check, ChevronDown, ClipboardCopy, Download, ListChecks, Sparkles } from '@/components/common/icons';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { stripMarkdown, copyToClipboard } from '@/lib/utils';

/**
 * Herkent de kopjes waarmee de opdrachtbeschrijving is opgebouwd (DOEL:,
 * CONTEXT:, AANPAK: …). Hoofdletters, spaties en losse tekens, gevolgd door een
 * dubbele punt aan het begin van een regel.
 */
const HEADING = /^([A-Z][A-Z\s&/-]{2,}):\s*(.*)$/;

/** Bestandsnaam voor de download; zonder tekens die een besturingssysteem dwarszitten. */
function fileNameFor(goal: string): string {
  const base = goal.trim().split(/\s+/).slice(0, 6).join('-').replace(/[^\p{L}\p{N}-]/gu, '');
  return `opdrachtbeschrijving-${base || 'gesprek'}.txt`.toLowerCase();
}

/**
 * De oogst van de vragenronde: wat de AI uit het gesprek heeft opgetekend. De
 * framework-keuze en de velden komen hieruit.
 *
 * Waarom zichtbaar: tot nu toe verdween deze beschrijving rechtstreeks in de
 * volgende stap. Wie acht vragen heeft beantwoord wil eerst zien wat daar uit
 * kwam — en kunnen vaststellen dat er niets is weggevallen of verzonnen. Klopt
 * er iets niet, dan is dít het moment om het gesprek te hervatten, niet nadat de
 * prompt al gebouwd is.
 *
 * Bewaren gaat bewust naar het klembord of een tekstbestand: de beschrijving is
 * geen prompt, dus in de promptbibliotheek zou hij niet thuishoren.
 */
export default function BriefSummary({
  brief,
  goal,
  technique,
  why,
}: {
  brief: string;
  goal: string;
  /** De techniek die uit het gesprek volgt; hier pas bekend, niet bij de vragen. */
  technique?: string;
  /** Eén zin waarom die techniek past, gekoppeld aan wat de gebruiker vertelde. */
  why?: string;
}) {
  // Dicht: de ingevulde velden gaan voor. Wie wil nalezen, klapt hem open.
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // De regels TECHNIEK: en WAAROM DEZE TECHNIEK: tonen we apart bovenaan; hier
  // zouden ze dubbel staan.
  const lines = brief
    .trim()
    .split('\n')
    .filter((l) => !/^\s*(TECHNIEK|WAAROM DEZE TECHNIEK):/i.test(l));

  async function copy() {
    try {
      await copyToClipboard(brief.trim());
      setCopied(true);
      toast.success('Samenvatting gekopieerd.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Kopiëren mislukt.');
    }
  }

  function download() {
    // Blob + tijdelijke link: hiermee blijft het bestand op het apparaat van de
    // gebruiker; er gaat niets naar de server.
    const blob = new Blob([brief.trim()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameFor(goal);
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Samenvatting opgeslagen.');
  }

  return (
    <div className="animate-fade-in rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <ListChecks size={18} className="shrink-0 text-rijksblauw-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Dit hebben we uit het gesprek gehaald
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hieruit heeft de AI je velden ingevuld.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void copy()}
            title="Kopieer de samenvatting"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-white hover:text-rijksblauw-600 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-rijksblauw-300"
          >
            {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
            {copied ? 'Gekopieerd' : 'Kopieer'}
          </button>
          <button
            type="button"
            onClick={download}
            title="Bewaar de samenvatting als tekstbestand op je apparaat"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rijksblauw-600 transition-colors hover:bg-white dark:text-rijksblauw-300 dark:hover:bg-slate-700"
          >
            <Download size={13} /> Opslaan
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={open ? 'Inklappen' : 'Uitklappen'}
            className="inline-flex items-center rounded-md p-1 text-slate-500 transition-colors hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-1.5 border-t border-rijksblauw-200/70 px-4 py-3 dark:border-rijksblauw-500/20">
          {/* De techniek die uit het gesprek volgt, met de reden erbij. Staat
              bovenaan omdat het de conclusie van het gesprek is: hierop rust de
              rest van de opbouw. */}
          {technique && (
            <div className="mb-2 flex items-start gap-2 rounded-lg bg-white/70 px-3 py-2 dark:bg-slate-800/60">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-rijksblauw-500" />
              <div className="min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-100">
                  Techniek: <strong className="font-bold">{stripMarkdown(technique)}</strong>
                </p>
                {why && (
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {stripMarkdown(why)}
                  </p>
                )}
              </div>
            </div>
          )}
          {lines.map((line, i) => {
            const heading = HEADING.exec(line.trim());
            if (heading) {
              return (
                <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {heading[1].trim()}:
                  </span>{' '}
                  {stripMarkdown(heading[2])}
                </p>
              );
            }
            if (!line.trim()) return null;
            return (
              <p key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {stripMarkdown(line)}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
