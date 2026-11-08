import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ScanLine, ShieldCheck } from '@/components/common/icons';
import { notify } from '@/lib/notify';
import { scanClaims } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  SOURCE_REGIMES,
  UNVERIFIABLE_RULES,
  emptyVerification,
  serializeVerification,
  type SourceRegime,
  type UnverifiableRule,
  type VerificationData,
} from '@/lib/verification';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

interface VerificationBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult het te controleren stuk alvast. */
  context?: string;
  /** Aangeroepen met de geserialiseerde controle-opzet zodra die wijzigt. */
  onSerialized: (text: string) => void;
}

/**
 * Chain-of-Verification: bouwt de controle-opzet, niet de controle zelf.
 *
 * De volgorde van dit scherm is de techniek: eerst het concept, dan zien wát
 * erin staat dat fout kán zijn (de scan), dan pas kiezen waartegen dat
 * gecontroleerd wordt. Wie meteen "controleer op feiten" invult, krijgt een AI
 * die zijn eigen tekst herleest en goedkeurt, precies de fout die deze techniek
 * moet afvangen.
 */
export default function VerificationBuilder({
  settings,
  context,
  onSerialized,
}: VerificationBuilderProps) {
  const [data, setData] = useState<VerificationData>(() => {
    const base = emptyVerification();
    return context?.trim() ? { ...base, teControleren: context.trim() } : base;
  });
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    onSerialized(serializeVerification(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const aangevinkt = data.claims.filter((c) => c.checked).length;
  const kanScannen = data.teControleren.trim().length >= 80;

  /** Laat de AI het concept aflopen en melden welke soorten beweringen er staan. */
  async function runScan() {
    setScanning(true);
    try {
      const res = await scanClaims({
        tekst: data.teControleren.trim(),
        soorten: data.claims.map((c) => ({ id: c.id, label: c.label })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success) {
        notify.error(res.error ?? 'De scan is niet gelukt. Vink zelf aan wat gecontroleerd moet worden.');
        return;
      }
      const gevonden = new Map((res.gevonden ?? []).map((g) => [g.id, g.voorbeeld]));
      if (gevonden.size === 0) {
        notify('Geen controleerbare beweringen herkend. Vink zelf aan wat er wél in staat.', {
          icon: 'ℹ️',
        });
      }
      setData((d) => ({
        ...d,
        gescand: true,
        // Een gevonden soort wordt aangevinkt; een zelf aangevinkte soort blijft
        // staan, ook als de scan hem niet zag. De gebruiker weet meer van het
        // dossier dan het model.
        claims: d.claims.map((c) =>
          gevonden.has(c.id)
            ? { ...c, checked: true, voorbeeld: gevonden.get(c.id) || undefined }
            : c,
        ),
        duursteFout: d.duursteFout.trim() || (res.duursteFout ?? ''),
      }));
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-5">
      <BuilderIntro
        icon={<ShieldCheck size={18} />}
        title="Laat de AI zichzelf controleren"
        text="Eerst de beweringen eruit, dan per bewering één vraag. Die vragen worden los van het concept beantwoord."
      />

      {/* Stap 1: het concept. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor="cove-tekst">1. Welke tekst moet gecontroleerd worden?</label>
          <InfoDot label="Uitleg bij dit veld" text="Plak het concept hier. Heb je het nog niet, beschrijf dan om wat voor stuk het gaat; de prompt krijgt dan een plaatshouder waar je het later inplakt." />
        </div>
        <textarea
          id="cove-tekst"
          className="opl-input min-h-[120px] resize-y text-sm"
          value={data.teControleren}
          placeholder="Bijv. de conceptbrief aan de Tweede Kamer over de wijziging van de subsidieregeling…"
          onChange={(e) => setData((d) => ({ ...d, teControleren: e.target.value }))}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="opl-btn-secondary"
            onClick={() => void runScan()}
            disabled={scanning || !kanScannen}
            title={
              kanScannen
                ? 'Laat de AI aflopen welke soorten controleerbare beweringen erin staan'
                : 'Plak eerst een stuk tekst (minimaal een alinea)'
            }
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
            {scanning ? 'Scannen…' : 'Scan op controleerbare beweringen'}
          </button>
          {!kanScannen && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Plak minstens een alinea om te kunnen scannen.
            </span>
          )}
        </div>
      </div>

      {/* Stap 2: welke soorten beweringen meetellen. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <p className="opl-label mb-0">2. Wat moet er gecontroleerd worden?</p>
          <InfoDot
            label="Uitleg bij dit veld"
            text={
              data.gescand
                ? 'De AI heeft aangevinkt wat hij in je tekst tegenkwam. Vink bij of af; jij kent het dossier.'
                : 'Vink aan welke soorten beweringen in dit stuk fout kunnen gaan. Zonder deze lijst controleert de AI wat hem toevallig opvalt.'
            }
          />
        </div>
        <div className="space-y-1.5">
          {data.claims.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                c.checked
                  ? 'border-rijksblauw-300 bg-rijksblauw-50/60 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-rijksoranje"
                checked={c.checked}
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    claims: d.claims.map((x) =>
                      x.id === c.id ? { ...x, checked: e.target.checked } : x,
                    ),
                  }))
                }
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {c.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{c.hint}</span>
                {c.voorbeeld && (
                  <span className="mt-1 block truncate rounded bg-white/70 px-1.5 py-0.5 font-mono text-[0.6875rem] text-rijksblauw-700 dark:bg-slate-900/60 dark:text-rijksblauw-200">
                    gezien: {c.voorbeeld}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        {aangevinkt === 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={13} /> Zonder aangevinkte soorten wordt de controle een algemene
            leesbeurt.
          </p>
        )}
      </div>

      {/* Stap 3: de bronafbakening: waartegen mag "klopt" gemeten worden? */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <p className="opl-label mb-0">3. Waartegen mag geverifieerd worden?</p>
          <InfoDot label="Uitleg bij dit veld" text={"Dit is de scherpste knop. Zonder afbakening betekent \"klopt\" alleen dat het model het herkent, en dat is precies de fout die je zocht."} />
        </div>
        <div className="space-y-1.5">
          {SOURCE_REGIMES.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                data.regime === r.value
                  ? 'border-rijksblauw-300 bg-rijksblauw-50/60 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                name="cove-regime"
                className="mt-1 h-4 w-4 shrink-0 accent-rijksoranje"
                checked={data.regime === r.value}
                onChange={() => setData((d) => ({ ...d, regime: r.value as SourceRegime }))}
              />
              <span>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {r.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <input
          className="opl-input mt-2 text-sm"
          value={data.bronnen}
          placeholder="Noem de bronnen concreet, bijv. de vier bijlagen en de nota van 3 juli"
          onChange={(e) => setData((d) => ({ ...d, bronnen: e.target.value }))}
        />
      </div>

      {/* Stap 4: wat er met onverifieerbare beweringen gebeurt. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <p className="opl-label mb-0">4. En als iets niet te verifiëren blijkt?</p>
          <InfoDot label="Uitleg bij dit veld" text={"Wat je hier kiest geldt in de tekst. Onverifieerbare beweringen komen daarnaast altijd op de lijst \"nog te verifiëren door een mens\"."} />
        </div>
        <div className="flex flex-wrap gap-2">
          {UNVERIFIABLE_RULES.map((r) => (
            <button
              key={r.value}
              type="button"
              title={r.hint}
              onClick={() => setData((d) => ({ ...d, onverifieerbaar: r.value as UnverifiableRule }))}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                data.onverifieerbaar === r.value
                  ? 'border-rijksblauw-400 bg-rijksblauw-50 font-medium text-rijksblauw-800 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          {UNVERIFIABLE_RULES.find((r) => r.value === data.onverifieerbaar)?.hint}
        </p>
      </div>

      {/* Stap 5: prioriteit. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor="cove-risico">5. Welke fout is hier het duurst? <span className="font-normal">(optioneel)</span></label>
          <InfoDot label="Uitleg bij dit veld" text="Bepaalt welke beweringen als eerste worden nagetrokken." />
        </div>
        <input
          id="cove-risico"
          className="opl-input text-sm"
          value={data.duursteFout}
          placeholder="Bijv. een toezegging die de bewindspersoon nooit heeft gedaan"
          onChange={(e) => setData((d) => ({ ...d, duursteFout: e.target.value }))}
        />
      </div>
    </div>
  );
}
