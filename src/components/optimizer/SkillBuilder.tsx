import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  FlaskConical,
  Loader2,
  MessageCircleQuestion,
  Package,
  Sparkles,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { draftSkill, sharpenSkillDescription, testSkillTrigger } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import {
  DEFAULT_SKILL_LICENTIE,
  SKILL_DESCRIPTION_MAX,
  SKILL_STRAKHEID,
  SKILL_VELDEN,
  emptySkill,
  serializeSkill,
  skillOpenPunten,
  skillSlug,
  type SkillData,
  type SkillPublicatie,
  type SkillTestVerzoek,
  type SkillVeldId,
} from '@/lib/skill';

interface SkillBuilderProps {
  settings: AiSettings;
  /** Optionele context van de pagina; vult de eerste vraag alvast. */
  context?: string;
  /** Aangeroepen met de geserialiseerde antwoorden zodra die wijzigen. */
  onSerialized: (text: string) => void;
  /** Aangeroepen met de volledige staat, voor de SKILL.md-download na het bouwen. */
  onChange: (data: SkillData) => void;
}

/**
 * Skill Creator: haalt in drie stappen op wat een vaste instructie nodig heeft.
 *
 * 1. Begin: wat de gebruiker de AI telkens uitlegt, en hoe hij erom vraagt.
 * 2. Aanvullen: de AI stelt de overige velden voor, en stelt een gerichte vraag
 *    over wat alleen de gebruiker weet (interne afspraken, bronnen).
 * 3. Triggertest: de AI bedenkt verzoeken op de grens van de beschrijving; de
 *    gebruiker corrigeert waar die verkeerd gelezen wordt, en de beschrijving
 *    wordt daarop aangescherpt.
 * 4. Delen als plugin: eigenaar, beheerder, licentie en goedkeuring, zodat
 *    publiccode.yml en het manifest geen invulplekken meer hebben. Daaronder
 *    staat wat er nog openstaat, inclusief de vragen van de AI die nog niet
 *    beantwoord zijn.
 */
export default function SkillBuilder({ settings, context, onSerialized, onChange }: SkillBuilderProps) {
  const [data, setData] = useState<SkillData>(() => {
    const base = emptySkill();
    return context?.trim() ? { ...base, kern: context.trim() } : base;
  });
  // Staan de velden van stap 2 open? Na het voorstel van de AI, of als de
  // gebruiker liever zelf invult.
  const [showRest, setShowRest] = useState(false);
  // Per veld de vraag van de AI, als die het veld niet kon afleiden.
  const [vragen, setVragen] = useState<Partial<Record<SkillVeldId, string>>>({});
  // Velden die nog precies het voorstel van de AI bevatten.
  const [voorstel, setVoorstel] = useState<Partial<Record<SkillVeldId, boolean>>>({});
  const [busy, setBusy] = useState<'draft' | 'test' | 'scherp' | null>(null);
  const [tests, setTests] = useState<SkillTestVerzoek[]>([]);
  // Licentie: de EUPL-1.2 of een eigen keuze. Bij een eigen keuze blijft het
  // veld zichtbaar, ook als het (nog) leeg is.
  const [eigenLicentie, setEigenLicentie] = useState(false);
  const [goedgekeurd, setGoedgekeurd] = useState(false);

  // De organisatie uit het profiel als eerste voorstel voor de eigenaar.
  const { profile } = useAuth();
  const { organizationById } = useReferenceData();
  const profielOrganisatie = profile?.organization_id
    ? (organizationById(profile.organization_id)?.name ?? '')
    : '';
  useEffect(() => {
    if (!profielOrganisatie) return;
    setData((d) =>
      d.publicatie.organisatie.trim()
        ? d
        : { ...d, publicatie: { ...d.publicatie, organisatie: profielOrganisatie } },
    );
  }, [profielOrganisatie]);

  function setPublicatie(patch: Partial<SkillPublicatie>) {
    setData((d) => ({ ...d, publicatie: { ...d.publicatie, ...patch } }));
  }

  // Een vraag van de AI staat nog open zolang het veld leeg is of nog precies
  // het voorstel bevat: dan heeft de gebruiker er niets mee gedaan.
  const openVragen = Object.fromEntries(
    Object.entries(vragen).filter(
      ([id]) => voorstel[id as SkillVeldId] || !data.velden[id as SkillVeldId].trim(),
    ),
  ) as Partial<Record<SkillVeldId, string>>;
  const openPunten = skillOpenPunten(data, openVragen);

  function springNaar(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  useEffect(() => {
    onSerialized(serializeSkill(data));
    onChange(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const afwijkingen = tests.filter((t) => t.hoortErbij !== t.aiDacht);

  function setVeld(id: SkillVeldId, value: string) {
    setData((d) => ({ ...d, velden: { ...d.velden, [id]: value } }));
    setVoorstel((v) => (v[id] ? { ...v, [id]: false } : v));
  }

  /** Laat de AI de overige velden voorstellen; zelf ingevulde velden blijven staan. */
  async function runDraft() {
    if (!data.kern.trim()) {
      toast.error('Beschrijf eerst wat je de AI telkens opnieuw uitlegt.');
      return;
    }
    setBusy('draft');
    try {
      const res = await draftSkill({
        kern: data.kern.trim(),
        verzoeken: data.verzoeken.trim() || undefined,
        velden: data.velden,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        toast.error(res.reason?.trim() || 'Je omschrijving is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.velden) {
        toast.error(res.error ?? 'Het voorstel kon niet worden gemaakt.');
        return;
      }
      // Alleen lege velden krijgen een voorstel of een vraag; wat de gebruiker
      // zelf schreef blijft staan.
      const nieuweVragen: Partial<Record<SkillVeldId, string>> = {};
      const nieuwVoorstel: Partial<Record<SkillVeldId, string>> = {};
      for (const { id } of SKILL_VELDEN) {
        const v = res.velden[id];
        if (!v || data.velden[id].trim()) continue;
        if (v.waarde) nieuwVoorstel[id] = v.waarde;
        // Ook naast een voorstel: de vraag gaat over wat alleen de gebruiker
        // weet, zoals de interne afspraak die het voorstel nog mist.
        if (v.vraag) nieuweVragen[id] = v.vraag;
      }
      setData((d) => {
        const velden = { ...d.velden };
        for (const [id, waarde] of Object.entries(nieuwVoorstel) as [SkillVeldId, string][]) {
          if (!d.velden[id].trim()) velden[id] = waarde;
        }
        return {
          ...d,
          velden,
          naam: d.naam.trim() ? d.naam : res.naam ?? '',
          beschrijving: d.beschrijving.trim() ? d.beschrijving : res.beschrijving ?? '',
        };
      });
      setVragen(nieuweVragen);
      setVoorstel((v) => ({
        ...v,
        ...Object.fromEntries(Object.keys(nieuwVoorstel).map((id) => [id, true])),
      }));
      setShowRest(true);
    } finally {
      setBusy(null);
    }
  }

  /** Laat de AI testverzoeken bedenken op de grens van de beschrijving. */
  async function runTest() {
    if (!data.beschrijving.trim()) {
      toast.error('Schrijf eerst een beschrijving.');
      return;
    }
    setBusy('test');
    try {
      const res = await testSkillTrigger({
        beschrijving: data.beschrijving.trim(),
        kern: data.kern.trim() || undefined,
        verzoeken: data.verzoeken.trim() || undefined,
        nietGebruiken: data.velden.niet_gebruiken.trim() || undefined,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success || !res.verzoeken?.length) {
        toast.error(res.error ?? 'De testverzoeken konden niet worden gemaakt.');
        return;
      }
      // Door elkaar: het model zet de verzoeken die erbij horen graag bovenaan,
      // en dan wordt aanvinken een kwestie van patroon in plaats van lezen.
      const geschud = res.verzoeken
        .map((v) => ({ v, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(({ v }) => v);
      setTests(geschud.map((v) => ({ tekst: v.tekst, aiDacht: v.hoortErbij, hoortErbij: v.hoortErbij })));
    } finally {
      setBusy(null);
    }
  }

  /** Herschrijf de beschrijving zodat de gecorrigeerde verzoeken goed vallen. */
  async function runSharpen() {
    setBusy('scherp');
    try {
      const res = await sharpenSkillDescription({
        beschrijving: data.beschrijving.trim(),
        kern: data.kern.trim() || undefined,
        oordelen: tests,
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (!res.success || !res.beschrijving) {
        toast.error(res.error ?? 'De beschrijving kon niet worden aangescherpt.');
        return;
      }
      setData((d) => ({ ...d, beschrijving: res.beschrijving! }));
      setTests([]);
      toast.success('Beschrijving aangescherpt. Test hem opnieuw om te zien of alles nu klopt.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
        <Wand2 size={18} className="mt-0.5 shrink-0 text-rijksblauw-500" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Een skill is één vaste instructie die je in je eigen AI-omgeving plakt, zoals een
          Mistral-agent of een projectinstructie. Daarna geef je alleen nog je invoer, en de AI pakt
          het elke keer op dezelfde manier aan. De waarde zit in wat de AI zonder skill niet weet:
          jullie afspraken, valkuilen en grenzen.
        </p>
      </div>

      {/* Stap 1: begin. */}
      <div className="space-y-3">
        <div>
          <label className="opl-label mb-0.5 block" htmlFor="sk-kern">
            1. Wat moet je de AI nu telkens opnieuw uitleggen?
          </label>
          <textarea
            id="sk-kern"
            rows={3}
            className="opl-input resize-y text-sm"
            value={data.kern}
            placeholder="Bijv. hoe wij feedback geven op conceptbrieven aan burgers: op B1-niveau, volgens onze schrijfwijzer, met per opmerking een herschreven zin"
            onChange={(e) => setData((d) => ({ ...d, kern: e.target.value }))}
          />
        </div>
        <div>
          <label className="opl-label mb-0.5 block" htmlFor="sk-verzoeken">
            2. Welke verzoeken typ je dan? Geef er drie, zoals je ze echt zou intikken.
          </label>
          <textarea
            id="sk-verzoeken"
            rows={3}
            className="opl-input resize-y text-sm"
            value={data.verzoeken}
            placeholder={'Bijv.\nkun je even naar deze brief kijken?\nis dit begrijpelijk voor een burger?\ncheck deze reactie op de bezwaarbrief'}
            onChange={(e) => setData((d) => ({ ...d, verzoeken: e.target.value }))}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Echte formuleringen helpen het meest: daaruit volgt wanneer de skill moet aanslaan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="opl-btn-primary"
            onClick={() => void runDraft()}
            disabled={busy !== null || !data.kern.trim()}
          >
            {busy === 'draft' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {showRest ? 'Lege velden opnieuw laten voorstellen' : 'Laat de AI de rest voorstellen'}
          </button>
          {!showRest && (
            <button
              type="button"
              className="text-sm font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
              onClick={() => setShowRest(true)}
            >
              Liever zelf invullen
            </button>
          )}
        </div>
      </div>

      {showRest && (
        <>
          {/* Stap 2: aanvullen. */}
          <div className="animate-fade-in space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Vul aan en pas aan wat niet klopt. Waar de AI het niet kon weten, staat een vraag bij
              het veld.
            </p>
            {SKILL_VELDEN.map((veld, i) => (
              <div key={veld.id}>
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <label className="opl-label block" htmlFor={`sk-${veld.id}`}>
                    {i + 3}. {veld.vraag}
                  </label>
                  {voorstel[veld.id] && (
                    <span className="rounded-full bg-rijksblauw-100 px-1.5 py-0.5 text-[10px] font-semibold text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200">
                      voorstel van de AI
                    </span>
                  )}
                </div>
                {vragen[veld.id] && (
                  <p className="mb-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                    <MessageCircleQuestion size={14} className="mt-0.5 shrink-0" />
                    <span>{vragen[veld.id]}</span>
                  </p>
                )}
                <textarea
                  id={`sk-${veld.id}`}
                  rows={veld.rows}
                  className="opl-input resize-y text-sm"
                  value={data.velden[veld.id]}
                  placeholder={veld.placeholder}
                  onChange={(e) => setVeld(veld.id, e.target.value)}
                />
              </div>
            ))}

            <div>
              <p className="opl-label mb-0.5">9. Moet het resultaat er elke keer precies zo uitzien?</p>
              <div className="space-y-1.5">
                {SKILL_STRAKHEID.map((s) => (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                      data.strakheid === s.value
                        ? 'border-rijksblauw-300 bg-rijksblauw-50/60 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sk-strakheid"
                      className="mt-1 h-4 w-4 shrink-0 accent-rijksoranje"
                      checked={data.strakheid === s.value}
                      onChange={() => setData((d) => ({ ...d, strakheid: s.value }))}
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
          </div>

          {/* Stap 3: naam, beschrijving en de triggertest. */}
          <div className="animate-fade-in space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">Naam en beschrijving</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                De beschrijving bepaalt wanneer de skill aanslaat. In de prompt wordt hij de afbakening;
                in SKILL.md is het het enige wat de AI leest voordat hij de skill erbij pakt.
              </p>
            </div>
            <div>
              <label className="opl-label mb-0.5 block" htmlFor="sk-naam">
                Naam
              </label>
              <input
                id="sk-naam"
                className="opl-input text-sm"
                value={data.naam}
                placeholder="Bijv. feedback burgerbrieven"
                onChange={(e) => setData((d) => ({ ...d, naam: e.target.value }))}
              />
              {data.naam.trim() && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  In SKILL.md: <span className="font-mono">{skillSlug(data.naam)}</span>
                </p>
              )}
            </div>
            <div>
              <label className="opl-label mb-0.5 block" htmlFor="sk-beschrijving">
                Beschrijving
              </label>
              <textarea
                id="sk-beschrijving"
                rows={3}
                className="opl-input resize-y text-sm"
                value={data.beschrijving}
                maxLength={SKILL_DESCRIPTION_MAX}
                placeholder="Bijv. Geeft feedback op conceptbrieven aan burgers volgens de schrijfwijzer. Gebruik deze skill wanneer iemand een brief, mail of reactie aan een burger wil laten nakijken."
                onChange={(e) => {
                  setData((d) => ({ ...d, beschrijving: e.target.value }));
                  // Oude testuitslagen horen bij de oude tekst.
                  setTests([]);
                }}
              />
              <p className="mt-1 text-right text-xs text-slate-400 dark:text-slate-500">
                {data.beschrijving.length} / {SKILL_DESCRIPTION_MAX}
              </p>
            </div>

            <button
              type="button"
              className="opl-btn-secondary"
              onClick={() => void runTest()}
              disabled={busy !== null || !data.beschrijving.trim()}
            >
              {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <FlaskConical size={16} />}
              {tests.length > 0 ? 'Test opnieuw' : 'Test wanneer de skill aanslaat'}
            </button>

            {tests.length > 0 && (
              <div className="animate-fade-in space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Zo leest de AI je beschrijving. Klopt een oordeel niet, klik dan het andere aan.
                </p>
                <ul className="space-y-1.5">
                  {tests.map((t, i) => {
                    const afwijking = t.hoortErbij !== t.aiDacht;
                    return (
                      <li
                        key={i}
                        className={`flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-center sm:justify-between ${
                          afwijking
                            ? 'border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span className="text-sm text-slate-700 dark:text-slate-200">{t.tekst}</span>
                        <span className="flex shrink-0 gap-1">
                          {[true, false].map((waarde) => (
                            <button
                              key={String(waarde)}
                              type="button"
                              onClick={() =>
                                setTests((ts) =>
                                  ts.map((x, j) => (j === i ? { ...x, hoortErbij: waarde } : x)),
                                )
                              }
                              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                                t.hoortErbij === waarde
                                  ? 'border-rijksblauw-400 bg-rijksblauw-50 font-medium text-rijksblauw-800 dark:border-rijksblauw-500/50 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-100'
                                  : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                              }`}
                            >
                              {waarde ? 'Hoort erbij' : 'Hoort er niet bij'}
                            </button>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {afwijkingen.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {afwijkingen.length === 1
                        ? 'Bij één verzoek leest de beschrijving het anders dan jij bedoelt.'
                        : `Bij ${afwijkingen.length} verzoeken leest de beschrijving het anders dan jij bedoelt.`}
                    </p>
                    <button
                      type="button"
                      className="opl-btn-primary"
                      onClick={() => void runSharpen()}
                      disabled={busy !== null}
                    >
                      {busy === 'scherp' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                      Scherp de beschrijving aan
                    </button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 pt-1 text-xs text-rijksgroen">
                    <CheckCircle2 size={14} className="shrink-0" />
                    Alle oordelen kloppen: de beschrijving dekt wat je bedoelt.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Stap 4: delen als plugin. */}
          <div className="animate-fade-in space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div>
              <p className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                <Package size={16} className="text-rijksblauw-500" /> Delen als plugin
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deze gegevens komen niet in de instructie zelf, maar in de plugin: in publiccode.yml,
                in het manifest en in de kop van SKILL.md. Daarmee kan de skill in een repository en
                bij de skills-marketplace van developer.overheid.nl worden aangemeld.
              </p>
            </div>

            <div>
              <label className="opl-label mb-0.5 block" htmlFor="sk-organisatie">
                Welke organisatie is eigenaar van de afspraken in deze skill?
              </label>
              <input
                id="sk-organisatie"
                className="opl-input text-sm"
                value={data.publicatie.organisatie}
                placeholder="Bijv. Ministerie van Binnenlandse Zaken en Koninkrijksrelaties"
                onChange={(e) => setPublicatie({ organisatie: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="opl-label mb-0.5 block" htmlFor="sk-contact">
                  Wie beheert de skill en beantwoordt vragen erover?
                </label>
                <input
                  id="sk-contact"
                  className="opl-input text-sm"
                  value={data.publicatie.contact}
                  placeholder="Bijv. team Schrijfadvies, directie Communicatie"
                  onChange={(e) => setPublicatie({ contact: e.target.value })}
                />
              </div>
              <div>
                <label className="opl-label mb-0.5 block" htmlFor="sk-email">
                  Op welk e-mailadres kunnen collega&apos;s terecht?
                </label>
                <input
                  id="sk-email"
                  type="email"
                  className="opl-input text-sm"
                  value={data.publicatie.email}
                  placeholder="Bijv. schrijfadvies@minbzk.nl"
                  onChange={(e) => setPublicatie({ email: e.target.value })}
                />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Bij voorkeur een teammailbox: het adres komt in de openbare repository.
                </p>
              </div>
            </div>

            <div>
              <label className="opl-label mb-0.5 block" htmlFor="sk-repository">
                Waar komt de repository te staan?
              </label>
              <input
                id="sk-repository"
                type="url"
                className="opl-input text-sm"
                value={data.publicatie.repository}
                placeholder="Bijv. https://github.com/minbzk/skill-schrijfadvies of een adres op code.overheid.nl"
                onChange={(e) => setPublicatie({ repository: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Weet je het nog niet, laat het dan leeg. Dan blijft dit de enige regel in
                publiccode.yml die je later invult.
              </p>
            </div>

            <div>
              <p className="opl-label mb-0.5">Onder welke licentie deel je de skill?</p>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="sk-licentie-keuze"
                    className="h-4 w-4 accent-rijksoranje"
                    checked={!eigenLicentie}
                    onChange={() => {
                      setEigenLicentie(false);
                      setPublicatie({ licentie: DEFAULT_SKILL_LICENTIE });
                    }}
                  />
                  EUPL-1.2, aanbevolen door de overheid (de tekst gaat mee)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="sk-licentie-keuze"
                    className="h-4 w-4 accent-rijksoranje"
                    checked={eigenLicentie}
                    onChange={() => {
                      setEigenLicentie(true);
                      setPublicatie({ licentie: '' });
                    }}
                  />
                  Een andere licentie
                </label>
              </div>
              {eigenLicentie && (
                <input
                  id="sk-licentie"
                  className="opl-input mt-2 text-sm"
                  value={data.publicatie.licentie}
                  placeholder="De SPDX-code, bijv. MIT of Apache-2.0"
                  onChange={(e) => setPublicatie({ licentie: e.target.value.trim() })}
                />
              )}
            </div>

            <div>
              <p className="opl-label mb-0.5">
                Heeft wie de afspraken beheert de skill al goedgekeurd?
              </p>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="sk-goedkeuring"
                    className="h-4 w-4 accent-rijksoranje"
                    checked={!goedgekeurd}
                    onChange={() => {
                      setGoedgekeurd(false);
                      setPublicatie({ goedgekeurdDoor: '' });
                    }}
                  />
                  Nee, het is een concept
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="sk-goedkeuring"
                    className="h-4 w-4 accent-rijksoranje"
                    checked={goedgekeurd}
                    onChange={() => setGoedgekeurd(true)}
                  />
                  Ja
                </label>
              </div>
              {goedgekeurd && (
                <input
                  id="sk-goedgekeurd-door"
                  className="opl-input mt-2 text-sm"
                  value={data.publicatie.goedgekeurdDoor}
                  placeholder="Door wie? Bijv. de juridische afdeling van DGOO"
                  onChange={(e) => setPublicatie({ goedgekeurdDoor: e.target.value })}
                />
              )}
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Het overheidsbrede standpunt over generatieve AI vraagt om bij een skill vast te
                leggen of hij goedgekeurd is, en door wie.
              </p>
            </div>

            {/* Wat er nog openstaat: lege velden, onbeantwoorde vragen van de AI en
                invulplekken van de plugin. Klik springt naar het veld. */}
            <div
              className={`rounded-xl border p-3 ${
                openPunten.length > 0
                  ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10'
                  : 'border-rijksgroen/30 bg-rijksgroen/5'
              }`}
            >
              {openPunten.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {openPunten.length === 1
                      ? 'Nog één punt voor een volledige skill'
                      : `Nog ${openPunten.length} punten voor een volledige skill`}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {openPunten.map((punt) => (
                      <li key={punt.veld}>
                        <button
                          type="button"
                          onClick={() => springNaar(punt.veld)}
                          className="flex items-start gap-1.5 text-left text-xs text-amber-800 hover:underline dark:text-amber-200"
                        >
                          <CircleDashed size={13} className="mt-0.5 shrink-0" />
                          {punt.tekst}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Je kunt de skill ook nu al bouwen. Wat leeg is, komt in de plugin als invulplek
                    tussen rechte haken.
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-rijksgroen">
                  <CheckCircle2 size={15} className="shrink-0" />
                  Alles is ingevuld: de skill en de plugin zijn compleet.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
