import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { requestOrganization } from '@/services/organizationRequestService';
import {
  childrenOf,
  descendantsInOrder,
  listMinistries,
  looksLikeAbbreviation,
  ministryOf,
  orgChain,
  orgDisplayName,
  ORG_PATH_SEPARATOR,
} from '@/lib/orgTree';
import SearchableSelect from '@/components/common/SearchableSelect';
import { compact, significantWords } from '@/lib/zoekMatch';
import InfoDot from '@/components/common/InfoDot';
import { Plus } from '@/components/common/icons';
import type { Organization, OrganizationRequest } from '@/types';

interface Layer {
  name: string;
  code: string;
}

const EMPTY_LAYER: Layer = { name: '', code: '' };

const tidy = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Een laag uit een zoekterm: "ODI" is een afkorting, al het andere een naam. */
function layerFromTerm(term: string): Layer {
  const t = tidy(term);
  return looksLikeAbbreviation(t) ? { name: '', code: t } : { name: t, code: '' };
}

/** Wat er aan een ingevulde laag nog mist; null als hij klaar is of nog leeg. */
function layerProblem(layer: Layer): string | null {
  const name = tidy(layer.name);
  const code = tidy(layer.code);
  if (!name && !code) return null;
  if (!name) return 'Schrijf de naam voluit.';
  if (name.length < 2) return 'Een naam heeft minstens twee tekens.';
  if (code && code.toLowerCase() === name.toLowerCase()) {
    return 'Schrijf de naam voluit; de afkorting staat er al naast.';
  }
  if (!code && looksLikeAbbreviation(name)) {
    return `“${name}” lijkt een afkorting. Zet die bij Afkorting en schrijf de naam voluit.`;
  }
  return null;
}

const isDepartment = (o: Organization) => o.organization_type === 'department';

/**
 * Een aanvraag die nog niet is ingediend: bij het registreren is er geen sessie,
 * dus gaat hij mee met het account en dient de database hem in zodra het
 * e-mailadres is bevestigd (0063). `ready` is false zolang er iets mist.
 */
export interface OrgRequestDraft {
  parentId: string;
  names: string[];
  codes: string[];
  ready: boolean;
}

/**
 * Het ministerie, en dan je afdeling in één zoeklijst. Bij elke afdeling staat de
 * directie of dienst erboven, zodat je ook daarop zoekt en ziet waar hij onder
 * valt. De waarde is de afdeling, of het ministerie zolang er geen gekozen is.
 *
 * Met `allowCreate` vraagt een ingelogde gebruiker een ontbrekende afdeling aan.
 * Eerst kiest hij de directie of dienst; staat die er ook niet bij, dan vraagt hij
 * die mee aan. Een beheerder keurt het goed en pas dan staat het in de lijst.
 *
 * Met `onDraftRequest` (bij het registreren) wordt er niets verstuurd: de
 * ingevulde aanvraag gaat naar de ouder, die hem met het account meestuurt.
 */
export default function OrgPicker({
  value,
  onChange,
  idPrefix,
  allowCreate = false,
  onRequested,
  onDraftRequest,
  disabled = false,
}: {
  value: string | null;
  onChange: (orgId: string | null) => void;
  idPrefix: string;
  allowCreate?: boolean;
  /** Na het indienen van een aanvraag, bijvoorbeeld om hem op het profiel te tonen. */
  onRequested?: (request: OrganizationRequest) => void;
  /** Bij het registreren: de aanvraag niet versturen maar doorgeven, of null zonder aanvraag. */
  onDraftRequest?: (draft: OrgRequestDraft | null) => void;
  disabled?: boolean;
}) {
  const deferred = !!onDraftRequest;
  const canRequest = allowCreate || deferred;
  const { organizations, loading } = useReferenceData();
  const [adding, setAdding] = useState(false);
  /** De bestaande directie of dienst waar de nieuwe afdeling onder komt. */
  const [directieId, setDirectieId] = useState<string | null>(null);
  /** Staat de directie of dienst er ook niet bij, dan wordt hij mee aangevraagd. */
  const [newDirectie, setNewDirectie] = useState(false);
  const [directie, setDirectie] = useState<Layer>(EMPTY_LAYER);
  const [afdeling, setAfdeling] = useState<Layer>(EMPTY_LAYER);
  const [sending, setSending] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const ministry = value ? ministryOf(value, organizations) : null;
  const ministryId = ministry?.id ?? null;
  const ministryShort = ministry ? ministry.code || ministry.name : '';

  const ministryOptions = useMemo(
    () =>
      listMinistries(organizations).map((o) => ({ id: o.id, label: orgDisplayName(o) })),
    [organizations],
  );

  // Alles onder het ministerie; afdelingen en wat erboven hangt worden apart getoond.
  const under = useMemo(
    () => (ministryId ? descendantsInOrder(ministryId, organizations).map((d) => d.org) : []),
    [ministryId, organizations],
  );
  const directies = useMemo(() => under.filter((o) => !isDepartment(o)), [under]);

  /** De lagen tussen het ministerie en een organisatie, voluit met afkorting. */
  const between = (o: Organization) =>
    orgChain(o.id, organizations).slice(1, -1).map(orgDisplayName).join(ORG_PATH_SEPARATOR);

  // Bij elke keuze de naam met afkorting en de lagen erboven: daar zoek je ook op.
  // Zonder ministerie staan alle afdelingen erin, met het ministerie in de hint:
  // wie zijn afdeling kent, hoeft niet eerst te weten onder welk ministerie die valt.
  const afdelingOptions = useMemo(() => {
    const pool = ministryId ? under : organizations;
    // Een directie of dienst zonder afdelingen is zelf de onderste laag: zonder hem
    // in de lijst werd SSC-ICT opnieuw aangevraagd als afdeling.
    const hasChildren = new Set(organizations.map((o) => o.parent_id).filter(Boolean));
    const lowest = (o: Organization) =>
      isDepartment(o) ||
      (o.organization_type !== 'ministry' && o.organization_type !== 'government' && !hasChildren.has(o.id));
    // Een profiel dat op een directie staat, blijft zichtbaar gekozen.
    return pool
      .filter((o) => lowest(o) || (ministryId !== null && o.id === value))
      .map((o) => {
        const above = between(o);
        const top = ministryId ? ministryShort : orgChain(o.id, organizations)[0];
        const topShort = typeof top === 'string' ? top : top ? top.code || top.name : '';
        const path = ministryId ? above : [topShort, above].filter(Boolean).join(ORG_PATH_SEPARATOR);
        // De afkorting staat in de naam, dus je vindt hem ook daarop.
        return {
          id: o.id,
          label: orgDisplayName(o),
          hint: ministryId && !above ? `direct onder ${ministryShort}` : `onder ${path}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [under, value, ministryId, ministryShort, organizations]);

  const directieOptions = useMemo(
    () =>
      directies.map((o) => {
        const above = between(o);
        return {
          id: o.id,
          label: orgDisplayName(o),
          hint: above ? `onder ${above}` : undefined,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [directies, organizations],
  );

  // De aanvraag: onder welke bestaande plek, en welke lagen er nieuw bij komen.
  const parent: Organization | null = newDirectie
    ? ministry
    : (directies.find((d) => d.id === directieId) ?? null);
  const layers = (newDirectie ? [directie, afdeling] : [afdeling]).map((l) => ({
    name: tidy(l.name),
    code: tidy(l.code),
  }));
  const directieProblem = newDirectie ? layerProblem(directie) : null;
  const afdelingProblem = layerProblem(afdeling);

  // Bestaat (een deel van) wat je invult al? Op naam of afkorting.
  const existing = useMemo(() => {
    if (!parent) return { deepest: null as Organization | null, rest: layers.length };
    let current: Organization = parent;
    let used = 0;
    for (const layer of layers) {
      const words = [layer.name, layer.code].filter(Boolean).map((w) => w.toLowerCase());
      if (words.length === 0) break;
      const match = childrenOf(current.id, organizations).find((o) =>
        [o.name, o.code ?? ''].some((w) => w && words.includes(w.toLowerCase())),
      );
      if (!match) break;
      current = match;
      used += 1;
    }
    return { deepest: used > 0 ? current : null, rest: layers.length - used };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, organizations, directie, afdeling, newDirectie]);
  const alreadyThere = existing.deepest !== null && existing.rest === 0;

  // Lijkt een nieuwe laag op iets wat er al staat, ook onder een andere directie of
  // anders geschreven ("SSCICT" bij "SSC-ICT")? Dan eerst dat aanbieden: zo kwamen
  // er aanvragen binnen voor afdelingen die er al stonden.
  const lookalikes = useMemo(() => {
    if (!adding || alreadyThere) return [] as Organization[];
    const wanted = layers.slice(layers.length - existing.rest);
    const found = new Map<string, Organization>();
    for (const layer of wanted) {
      const keys = [layer.name, layer.code].map(compact).filter((k) => k.length >= 2);
      const words = significantWords(layer.name);
      if (keys.length === 0) continue;
      for (const o of organizations) {
        if (o.organization_type === 'ministry' || found.has(o.id)) continue;
        const own = [o.name, o.code ?? ''].map(compact).filter(Boolean);
        const sameKey = keys.some((k) => own.includes(k));
        const theirs = significantWords(o.name);
        const shared = words.filter((w) => theirs.includes(w)).length;
        const similar = words.length >= 2 && shared >= Math.ceil(words.length * 0.6);
        if (sameKey || similar) found.set(o.id, o);
      }
    }
    return [...found.values()].slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, alreadyThere, organizations, directie, afdeling, newDirectie, existing.rest]);

  const ready =
    !!parent && layers.every((l) => l.name.length >= 2) && !directieProblem && !afdelingProblem;

  // Bij het registreren gaat de aanvraag mee met het account; geef hem steeds door.
  const draftKey = adding && parent
    ? JSON.stringify([parent.id, layers, ready && !alreadyThere])
    : '';
  useEffect(() => {
    if (!onDraftRequest) return;
    if (!draftKey) {
      onDraftRequest(null);
      return;
    }
    const [parentId, draftLayers, draftReady] = JSON.parse(draftKey) as [string, Layer[], boolean];
    onDraftRequest({
      parentId,
      names: draftLayers.map((l) => l.name),
      codes: draftLayers.map((l) => l.code),
      ready: draftReady,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  function openAdd(afdelingTerm = '') {
    const current = value ? organizations.find((o) => o.id === value) : undefined;
    // Staat je profiel al op een afdeling, dan ligt de directie daarvan voor de hand.
    const guess = current ? (isDepartment(current) ? current.parent_id ?? null : current.id) : null;
    setDirectieId(directies.some((d) => d.id === guess) ? guess : null);
    setNewDirectie(false);
    setDirectie(EMPTY_LAYER);
    setAfdeling(layerFromTerm(afdelingTerm));
    setAdding(true);
    // Na het tekenen van het blok; zonder toetsenbord over de lijst op een telefoon.
    requestAnimationFrame(() => {
      firstRef.current?.scrollIntoView({ block: 'nearest' });
      if (!window.matchMedia('(pointer: coarse)').matches) firstRef.current?.focus();
    });
  }

  function closeAdd() {
    setAdding(false);
  }

  async function submit() {
    if (sending) return;
    if (alreadyThere && existing.deepest) {
      onChange(existing.deepest.id);
      closeAdd();
      return;
    }
    if (deferred || !ready || !parent) return;
    setSending(true);
    try {
      const request = await requestOrganization(parent.id, layers);
      onRequested?.(request);
      closeAdd();
      toast.success('Aangevraagd. Je krijgt een mail als een beheerder het heeft beoordeeld.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aanvragen mislukt.');
    } finally {
      setSending(false);
    }
  }

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeAdd();
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  const preview = [
    ministryShort,
    newDirectie ? orgDisplayName(layers[0]) : parent ? orgDisplayName(parent) : '',
    orgDisplayName(layers[layers.length - 1]),
  ]
    .filter(Boolean)
    .join(ORG_PATH_SEPARATOR);

  const LINK =
    'opl-raak inline-flex items-center gap-1.5 text-sm font-medium text-rijksblauw-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-300';

  return (
    <div className="space-y-4">
      <div>
        <label className="opl-label" htmlFor={`${idPrefix}-ministerie`}>
          Ministerie
        </label>
        <SearchableSelect
          id={`${idPrefix}-ministerie`}
          options={ministryOptions}
          value={ministryId}
          onChange={(id) => {
            closeAdd();
            onChange(id);
          }}
          disabled={disabled || loading}
          placeholder={loading ? 'Ministeries laden…' : 'Kies je ministerie'}
          searchPlaceholder="Zoek op naam of afkorting"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor={`${idPrefix}-afdeling`}>
            Afdeling
          </label>
          <InfoDot
            label="Uitleg over de afdeling"
            text={
              canRequest
                ? "Zoek op de naam of afkorting van je afdeling, of op de directie of dienst erboven. Collega's in dezelfde afdeling zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Vraag hem aan; een beheerder keurt hem goed."
                : "Zoek op de naam of afkorting van je afdeling, of op de directie of dienst erboven. Collega's in dezelfde afdeling zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Vraag hem na het registreren aan bij je profiel."
            }
          />
        </div>
        <SearchableSelect
          id={`${idPrefix}-afdeling`}
          options={afdelingOptions}
          value={value && value !== ministryId ? value : null}
          onChange={(id) => {
            closeAdd();
            onChange(id ?? ministryId);
          }}
          disabled={disabled || loading}
          placeholder={ministryId ? 'Kies je afdeling' : 'Zoek je afdeling'}
          clearLabel={ministryId ? 'Geen afdeling' : undefined}
          searchPlaceholder="Zoek op afdeling, directie, ministerie of afkorting"
          emptyLabel={`Nog geen afdelingen bij ${ministryShort || 'dit ministerie'}.`}
          onRequestNew={canRequest && ministryId ? (term) => openAdd(term) : undefined}
          requestNewLabel={(term) => `“${term}” aanvragen als afdeling`}
          requestNewHint={`Nieuw bij ${ministryShort}`}
        />
      </div>

      {canRequest && ministryId && !adding && (
        <button type="button" onClick={() => openAdd()} disabled={disabled} className={LINK}>
          <Plus size={14} aria-hidden />
          Mijn afdeling staat er niet bij
        </button>
      )}
      {canRequest && !ministryId && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Staat je afdeling er niet bij? Kies dan eerst je ministerie.
        </p>
      )}

      {adding && ministry && (
        <div
          role="group"
          aria-labelledby={`${idPrefix}-aanvraag-kop`}
          className="space-y-4 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/50 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10"
        >
          <p
            id={`${idPrefix}-aanvraag-kop`}
            className="text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            Nieuwe afdeling bij {ministry.name}
          </p>

          <fieldset>
            <legend className="opl-label">Onder welke directie of dienst valt je afdeling?</legend>
            {/* De keuzelijst staat er altijd, ook zolang hij leeg is: zo zoek je eerst
                en vraag je alleen aan wat er echt niet bij staat. */}
            <SearchableSelect
              id={`${idPrefix}-directie`}
              options={directieOptions}
              value={newDirectie ? null : directieId}
              onChange={(id) => {
                setDirectieId(id);
                if (id) {
                  setNewDirectie(false);
                  setDirectie(EMPTY_LAYER);
                }
              }}
              disabled={sending}
              placeholder={newDirectie ? 'Nieuwe directie of dienst, hieronder' : 'Kies de directie of dienst'}
              searchPlaceholder="Zoek op naam of afkorting"
              emptyLabel="Nog geen directies of diensten bij dit ministerie. Typ de naam om hem aan te vragen."
              onRequestNew={(term) => {
                setDirectie(layerFromTerm(term));
                setNewDirectie(true);
              }}
              requestNewLabel={(term) => `“${term}” aanvragen als directie of dienst`}
              requestNewHint="Staat er nog niet bij"
            />
            {!newDirectie ? (
              <button
                type="button"
                onClick={() => setNewDirectie(true)}
                disabled={sending}
                className={`${LINK} mt-2`}
              >
                <Plus size={14} aria-hidden />
                Directie of dienst staat er niet bij
              </button>
            ) : (
              <div className="mt-3">
                <LayerFields
                  idBase={`${idPrefix}-directie-nieuw`}
                  layer={directie}
                  onChange={setDirectie}
                  problem={directieProblem}
                  example="Bijvoorbeeld Ontwikkeling, Digitalisering, Innovatie"
                  codeExample="ODI"
                  onKeyDown={keys}
                />
                <button
                  type="button"
                  onClick={() => {
                    setNewDirectie(false);
                    setDirectie(EMPTY_LAYER);
                  }}
                  disabled={sending}
                  className={`${LINK} mt-2`}
                >
                  Niet aanvragen, toch zoeken in de lijst
                </button>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="opl-label">Je afdeling</legend>
            <LayerFields
              idBase={`${idPrefix}-afdeling-nieuw`}
              layer={afdeling}
              onChange={setAfdeling}
              problem={afdelingProblem}
              example="Bijvoorbeeld Rijks Academie Digitalisering Informatisering Overheid"
              codeExample="RADIO"
              onKeyDown={keys}
              inputRef={firstRef}
            />
          </fieldset>

          {lookalikes.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Bestaat dit al? Kies hem dan hier.
              </p>
              <ul className="mt-2 space-y-1.5">
                {lookalikes.map((o) => {
                  const path = orgChain(o.id, organizations)
                    .slice(0, -1)
                    .map((x, i) => (i === 0 ? x.code || x.name : orgDisplayName(x)))
                    .join(ORG_PATH_SEPARATOR);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(o.id);
                          closeAdd();
                        }}
                        disabled={sending}
                        className="opl-raak w-full rounded border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-rijksblauw-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:border-slate-600 dark:bg-slate-800"
                      >
                        <span className="block font-medium text-slate-800 dark:text-slate-100">
                          {orgDisplayName(o)}
                        </span>
                        {path && (
                          <span className="block text-xs text-slate-500 dark:text-slate-400">onder {path}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
            {alreadyThere && existing.deepest
              ? `“${orgDisplayName(existing.deepest)}” bestaat al. Kies hem met de knop hieronder.`
              : ready
                ? deferred
                  ? `Dit wordt aangevraagd als je je e-mailadres hebt bevestigd: ${preview}. Een beheerder beoordeelt het.`
                  : `Dit wordt aangevraagd: ${preview}. Een beheerder beoordeelt het.`
                : 'Schrijf de namen voluit, zodat collega’s ze vinden en begrijpen.'}
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="opl-btn-ghost" onClick={closeAdd} disabled={sending}>
              {deferred ? 'Niet aanvragen' : 'Annuleren'}
            </button>
            {(!deferred || alreadyThere) && (
              <button
                type="button"
                onClick={() => void submit()}
                className="opl-btn-primary"
                disabled={sending || !(ready || alreadyThere)}
              >
                {sending ? 'Aanvragen…' : alreadyThere ? 'Deze kiezen' : 'Aanvragen'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Naam voluit en afkorting naast elkaar; op een smal scherm onder elkaar. */
function LayerFields({
  idBase,
  layer,
  onChange,
  problem,
  example,
  codeExample,
  onKeyDown,
  inputRef,
}: {
  idBase: string;
  layer: Layer;
  onChange: (layer: Layer) => void;
  problem: string | null;
  example: string;
  /** Voorbeeld in het vak Afkorting; leeg laat het vak leeg. */
  codeExample?: string;
  onKeyDown: (e: KeyboardEvent) => void;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  const problemId = `${idBase}-probleem`;
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-[3_1_12rem]">
          <label
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
            htmlFor={`${idBase}-naam`}
          >
            Volledige naam
          </label>
          <input
            ref={inputRef}
            id={`${idBase}-naam`}
            className="opl-input"
            value={layer.name}
            maxLength={120}
            autoComplete="off"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            onChange={(e) => onChange({ ...layer, name: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder={example}
          />
        </div>
        <div className="min-w-0 flex-[1_1_7rem]">
          <label
            className="mb-1 block text-xs text-slate-500 dark:text-slate-400"
            htmlFor={`${idBase}-afkorting`}
          >
            Afkorting (als die er is)
          </label>
          <input
            id={`${idBase}-afkorting`}
            className="opl-input"
            value={layer.code}
            maxLength={20}
            autoComplete="off"
            onChange={(e) => onChange({ ...layer, code: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder={codeExample}
          />
        </div>
      </div>
      {problem && (
        <p id={problemId} className="mt-1.5 text-xs text-nadruk">
          {problem}
        </p>
      )}
    </div>
  );
}
