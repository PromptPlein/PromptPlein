import { useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
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
 * Het ministerie, en dan je afdeling in één zoeklijst. Bij elke afdeling staat de
 * directie of dienst erboven, zodat je ook daarop zoekt en ziet waar hij onder
 * valt. De waarde is de afdeling, of het ministerie zolang er geen gekozen is.
 *
 * Met `allowCreate` vraagt een ingelogde gebruiker een ontbrekende afdeling aan.
 * Eerst kiest hij de directie of dienst; staat die er ook niet bij, dan vraagt hij
 * die mee aan. Een beheerder keurt het goed en pas dan staat het in de lijst.
 */
export default function OrgPicker({
  value,
  onChange,
  idPrefix,
  allowCreate = false,
  onRequested,
  disabled = false,
}: {
  value: string | null;
  onChange: (orgId: string | null) => void;
  idPrefix: string;
  allowCreate?: boolean;
  /** Na het indienen van een aanvraag, bijvoorbeeld om hem op het profiel te tonen. */
  onRequested?: (request: OrganizationRequest) => void;
  disabled?: boolean;
}) {
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
      listMinistries(organizations).map((o) => ({
        id: o.id,
        label: o.name,
        hint: o.code?.trim() || undefined,
      })),
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

  // Bij elke keuze de afkorting en de lagen erboven: daar zoek je ook op.
  const afdelingOptions = useMemo(() => {
    // Een profiel dat op een directie staat, blijft zichtbaar gekozen.
    return under
      .filter((o) => isDepartment(o) || o.id === value)
      .map((o) => {
        const above = between(o);
        return {
          id: o.id,
          label: o.name,
          hint: [o.code?.trim(), above ? `onder ${above}` : `direct onder ${ministryShort}`]
            .filter(Boolean)
            .join(' · '),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [under, value, ministryShort, organizations]);

  const directieOptions = useMemo(
    () =>
      directies.map((o) => {
        const above = between(o);
        return {
          id: o.id,
          label: o.name,
          hint: [o.code?.trim(), above ? `onder ${above}` : null].filter(Boolean).join(' · ') || undefined,
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

  const ready =
    !!parent && layers.every((l) => l.name.length >= 2) && !directieProblem && !afdelingProblem;

  function openAdd(afdelingTerm = '') {
    const current = value ? organizations.find((o) => o.id === value) : undefined;
    // Staat je profiel al op een afdeling, dan ligt de directie daarvan voor de hand.
    const guess = current ? (isDepartment(current) ? current.parent_id ?? null : current.id) : null;
    setDirectieId(directies.some((d) => d.id === guess) ? guess : null);
    setNewDirectie(directies.length === 0);
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
    if (!ready || !parent) return;
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
              allowCreate
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
          disabled={disabled || !ministryId}
          placeholder={!ministryId ? 'Kies eerst een ministerie' : 'Kies je afdeling'}
          clearLabel="Geen afdeling"
          searchPlaceholder="Zoek op afdeling, afkorting of directie"
          emptyLabel={`Nog geen afdelingen bij ${ministryShort || 'dit ministerie'}.`}
          onRequestNew={allowCreate ? (term) => openAdd(term) : undefined}
          requestNewLabel={(term) => `“${term}” aanvragen als afdeling`}
          requestNewHint={`Nieuw bij ${ministryShort}`}
        />
      </div>

      {allowCreate && ministryId && !adding && (
        <button type="button" onClick={() => openAdd()} disabled={disabled} className={LINK}>
          <Plus size={14} aria-hidden />
          Mijn afdeling staat er niet bij
        </button>
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
            {!newDirectie ? (
              <>
                <SearchableSelect
                  id={`${idPrefix}-directie`}
                  options={directieOptions}
                  value={directieId}
                  onChange={setDirectieId}
                  disabled={sending}
                  placeholder="Kies de directie of dienst"
                  searchPlaceholder="Zoek op naam of afkorting"
                  emptyLabel="Nog geen directies of diensten bij dit ministerie."
                  onRequestNew={(term) => {
                    setDirectie(layerFromTerm(term));
                    setNewDirectie(true);
                  }}
                  requestNewLabel={(term) => `“${term}” ook aanvragen`}
                  requestNewHint="Nieuwe directie of dienst"
                />
                <button
                  type="button"
                  onClick={() => setNewDirectie(true)}
                  disabled={sending}
                  className={`${LINK} mt-2`}
                >
                  <Plus size={14} aria-hidden />
                  Directie of dienst staat er ook niet bij
                </button>
              </>
            ) : (
              <>
                <LayerFields
                  idBase={`${idPrefix}-directie-nieuw`}
                  layer={directie}
                  onChange={setDirectie}
                  problem={directieProblem}
                  example="Bijvoorbeeld Directie Communicatie"
                  onKeyDown={keys}
                />
                {directies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewDirectie(false);
                      setDirectie(EMPTY_LAYER);
                    }}
                    disabled={sending}
                    className={`${LINK} mt-2`}
                  >
                    Toch een bestaande kiezen
                  </button>
                )}
              </>
            )}
          </fieldset>

          <fieldset>
            <legend className="opl-label">Je afdeling</legend>
            <LayerFields
              idBase={`${idPrefix}-afdeling-nieuw`}
              layer={afdeling}
              onChange={setAfdeling}
              problem={afdelingProblem}
              example="Bijvoorbeeld Strategie en Advies"
              onKeyDown={keys}
              inputRef={firstRef}
            />
          </fieldset>

          <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
            {alreadyThere && existing.deepest
              ? `“${orgDisplayName(existing.deepest)}” bestaat al. Kies hem met de knop hieronder.`
              : ready
                ? `Dit wordt aangevraagd: ${preview}. Een beheerder beoordeelt het.`
                : 'Schrijf de namen voluit, zodat collega’s ze vinden en begrijpen.'}
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="opl-btn-ghost" onClick={closeAdd} disabled={sending}>
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="opl-btn-primary"
              disabled={sending || !(ready || alreadyThere)}
            >
              {sending ? 'Aanvragen…' : alreadyThere ? 'Deze kiezen' : 'Aanvragen'}
            </button>
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
  onKeyDown,
  inputRef,
}: {
  idBase: string;
  layer: Layer;
  onChange: (layer: Layer) => void;
  problem: string | null;
  example: string;
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
