import { useRef, useState } from 'react';
import { Check, FileUp, Loader2, Sparkles } from '@/components/common/icons';
import { notify } from '@/lib/notify';

/**
 * Upload-zone voor een voorbeelddocument (Template-based Output). Extraheert de
 * tekst client-side (txt/md/pdf/docx), waarna de aanroeper (via `onPrefill`) de
 * AI het document laat doorlezen en de velden laat voor-invullen. Gedeeld door de
 * plan-bouwer en de losse techniek-keuze.
 *
 * Heeft de gebruiker geen voorbeeld, dan omschrijft hij via `onDescribe` wat voor
 * document en format hij nodig heeft en stelt de AI zelf een passende structuur
 * voor. De velden worden dus nooit ongevraagd ingevuld: de gebruiker kiest eerst.
 */
export default function DocumentUpload({
  onPrefill,
  onDescribe,
  disabled,
}: {
  /** Ontvangt de geëxtraheerde tekst; geeft true terug als de velden gevuld zijn. */
  onPrefill: (text: string) => Promise<boolean>;
  /** Ontvangt de omschrijving van het gewenste document; true als de velden gevuld zijn. */
  onDescribe: (brief: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefDone, setBriefDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setDoneName(null);
    try {
      const { extractDocument } = await import('@/lib/extractDocument');
      const doc = await extractDocument(file);
      notify.success(`"${doc.name}" ingelezen (${doc.chars.toLocaleString('nl-NL')} tekens).`);
      const ok = await onPrefill(doc.text);
      if (ok) setDoneName(doc.name);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Document inlezen mislukt.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDescribe() {
    const text = brief.trim();
    if (!text) return;
    setBriefBusy(true);
    setBriefDone(false);
    try {
      const ok = await onDescribe(text);
      if (ok) setBriefDone(true);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Voorstellen van een structuur mislukt.');
    } finally {
      setBriefBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-rijksblauw-300 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileUp size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Voorbeelddocument uploaden (optioneel)
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              De AI leest het document volledig door, analyseert de opbouw (format, rubrieken, regels)
              en vult de velden hieronder automatisch voor. Ondersteunt .txt, .md, .pdf en .docx.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="opl-btn-secondary shrink-0"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Inlezen…
            </>
          ) : (
            <>
              <FileUp size={16} /> Kies bestand
            </>
          )}
        </button>
      </div>
      {doneName && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check size={13} /> Velden voor-ingevuld op basis van &quot;{doneName}&quot;. Controleer en
          pas aan waar nodig.
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {/* Geen voorbeeld? Omschrijf het gewenste document; de AI stelt dan zelf
          een passende structuur voor. */}
      <div className="mt-3 border-t border-rijksblauw-200/70 pt-3 dark:border-rijksblauw-500/30">
        {!briefOpen ? (
          <button
            type="button"
            className="text-sm font-medium text-rijksblauw-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-rijksblauw-200"
            onClick={() => setBriefOpen(true)}
            disabled={busy || disabled}
          >
            Ik heb geen voorbeelddocument, help me aan een structuur
          </button>
        ) : (
          <div>
            <label
              className="opl-label mb-1 block"
              htmlFor="doc-brief"
            >
              Wat voor document moet het worden, en in welk format?
            </label>
            <textarea
              id="doc-brief"
              className="opl-input min-h-[64px] resize-y text-sm"
              value={brief}
              placeholder="Bijv. een projectplan van maximaal 2 A4 met genummerde hoofdstukken, voor een directieteam"
              onChange={(e) => setBrief(e.target.value)}
              disabled={briefBusy || disabled}
            />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              De AI stelt een structuur voor op basis van gangbare conventies binnen de overheid. Dat
              is een voorstel uit eigen kennis, geen bestaand sjabloon; loop het dus even na.
            </p>
            <button
              type="button"
              className="opl-btn-secondary mt-2"
              onClick={() => void handleDescribe()}
              disabled={briefBusy || disabled || !brief.trim()}
            >
              {briefBusy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Structuur voorstellen…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Stel een structuur voor
                </>
              )}
            </button>
            {briefDone && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check size={13} /> Structuur voorgesteld en in de velden gezet. Controleer en pas aan
                waar nodig.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
