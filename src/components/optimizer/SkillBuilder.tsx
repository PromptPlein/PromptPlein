import { useEffect, useRef, useState } from 'react';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
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
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';

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
      notify.error('Beschrijf eerst wat je de AI telkens opnieuw uitlegt.');
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
        notify.error(res.reason?.trim() || 'Je omschrijving is nog niet duidelijk genoeg.');
        return;
      }
      if (!res.success || !res.velden) {
        notify.error(res.error ?? 'Het voorstel kon niet worden gemaakt.');
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
      notify.error('Schrijf eerst een beschrijving.');
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
        notify.error(res.error ?? 'De testverzoeken konden niet worden gemaakt.');
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
        notify.error(res.error ?? 'De beschrijving kon niet worden aangescherpt.');
        return;
      }
      setData((d) => ({ ...d, beschrijving: res.beschrijving! }));
      setTests([]);
      notify.success('Beschrijving aangescherpt. Test hem opnieuw om te zien of alles nu klopt.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <nldd-container gap="20">
      <BuilderIntro
        icon={<nldd-icon icon="sparkles" size="20"></nldd-icon>}
        title="Bouw je skill"
        text="Eén vaste instructie voor je eigen AI-omgeving. De waarde zit in wat de AI zonder skill niet weet: jullie afspraken, valkuilen en grenzen."
      />

      {/* Stap 1: begin. */}
      <nldd-container gap="12">
        <Veld
          id="sk-kern"
          label="1. Wat moet je de AI nu telkens opnieuw uitleggen?"
          multi
          rows={3}
          value={data.kern}
          onValue={(kern) => setData((d) => ({ ...d, kern }))}
          placeholder="Bijv. hoe wij feedback geven op conceptbrieven aan burgers: op B1-niveau, volgens onze schrijfwijzer, met per opmerking een herschreven zin"
        />
        <Veld
          id="sk-verzoeken"
          label="2. Welke verzoeken typ je dan? Geef er drie, zoals je ze echt zou intikken."
          info="Echte formuleringen helpen het meest: daaruit volgt wanneer de skill moet aanslaan."
          multi
          rows={3}
          value={data.verzoeken}
          onValue={(verzoeken) => setData((d) => ({ ...d, verzoeken }))}
          placeholder={'Bijv.\nkun je even naar deze brief kijken?\nis dit begrijpelijk voor een burger?\ncheck deze reactie op de bezwaarbrief'}
        />
        <nldd-container layout="wrap" gap="12" vertical-alignment="center">
          <nldd-button
            appearance="secondary"
            start-icon="sparkles"
            text={showRest ? 'Lege velden opnieuw laten voorstellen' : 'Laat de AI de rest voorstellen'}
            loading={busy === 'draft' || undefined}
            disabled={(busy !== null && busy !== 'draft') || undefined}
            onClick={() => void runDraft()}
          ></nldd-button>
          {!showRest && (
            <nldd-button appearance="neutral-transparent" text="Liever zelf invullen" onClick={() => setShowRest(true)}></nldd-button>
          )}
        </nldd-container>
      </nldd-container>

      {showRest && (
        <>
          {/* Stap 2: aanvullen. */}
          <nldd-divider></nldd-divider>
          <nldd-container gap="16">
            <nldd-text size="sm" color="secondary">
              Vul aan en pas aan wat niet klopt. Waar de AI het niet kon weten, staat een vraag bij
              het veld.
            </nldd-text>
            {SKILL_VELDEN.map((veld, i) => (
              <nldd-container key={veld.id} gap="6">
                {voorstel[veld.id] && <nldd-badge size="sm" color="accent" text="voorstel van de AI"></nldd-badge>}
                {vragen[veld.id] && (
                  <nldd-banner variant="warning" size="sm" icon="question-mark-circle" text={vragen[veld.id]}></nldd-banner>
                )}
                <Veld
                  id={`sk-${veld.id}`}
                  label={`${i + 3}. ${veld.vraag}`}
                  multi
                  rows={veld.rows}
                  value={data.velden[veld.id]}
                  onValue={(v) => setVeld(veld.id, v)}
                  placeholder={veld.placeholder}
                />
              </nldd-container>
            ))}

            <nldd-container gap="8">
              <nldd-text>
                9. Moet het resultaat er elke keer precies zo uitzien?
              </nldd-text>
              <nldd-list type="radiogroup" appearance="box-tinted" accessible-label="Moet het resultaat er elke keer precies zo uitzien?">
                {SKILL_STRAKHEID.map((s) => (
                  <RadioRow
                    key={s.value}
                    label={s.label}
                    hint={s.hint}
                    checked={data.strakheid === s.value}
                    onSelect={() => setData((d) => ({ ...d, strakheid: s.value }))}
                  />
                ))}
              </nldd-list>
            </nldd-container>
          </nldd-container>

          {/* Stap 3: naam, beschrijving en de triggertest. */}
          <nldd-divider></nldd-divider>
          <nldd-container gap="12">
            <nldd-title
              heading-level={4}
              size={6}
              text="Naam en beschrijving"
              supporting-text="De beschrijving bepaalt wanneer de skill aanslaat. In de prompt wordt hij de afbakening; in SKILL.md is het het enige wat de AI leest voordat hij de skill erbij pakt."
            ></nldd-title>
            <Veld
              id="sk-naam"
              label="Naam"
              value={data.naam}
              onValue={(naam) => setData((d) => ({ ...d, naam }))}
              placeholder="Bijv. feedback burgerbrieven"
              help={data.naam.trim() ? `In SKILL.md: ${skillSlug(data.naam)}` : undefined}
            />
            <Veld
              id="sk-beschrijving"
              label="Beschrijving"
              multi
              rows={3}
              maxlength={SKILL_DESCRIPTION_MAX}
              value={data.beschrijving}
              onValue={(beschrijving) => {
                setData((d) => ({ ...d, beschrijving }));
                // Oude testuitslagen horen bij de oude tekst.
                setTests([]);
              }}
              placeholder="Bijv. Geeft feedback op conceptbrieven aan burgers volgens de schrijfwijzer. Gebruik deze skill wanneer iemand een brief, mail of reactie aan een burger wil laten nakijken."
              help={`${data.beschrijving.length} / ${SKILL_DESCRIPTION_MAX}`}
            />

            <nldd-container horizontal-alignment="left">
              <nldd-button
                appearance="secondary"
                start-icon="erlenmeyer-flask"
                text={tests.length > 0 ? 'Test opnieuw' : 'Test wanneer de skill aanslaat'}
                loading={busy === 'test' || undefined}
                disabled={(busy !== null && busy !== 'test') || undefined}
                onClick={() => void runTest()}
              ></nldd-button>
            </nldd-container>

            {tests.length > 0 && (
              <nldd-container gap="8">
                <nldd-text size="xs" color="secondary">
                  Zo leest de AI je beschrijving. Klopt een oordeel niet, kies dan het andere.
                </nldd-text>
                <nldd-list appearance="box-tinted" accessible-label="Testverzoeken">
                  {tests.map((t, i) => (
                    <TestRow
                      key={i}
                      test={t}
                      onChange={(hoortErbij) =>
                        setTests((ts) => ts.map((x, j) => (j === i ? { ...x, hoortErbij } : x)))
                      }
                    />
                  ))}
                </nldd-list>
                {afwijkingen.length > 0 ? (
                  <nldd-container layout="wrap" gap="8" vertical-alignment="center">
                    <nldd-text size="xs" color="warning">
                      {afwijkingen.length === 1
                        ? 'Bij één verzoek leest de beschrijving het anders dan jij bedoelt.'
                        : `Bij ${afwijkingen.length} verzoeken leest de beschrijving het anders dan jij bedoelt.`}
                    </nldd-text>
                    <nldd-spacer size="flexible"></nldd-spacer>
                    <nldd-button
                      appearance="secondary"
                      start-icon="sparkles"
                      text="Scherp de beschrijving aan"
                      loading={busy === 'scherp' || undefined}
                      disabled={(busy !== null && busy !== 'scherp') || undefined}
                      onClick={() => void runSharpen()}
                    ></nldd-button>
                  </nldd-container>
                ) : (
                  <nldd-container layout="row" gap="6" vertical-alignment="center">
                    <nldd-icon icon="check-mark-circle" size="16" color="success"></nldd-icon>
                    <nldd-text size="xs" color="success">
                      Alle oordelen kloppen: de beschrijving dekt wat je bedoelt.
                    </nldd-text>
                  </nldd-container>
                )}
              </nldd-container>
            )}
          </nldd-container>

          {/* Stap 4: delen als plugin. */}
          <nldd-divider></nldd-divider>
          <nldd-container gap="16">
            <nldd-title
              heading-level={4}
              size={6}
              text="Delen als plugin"
              supporting-text="Deze gegevens komen niet in de instructie zelf, maar in de plugin: in publiccode.yml, in het manifest en in de kop van SKILL.md. Daarmee kan de skill in een repository en bij de skills-marketplace van developer.overheid.nl worden aangemeld."
            ></nldd-title>

            <Veld
              id="sk-organisatie"
              label="Welke organisatie is eigenaar van de afspraken in deze skill?"
              value={data.publicatie.organisatie}
              onValue={(organisatie) => setPublicatie({ organisatie })}
              placeholder="Bijv. Ministerie van Binnenlandse Zaken en Koninkrijksrelaties"
            />

            <nldd-container layout="grid" gap="16">
              <Veld
                id="sk-contact"
                label="Wie beheert de skill en beantwoordt vragen erover?"
                value={data.publicatie.contact}
                onValue={(contact) => setPublicatie({ contact })}
                placeholder="Bijv. team Schrijfadvies, directie Communicatie"
              />
              <Veld
                id="sk-email"
                label="Op welk e-mailadres kunnen collega's terecht?"
                type="email"
                value={data.publicatie.email}
                onValue={(email) => setPublicatie({ email })}
                placeholder="Bijv. schrijfadvies@minbzk.nl"
                help="Bij voorkeur een teammailbox: het adres komt in de openbare repository."
              />
            </nldd-container>

            <Veld
              id="sk-repository"
              label="Waar komt de repository te staan?"
              type="url"
              value={data.publicatie.repository}
              onValue={(repository) => setPublicatie({ repository })}
              placeholder="Bijv. https://github.com/minbzk/skill-schrijfadvies of een adres op code.overheid.nl"
              help="Weet je het nog niet, laat het dan leeg. Dan blijft dit de enige regel in publiccode.yml die je later invult."
            />

            <Keuze
              label="Onder welke licentie deel je de skill?"
              name="sk-licentie-keuze"
              value={eigenLicentie ? 'eigen' : 'eupl'}
              options={[
                { value: 'eupl', label: 'EUPL-1.2, aanbevolen door de overheid (de tekst gaat mee)' },
                { value: 'eigen', label: 'Een andere licentie' },
              ]}
              onValue={(v) => {
                const eigen = v === 'eigen';
                setEigenLicentie(eigen);
                setPublicatie({ licentie: eigen ? '' : DEFAULT_SKILL_LICENTIE });
              }}
            />
            {eigenLicentie && (
              <Veld
                id="sk-licentie"
                label="Licentie"
                value={data.publicatie.licentie}
                onValue={(v) => setPublicatie({ licentie: v.trim() })}
                placeholder="De SPDX-code, bijv. MIT of Apache-2.0"
              />
            )}

            <Keuze
              label="Is de skill al goedgekeurd door de beheerder van de afspraken?"
              name="sk-goedkeuring"
              value={goedgekeurd ? 'ja' : 'nee'}
              options={[
                { value: 'nee', label: 'Nee, het is een concept' },
                { value: 'ja', label: 'Ja' },
              ]}
              help="Het overheidsbrede standpunt over generatieve AI vraagt om bij een skill vast te leggen of hij goedgekeurd is, en door wie."
              onValue={(v) => {
                if (v === 'ja') setGoedgekeurd(true);
                else {
                  setGoedgekeurd(false);
                  setPublicatie({ goedgekeurdDoor: '' });
                }
              }}
            />
            {goedgekeurd && (
              <Veld
                id="sk-goedgekeurd-door"
                label="Goedgekeurd door"
                value={data.publicatie.goedgekeurdDoor}
                onValue={(goedgekeurdDoor) => setPublicatie({ goedgekeurdDoor })}
                placeholder="Door wie? Bijv. de juridische afdeling van DGOO"
              />
            )}

            {/* Wat er nog openstaat: lege velden, onbeantwoorde vragen van de AI en
                invulplekken van de plugin. Klik springt naar het veld. */}
            {openPunten.length > 0 ? (
              <nldd-banner
                variant="warning"
                text={
                  openPunten.length === 1
                    ? 'Nog één punt voor een volledige skill'
                    : `Nog ${openPunten.length} punten voor een volledige skill`
                }
                supporting-text="Je kunt de skill ook nu al bouwen. Wat leeg is, komt in de plugin als invulplek tussen rechte haken."
              >
                <nldd-container gap="2">
                  {openPunten.map((punt) => (
                    <nldd-button
                      key={punt.veld}
                      size="sm"
                      appearance="neutral-transparent"
                      horizontal-alignment="left"
                      start-icon="circle-dashed"
                      text={punt.tekst}
                      onClick={() => springNaar(punt.veld)}
                    ></nldd-button>
                  ))}
                </nldd-container>
              </nldd-banner>
            ) : (
              <nldd-banner variant="success" text="Alles is ingevuld: de skill en de plugin zijn compleet."></nldd-banner>
            )}
          </nldd-container>
        </>
      )}
    </nldd-container>
  );
}

/** A labeled text field bound to a value; `multi` makes it a multi-line field. */
function Veld({
  id,
  label,
  value,
  onValue,
  placeholder,
  multi,
  rows,
  type,
  maxlength,
  help,
  info,
}: {
  id: string;
  label: string;
  value: string;
  onValue: (value: string) => void;
  placeholder?: string;
  multi?: boolean;
  rows?: number;
  type?: 'email' | 'url';
  maxlength?: number;
  help?: string;
  /** Explanation behind the info dot beside the label. */
  info?: string;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  // nldd-form-field 0.18.0 has no place for a control beside its label, so a
  // field with an info dot draws its label itself and names the input directly.
  const header = info && (
    <nldd-container layout="row" gap="4" vertical-alignment="center">
      <nldd-text>{label}</nldd-text>
      <InfoDot label="Uitleg bij dit veld" text={info} />
    </nldd-container>
  );
  return (
    <nldd-form-field label={info ? undefined : label}>
      {header}
      {multi ? (
        <nldd-multi-line-text-field
          ref={ref}
          id={id}
          accessible-label={info ? label : undefined}
          rows={rows}
          placeholder={placeholder}
          maxlength={maxlength === undefined ? undefined : String(maxlength)}
        ></nldd-multi-line-text-field>
      ) : (
        <nldd-text-field ref={ref} id={id} type={type ?? 'text'} placeholder={placeholder}></nldd-text-field>
      )}
      {help && <nldd-form-field-help-text>{help}</nldd-form-field-help-text>}
    </nldd-form-field>
  );
}

/** A choice of a few options as radio buttons. */
function Keuze({
  label,
  name,
  value,
  options,
  onValue,
  help,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onValue: (value: string) => void;
  help?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean; value: string }>>(ref, 'change', (e) => {
    if (e.detail?.checked) onValue(e.detail.value);
  });
  return (
    <nldd-form-field label={label}>
      <nldd-radio-button-group ref={ref} name={name}>
        {options.map((o) => (
          <nldd-radio-button-field
            key={o.value}
            value={o.value}
            label={o.label}
            checked={o.value === value || undefined}
          ></nldd-radio-button-field>
        ))}
      </nldd-radio-button-group>
      {help && <nldd-form-field-help-text>{help}</nldd-form-field-help-text>}
    </nldd-form-field>
  );
}

/** One option of a radio list, with a line of explanation under it. */
function RadioRow({
  label,
  hint,
  checked,
  onSelect,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ checked: boolean }>>(ref, 'change', (e) => {
    if (e.detail?.checked) onSelect();
  });
  return (
    <nldd-list-item ref={ref} radio checked={checked || undefined}>
      <nldd-cell>
        <nldd-radio-button decorative checked={checked || undefined}></nldd-radio-button>
      </nldd-cell>
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-text-cell text={label} supporting-text={hint}></nldd-text-cell>
    </nldd-list-item>
  );
}

/** One test request with the user's verdict on whether it belongs to the skill. */
function TestRow({ test: t, onChange }: { test: SkillTestVerzoek; onChange: (hoortErbij: boolean) => void }) {
  const ref = useRef<HTMLElement>(null);
  useNlddEvent<CustomEvent<{ value: string }>>(ref, 'change', (e) => onChange(e.detail?.value === 'ja'));
  const afwijking = t.hoortErbij !== t.aiDacht;
  return (
    <nldd-list-item>
      <nldd-text-cell text={t.tekst}></nldd-text-cell>
      {afwijking && (
        <nldd-cell>
          <nldd-badge size="sm" color="warning" text="Anders dan de AI"></nldd-badge>
        </nldd-cell>
      )}
      <nldd-spacer-cell size="8"></nldd-spacer-cell>
      <nldd-cell>
        <nldd-segmented-control
          ref={ref}
          size="sm"
          width="fit-content"
          accessible-label={`Oordeel over: ${t.tekst}`}
          value={t.hoortErbij ? 'ja' : 'nee'}
        >
          <nldd-segmented-control-item value="ja" text="Hoort erbij" selected={t.hoortErbij || undefined}></nldd-segmented-control-item>
          <nldd-segmented-control-item value="nee" text="Hoort er niet bij" selected={!t.hoortErbij || undefined}></nldd-segmented-control-item>
        </nldd-segmented-control>
      </nldd-cell>
    </nldd-list-item>
  );
}
