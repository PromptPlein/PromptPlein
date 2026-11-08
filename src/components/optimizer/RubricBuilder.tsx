import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, Ruler, Sparkles, Trash2 } from '@/components/common/icons';
import { notify } from '@/lib/notify';
import { proposeRubric } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  CRITERION_WEIGHTS,
  RUBRIC_SCALES,
  criteriaZonderNiveaus,
  emptyCriterion,
  emptyRubric,
  newCriterionId,
  scaleLevels,
  serializeRubric,
  type CriterionWeight,
  type RubricData,
  type RubricScale,
} from '@/lib/rubric';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

interface RubricBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult "wat wordt beoordeeld" alvast. */
  context?: string;
  /** Aangeroepen met het geserialiseerde toetsingskader zodra dat wijzigt. */
  onSerialized: (text: string) => void;
}

/**
 * Rubric-toetsing: bouwt het toetsingskader, met de niveaubeschrijvingen als
 * hoofdzaak.
 *
 * Criteria opsommen is het makkelijke deel en levert nog geen navolgbaar
 * oordeel op: "uitvoerbaarheid: 3" is niet reproduceerbaar en niet aanvechtbaar.
 * Pas als vóór het beoordelen vastligt wanneer iets een 3 is en wanneer een 4,
 * komen twee beoordelaars op hetzelfde uit. Dit scherm maakt dat werk zichtbaar
 * (en laat de AI het voorwerk doen), in plaats van het stil over te slaan.
 */
export default function RubricBuilder({ settings, context, onSerialized }: RubricBuilderProps) {
  const [data, setData] = useState<RubricData>(() => {
    const base = emptyRubric();
    return context?.trim() ? { ...base, teBeoordelen: context.trim() } : base;
  });
  const [busy, setBusy] = useState<'criteria' | 'niveaus' | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onSerialized(serializeRubric(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const levels = scaleLevels(data.schaal);
  const gevuldeCriteria = data.criteria.filter((c) => c.naam.trim());
  const zonderNiveaus = criteriaZonderNiveaus(data);

  /** Laat de AI criteria voorstellen bij dit soort stuk. */
  async function suggestCriteria() {
    if (!data.teBeoordelen.trim()) {
      notify.error('Beschrijf eerst wat je beoordeelt.');
      return;
    }
    setBusy('criteria');
    try {
      const res = await proposeRubric({
        doel: 'criteria',
        teBeoordelen: data.teBeoordelen.trim(),
        gebruiksdoel: data.doel.trim() || undefined,
        niveaus: levels,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        notify.error(res.reason?.trim() || 'De omschrijving is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.criteria?.length) {
        notify.error(res.error ?? 'Er konden geen criteria worden voorgesteld.');
        return;
      }
      setData((d) => ({
        ...d,
        // Zelf ingevulde criteria blijven staan; het voorstel komt eronder.
        criteria: [
          ...d.criteria.filter((c) => c.naam.trim()),
          ...res.criteria!.map((c) => ({
            id: newCriterionId(),
            naam: c.naam,
            betekenis: c.betekenis,
            weging: 'normaal' as CriterionWeight,
            niveaus: c.niveaus,
          })),
        ],
      }));
    } finally {
      setBusy(null);
    }
  }

  /** Schrijf per criterium een beschrijving per schaalpunt; de kern van de rubric. */
  async function fillLevels() {
    if (gevuldeCriteria.length === 0) {
      notify.error('Voeg eerst minstens één criterium toe.');
      return;
    }
    setBusy('niveaus');
    try {
      const res = await proposeRubric({
        doel: 'niveaus',
        teBeoordelen: data.teBeoordelen.trim() || 'een beleidsstuk',
        gebruiksdoel: data.doel.trim() || undefined,
        niveaus: levels,
        criteria: gevuldeCriteria.map((c) => ({ naam: c.naam.trim(), betekenis: c.betekenis.trim() })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success || !res.criteria?.length) {
        notify.error(res.error ?? 'De niveaubeschrijvingen konden niet worden gemaakt.');
        return;
      }
      // Match op naam: de AI krijgt de criteria in dezelfde volgorde terug,
      // maar op naam matchen is bestand tegen een overgeslagen criterium.
      const byName = new Map(res.criteria.map((c) => [c.naam.trim().toLowerCase(), c.niveaus]));
      setData((d) => ({
        ...d,
        criteria: d.criteria.map((c) => {
          const voorstel = byName.get(c.naam.trim().toLowerCase());
          if (!voorstel) return c;
          // Zelf geschreven beschrijvingen blijven staan.
          const niveaus = { ...voorstel, ...Object.fromEntries(
            Object.entries(c.niveaus).filter(([, v]) => v?.trim()),
          ) };
          return { ...c, niveaus };
        }),
      }));
      setOpen(Object.fromEntries(gevuldeCriteria.map((c) => [c.id, true])));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <BuilderIntro
        icon={<Ruler size={18} />}
        title="Bouw je toetsingskader"
        text="Leg vooraf vast wanneer iets voldoet. Dan is het oordeel navolgbaar."
      />

      {/* Stap 1: wat en waarvoor. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="opl-label mb-0.5 block" htmlFor="rb-wat">
            1. Wat beoordeel je?
          </label>
          <input
            id="rb-wat"
            className="opl-input text-sm"
            value={data.teBeoordelen}
            placeholder="Bijv. vier subsidieaanvragen voor het innovatiefonds"
            onChange={(e) => setData((d) => ({ ...d, teBeoordelen: e.target.value }))}
          />
        </div>
        <div>
          <label className="opl-label mb-0.5 block" htmlFor="rb-doel">
            2. Waar dient het oordeel voor?
          </label>
          <input
            id="rb-doel"
            className="opl-input text-sm"
            value={data.doel}
            placeholder="Bijv. een toekenningsbesluit dat bezwaar moet doorstaan"
            onChange={(e) => setData((d) => ({ ...d, doel: e.target.value }))}
          />
        </div>
      </div>

      {/* Stap 3: de schaal. Verandert de schaal, dan vervallen de beschrijvingen. */}
      <div>
        <p className="opl-label mb-0.5">3. Op welke schaal scoor je?</p>
        <div className="space-y-1.5">
          {RUBRIC_SCALES.map((s) => (
            <label
              key={s.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                data.schaal === s.value
                  ? 'border-rijksblauw-300 bg-rijksblauw-50/60 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                name="rb-schaal"
                className="mt-1 h-4 w-4 shrink-0 accent-rijksoranje"
                checked={data.schaal === s.value}
                onChange={() =>
                  setData((d) => ({
                    ...d,
                    schaal: s.value as RubricScale,
                    // De beschrijvingen horen bij de oude schaalpunten en zouden
                    // na een wissel niet meer kloppen.
                    criteria: d.criteria.map((c) => ({ ...c, niveaus: {} })),
                  }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {s.label}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Stap 4: de criteria met hun niveaubeschrijvingen. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <p className="opl-label mb-0">4. Welke criteria staan in het kader?</p>
          <InfoDot label="Uitleg bij dit veld" text="Vul per criterium in wat het meet, en klap het open om per schaalpunt vast te leggen wanneer het die score krijgt." />
        </div>

        <div className="space-y-2">
          {data.criteria.map((c, i) => {
            const heeftNiveaus = Object.values(c.niveaus).some((v) => v?.trim());
            const isOpen = open[c.id] ?? false;
            return (
              <div
                key={c.id}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs font-semibold text-slate-400">{i + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      className="opl-input text-sm font-medium"
                      value={c.naam}
                      placeholder="Bijv. uitvoerbaarheid"
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          criteria: d.criteria.map((x) =>
                            x.id === c.id ? { ...x, naam: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                    <input
                      className="opl-input text-sm"
                      value={c.betekenis}
                      placeholder="Wat meet dit criterium precies? Bijv. kan de uitvoerder dit met de huidige capaciteit aan?"
                      onChange={(e) =>
                        setData((d) => ({
                          ...d,
                          criteria: d.criteria.map((x) =>
                            x.id === c.id ? { ...x, betekenis: e.target.value } : x,
                          ),
                        }))
                      }
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {CRITERION_WEIGHTS.map((w) => (
                        <button
                          key={w.value}
                          type="button"
                          title={w.hint}
                          onClick={() =>
                            setData((d) => ({
                              ...d,
                              criteria: d.criteria.map((x) =>
                                x.id === c.id ? { ...x, weging: w.value } : x,
                              ),
                            }))
                          }
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            c.weging === w.value
                              ? 'border-rijksblauw-400 bg-rijksblauw-50 font-medium text-rijksblauw-800 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>

                    {/* De niveaubeschrijvingen. */}
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}
                      className="inline-flex items-center gap-1 text-xs font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
                    >
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      Niveaubeschrijvingen
                      <span
                        className={
                          heeftNiveaus
                            ? 'rounded-full bg-rijksgroen/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-rijksgroen'
                            : 'rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        }
                      >
                        {heeftNiveaus ? 'ingevuld' : 'nog leeg'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-1.5 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/40">
                        {levels.map((level) => (
                          <div key={level} className="flex items-center gap-2">
                            <span className="w-24 shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {level}
                            </span>
                            <input
                              className="opl-input flex-1 text-sm"
                              value={c.niveaus[level] ?? ''}
                              placeholder={`Wanneer krijgt het "${level}"?`}
                              onChange={(e) =>
                                setData((d) => ({
                                  ...d,
                                  criteria: d.criteria.map((x) =>
                                    x.id === c.id
                                      ? { ...x, niveaus: { ...x.niveaus, [level]: e.target.value } }
                                      : x,
                                  ),
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Criterium verwijderen"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        criteria:
                          d.criteria.length > 1
                            ? d.criteria.filter((x) => x.id !== c.id)
                            : [emptyCriterion()],
                      }))
                    }
                    className="mt-2 shrink-0 text-slate-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
            onClick={() => setData((d) => ({ ...d, criteria: [...d.criteria, emptyCriterion()] }))}
          >
            <Plus size={14} /> Criterium toevoegen
          </button>
          <button
            type="button"
            className="opl-btn-secondary"
            onClick={() => void suggestCriteria()}
            disabled={busy !== null || !data.teBeoordelen.trim()}
          >
            {busy === 'criteria' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Stel criteria voor
          </button>
          <button
            type="button"
            className="opl-btn-primary"
            title="Laat de AI per criterium beschrijven wanneer welke score geldt"
            onClick={() => void fillLevels()}
            disabled={busy !== null || gevuldeCriteria.length === 0}
          >
            {busy === 'niveaus' ? <Loader2 size={16} className="animate-spin" /> : <Ruler size={16} />}
            Schrijf de niveaubeschrijvingen
          </button>
        </div>

        {gevuldeCriteria.length > 0 && zonderNiveaus.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              {zonderNiveaus.length === 1
                ? `"${zonderNiveaus[0].naam.trim()}" heeft nog geen niveaubeschrijving.`
                : `${zonderNiveaus.length} criteria hebben nog geen niveaubeschrijving.`}{' '}
              Zonder die beschrijving is de score een gevoel, en komen twee beoordelaars niet op
              hetzelfde uit.
            </span>
          </p>
        )}
      </div>

      {/* Stap 5: drempel en bewijsregel. */}
      <div className="space-y-3">
        <div>
          <div className="mb-0.5 flex items-center gap-1">
            <label className="opl-label mb-0" htmlFor="rb-drempel">5. Wanneer is het geheel voldoende?</label>
            <InfoDot label="Uitleg bij dit veld" text="Leg dit vóór het beoordelen vast, anders wordt het eindoordeel achteraf naar het gevoel toe gerekend." />
          </div>
          <input
            id="rb-drempel"
            className="opl-input text-sm"
            value={data.drempel}
            placeholder="Bijv. geen enkel criterium op 'voldoet niet' en minstens drie op 'voldoet'"
            onChange={(e) => setData((d) => ({ ...d, drempel: e.target.value }))}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-rijksoranje"
            checked={data.bewijsverplicht}
            onChange={(e) => setData((d) => ({ ...d, bewijsverplicht: e.target.checked }))}
          />
          <span>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Elke score onderbouwen met een letterlijke passage
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Dwingt de AI om te wijzen in plaats van te vinden. Staat er niets over in het stuk, dan
              volgt &quot;niet te beoordelen&quot; in plaats van een gok.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
