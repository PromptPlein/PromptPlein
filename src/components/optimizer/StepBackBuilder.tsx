import { useEffect, useState } from 'react';
import { ArrowUpNarrowWide, Loader2, Lock, Plus, Trash2, Unlock } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { proposeLadder } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  LADDER_LEVELS,
  emptyStepBack,
  serializeStepBack,
  type Constraint,
  type StepBackData,
} from '@/lib/stepback';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

interface StepBackBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult de concrete vraag alvast. */
  context?: string;
  /** Aangeroepen met de geserialiseerde step-back-opzet zodra die wijzigt. */
  onSerialized: (text: string) => void;
}

let constraintCounter = 0;
function newConstraint(text: string, status: Constraint['status']): Constraint {
  constraintCounter += 1;
  return { id: `c-${constraintCounter}`, text, status };
}

/**
 * Step-Back: laat de gebruiker de HOOGTE kiezen waarop wordt uitgezoomd, en
 * daarna scheiden wat vaststaat van wat alleen is aangenomen.
 *
 * Die twee keuzes zijn het verschil tussen een bruikbare stap terug en een
 * essay. Ze horen bij de gebruiker: alleen die weet of het besluit over de
 * meldplicht al in een regeerakkoord staat of alleen in een oude memo, en dat
 * bepaalt of de AI eromheen moet werken of eraan mag tornen.
 */
export default function StepBackBuilder({ settings, context, onSerialized }: StepBackBuilderProps) {
  const [data, setData] = useState<StepBackData>(() => {
    const base = emptyStepBack();
    return context?.trim() ? { ...base, concreteVraag: context.trim() } : base;
  });
  const [busy, setBusy] = useState(false);
  const [eigenVraag, setEigenVraag] = useState('');

  useEffect(() => {
    onSerialized(serializeStepBack(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  /** Laat de AI drie treden voorstellen en de randvoorwaarden splitsen. */
  async function runLadder() {
    if (!data.concreteVraag.trim()) {
      toast.error('Beschrijf eerst welke vraag of opdracht voorligt.');
      return;
    }
    setBusy(true);
    try {
      const res = await proposeLadder({
        concreteVraag: data.concreteVraag.trim(),
        opTafel: data.opTafel.trim() || undefined,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        toast.error(res.reason?.trim() || 'De opdracht is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.ladder?.length) {
        toast.error(res.error ?? 'De stap-terug-vragen konden niet worden gemaakt.');
        return;
      }
      setData((d) => ({
        ...d,
        ladder: res.ladder!,
        // Bestaande, handmatig gezette randvoorwaarden blijven staan; het
        // voorstel komt eronder. De gebruiker heeft het laatste woord over wat
        // vaststaat; dat is geen modelbesluit.
        randvoorwaarden: [
          ...d.randvoorwaarden,
          ...(res.vast ?? []).map((t) => newConstraint(t, 'vast')),
          ...(res.aanname ?? []).map((t) => newConstraint(t, 'aanname')),
        ],
      }));
    } finally {
      setBusy(false);
    }
  }

  function setStatus(id: string, status: Constraint['status']) {
    setData((d) => ({
      ...d,
      randvoorwaarden: d.randvoorwaarden.map((c) => (c.id === id ? { ...c, status } : c)),
    }));
  }

  function removeConstraint(id: string) {
    setData((d) => ({ ...d, randvoorwaarden: d.randvoorwaarden.filter((c) => c.id !== id) }));
  }

  return (
    <div className="space-y-5">
      <BuilderIntro
        icon={<ArrowUpNarrowWide size={18} />}
        title="Zet een stap terug"
        text="Eerst naar het vraagstuk achter je opdracht, dan terug naar je vraag. Jij bepaalt hoe ver terug."
      />

      {/* Stap 1: de opdracht zoals hij binnenkwam. */}
      <div>
        <label className="opl-label mb-0.5 block" htmlFor="sb-vraag">
          1. Welke vraag of opdracht ligt voor?
        </label>
        <textarea
          id="sb-vraag"
          className="opl-input min-h-[70px] resize-y text-sm"
          value={data.concreteVraag}
          placeholder="Bijv. werk een meldplicht uit voor verhuurders van kamers"
          onChange={(e) => setData((d) => ({ ...d, concreteVraag: e.target.value }))}
        />
      </div>

      {/* Stap 2: de oplossing die er al ligt. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor="sb-tafel">2. Welke oplossing of richting ligt er al op tafel?</label>
          <InfoDot label="Uitleg bij dit veld" text="Juist dit maakt de stap terug zinvol: wat er al besloten lijkt, is vaak nooit besloten." />
        </div>
        <textarea
          id="sb-tafel"
          className="opl-input min-h-[60px] resize-y text-sm"
          value={data.opTafel}
          placeholder="Bijv. het wordt een meldplicht met een boete bij niet-melden"
          onChange={(e) => setData((d) => ({ ...d, opTafel: e.target.value }))}
        />
        <button
          type="button"
          className="opl-btn-secondary mt-2"
          onClick={() => void runLadder()}
          disabled={busy || !data.concreteVraag.trim()}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpNarrowWide size={16} />}
          {busy ? 'Vragen opstellen…' : data.ladder.length > 0 ? 'Opnieuw voorstellen' : 'Stel stap-terug-vragen voor'}
        </button>
      </div>

      {/* Stap 3: de ladder. Dit is het mechanisme van de techniek. */}
      {data.ladder.length > 0 && (
        <div>
          <div className="mb-0.5 flex items-center gap-1">
            <p className="opl-label mb-0">3. Hoe ver zet je de stap terug?</p>
            <InfoDot label="Uitleg bij dit veld" text="Eén trede omhoog levert een bruikbaar antwoord op. Drie treden omhoog levert een essay op. Kies de hoogte waarop het antwoord nog over jouw dossier gaat." />
          </div>
          <div className="space-y-2">
            {data.ladder.map((rung) => {
              const meta = LADDER_LEVELS.find((l) => l.niveau === rung.niveau);
              const gekozen = data.gekozenVraag === rung.vraag;
              return (
                <button
                  key={`${rung.niveau}-${rung.vraag}`}
                  type="button"
                  onClick={() =>
                    setData((d) => ({ ...d, gekozenVraag: rung.vraag, gekozenNiveau: rung.niveau }))
                  }
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    gekozen
                      ? 'border-rijksoranje bg-rijksoranje/5 dark:border-rijksoranje/60 dark:bg-rijksoranje/10'
                      : 'border-slate-200 hover:border-rijksblauw-300 dark:border-slate-700 dark:hover:border-rijksblauw-500/40'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rijksblauw-500 text-[11px] font-bold text-white">
                      {rung.niveau}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-rijksblauw-600 dark:text-rijksblauw-300">
                      {meta?.label ?? `Niveau ${rung.niveau}`}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-sm font-medium text-slate-800 dark:text-slate-100">
                    {rung.vraag}
                  </span>
                  {rung.winst && (
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      {rung.winst}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Zelf formuleren mag altijd: de ladder is een voorstel, geen keuzemenu. */}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <label className="opl-label mb-0.5 block" htmlFor="sb-eigen">
                Of schrijf je eigen stap-terug-vraag
              </label>
              <input
                id="sb-eigen"
                className="opl-input text-sm"
                value={eigenVraag}
                placeholder="Bijv. hoe krijgen we verhuurders zover dat ze zich aan de regels houden?"
                onChange={(e) => setEigenVraag(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="opl-btn-secondary"
              disabled={!eigenVraag.trim()}
              onClick={() =>
                setData((d) => ({ ...d, gekozenVraag: eigenVraag.trim(), gekozenNiveau: 0 }))
              }
            >
              Gebruik deze
            </button>
          </div>
          {data.gekozenVraag && data.gekozenNiveau === 0 && (
            <p className="mt-1.5 text-xs text-rijksblauw-600 dark:text-rijksblauw-300">
              Gekozen: {data.gekozenVraag}
            </p>
          )}
        </div>
      )}

      {/* Stap 4: vast vs. aanname. Zonder dit onderscheid wordt uitzoomen
          ongehoorzaam of tandeloos. */}
      {data.randvoorwaarden.length > 0 && (
        <div>
          <div className="mb-0.5 flex items-center gap-1">
            <p className="opl-label mb-0">4. Wat staat vast, en wat is alleen aangenomen?</p>
            <InfoDot label="Uitleg bij dit veld" text="Vaststaand = ergens besloten; daar tornt de AI niet aan. Aanname = nooit besloten, alleen overgenomen; daar gaat de stap terug juist over. Klik om te wisselen." />
          </div>
          <div className="space-y-1.5">
            {data.randvoorwaarden.map((c) => (
              <div
                key={c.id}
                className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                  c.status === 'vast'
                    ? 'border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40'
                    : 'border-rijksoranje/40 bg-rijksoranje/5 dark:border-rijksoranje/40 dark:bg-rijksoranje/10'
                }`}
              >
                <button
                  type="button"
                  title={
                    c.status === 'vast'
                      ? 'Staat vast; klik om als aanname te markeren'
                      : 'Aanname; klik om als vaststaand te markeren'
                  }
                  onClick={() => setStatus(c.id, c.status === 'vast' ? 'aanname' : 'vast')}
                  className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    c.status === 'vast'
                      ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      : 'bg-rijksoranje/20 text-rijksoranje-dark dark:text-rijksoranje'
                  }`}
                >
                  {c.status === 'vast' ? <Lock size={11} /> : <Unlock size={11} />}
                  {c.status === 'vast' ? 'Staat vast' : 'Aanname'}
                </button>
                {/* Altijd een invoerveld, ook bij een door de AI voorgestelde
                    regel: de formulering van "wat vaststaat" moet exact kloppen,
                    en een leeg veld dat na één letter in tekst verandert zou de
                    focus verliezen. */}
                <input
                  className="opl-input min-w-0 flex-1 text-sm"
                  value={c.text}
                  placeholder="Bijv. de invoering moet binnen deze kabinetsperiode"
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      randvoorwaarden: d.randvoorwaarden.map((x) =>
                        x.id === c.id ? { ...x, text: e.target.value } : x,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  title="Verwijderen"
                  onClick={() => removeConstraint(c.id)}
                  className="mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
            onClick={() =>
              setData((d) => ({
                ...d,
                randvoorwaarden: [...d.randvoorwaarden, newConstraint('', 'vast')],
              }))
            }
          >
            <Plus size={14} /> Zelf toevoegen
          </button>
        </div>
      )}

      {/* Stap 5: kaders op het algemenere niveau. */}
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor="sb-kaders">{data.ladder.length > 0 ? '5.' : '3.'} Welke kaders gelden hier hoe dan ook?{' '} <span className="font-normal">(optioneel)</span></label>
          <InfoDot label="Uitleg bij dit veld" text="Deze gelden ook op het algemenere niveau; ze houden het antwoord binnen de werkelijkheid." />
        </div>
        <input
          id="sb-kaders"
          className="opl-input text-sm"
          value={data.kaders}
          placeholder="Bijv. uitvoerbaarheid bij gemeenten, regeldruk, bestaande wetgeving"
          onChange={(e) => setData((d) => ({ ...d, kaders: e.target.value }))}
        />
      </div>
    </div>
  );
}
