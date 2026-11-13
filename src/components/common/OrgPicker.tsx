import { useId, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { requestOrganization } from '@/services/organizationRequestService';
import {
  childrenOf,
  listMinistries,
  orgChain,
  orgPathLabel,
  ORG_PATH_SEPARATOR,
} from '@/lib/orgTree';
import SearchableSelect from '@/components/common/SearchableSelect';
import InfoDot from '@/components/common/InfoDot';
import { Plus } from '@/components/common/icons';
import type { Organization, OrganizationRequest } from '@/types';

/** Hoeveel nieuwe lagen één aanvraag mag hebben; gelijk aan de grens in de database (0056). */
const MAX_NEW_LAYERS = 3;

const LAYER_LABELS = ['Onderdeel', 'Team of afdeling eronder', 'Nog een laag eronder'];
const LAYER_PLACEHOLDERS = ['Bijvoorbeeld ODI', 'Bijvoorbeeld RADIO', ''];

/**
 * Eerst het ministerie, dan zo diep als je wilt: een onderdeel, daaronder een team.
 * De waarde is de diepste gekozen plek, dus een profiel hangt altijd aan de
 * kleinste eenheid en is zo verbonden met alle lagen erboven.
 *
 * Met `allowCreate` vraagt een ingelogde gebruiker een ontbrekend onderdeel aan,
 * ook meerdere lagen tegelijk. Dat is een aanvraag: een beheerder keurt hem goed
 * en pas dan staat hij in de lijst. Tot die tijd blijft de waarde de plek waar hij
 * onder valt.
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
  /** De plek waaronder de nieuwe lagen komen; null als het blok dicht is. */
  const [addUnder, setAddUnder] = useState<Organization | null>(null);
  const [names, setNames] = useState<string[]>(['']);
  const [sending, setSending] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const chain = useMemo(() => orgChain(value, organizations), [value, organizations]);
  const ministryOptions = useMemo(
    () => listMinistries(organizations).map((o) => ({ id: o.id, label: o.name })),
    [organizations],
  );

  const cleaned = names.map((n) => n.trim().replace(/\s+/g, ' '));
  const filled = cleaned.filter((n) => n.length > 0);

  // Wat er van de ingevulde keten al bestaat, zodat je niet iets aanvraagt dat er is.
  const existing = useMemo(() => {
    if (!addUnder) return { deepest: null as Organization | null, rest: filled };
    let current: Organization = addUnder;
    let used = 0;
    for (const name of filled) {
      const match = childrenOf(current.id, organizations).find(
        (o) => o.name.toLowerCase() === name.toLowerCase(),
      );
      if (!match) break;
      current = match;
      used += 1;
    }
    return { deepest: used > 0 ? current : null, rest: filled.slice(used) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addUnder, organizations, names]);

  function openAdd(under: Organization, prefill = '') {
    setAddUnder(under);
    setNames([prefill]);
    // Na het tekenen van het blok; zonder toetsenbord over de lijst op een telefoon.
    requestAnimationFrame(() => {
      firstInputRef.current?.scrollIntoView({ block: 'nearest' });
      if (!window.matchMedia('(pointer: coarse)').matches) firstInputRef.current?.focus();
    });
  }

  function closeAdd() {
    setAddUnder(null);
    setNames(['']);
  }

  /** Kies je een plek hoger op, dan vervalt wat je aan het toevoegen was. */
  function choose(level: number, id: string | null) {
    closeAdd();
    if (id) onChange(id);
    else onChange(level > 0 ? chain[level - 1].id : null);
  }

  function setName(index: number, text: string) {
    setNames((prev) => prev.map((n, i) => (i === index ? text : n)));
  }

  async function submitAdd() {
    if (!addUnder || sending || filled.length === 0) return;
    if (existing.rest.length === 0 && existing.deepest) {
      onChange(existing.deepest.id);
      closeAdd();
      return;
    }
    if (cleaned.some((n) => n.length > 0 && n.length < 2)) return;
    setSending(true);
    try {
      const request = await requestOrganization(addUnder.id, filled);
      onRequested?.(request);
      closeAdd();
      toast.success('Aangevraagd. Je krijgt een mail als een beheerder het heeft beoordeeld.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aanvragen mislukt.');
    } finally {
      setSending(false);
    }
  }

  // Een keuzelijst per laag: het ministerie, en daaronder zolang er iets te kiezen is.
  const levels: { parent: Organization | null; options: { id: string; label: string }[] }[] = [
    { parent: null, options: ministryOptions },
  ];
  for (let i = 0; i < chain.length; i++) {
    const kids = childrenOf(chain[i].id, organizations);
    if (kids.length === 0) break;
    levels.push({
      parent: chain[i],
      options: kids.map((o) => ({ id: o.id, label: o.name })),
    });
  }

  const deepest = chain.length > 0 ? chain[chain.length - 1] : null;
  const addPath = addUnder ? orgPathLabel(addUnder.id, organizations, { short: true }) : '';
  const preview = [addPath, ...filled].filter(Boolean).join(ORG_PATH_SEPARATOR);

  return (
    <div className="space-y-4">
      {levels.map((level, i) => {
        const selected = chain[i]?.id ?? null;
        const where = level.parent?.name ?? 'dit ministerie';
        return (
          <div key={level.parent?.id ?? 'ministerie'}>
            {i === 0 ? (
              <label className="opl-label" htmlFor={`${idPrefix}-laag-${i}`}>
                Ministerie
              </label>
            ) : (
              <div className="mb-1 flex items-center gap-1">
                <label className="opl-label mb-0" htmlFor={`${idPrefix}-laag-${i}`}>
                  {i === 1 ? 'Onderdeel' : 'Team of afdeling'}
                </label>
                {i === 1 && (
                  <InfoDot
                    label="Uitleg over het onderdeel"
                    text={
                      allowCreate
                        ? "Kies zo diep als je wilt: een directie of dienst, en daaronder je team. Collega's op dezelfde plek zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Vraag hem aan, een beheerder keurt hem goed."
                        : "Kies zo diep als je wilt: een directie of dienst, en daaronder je team. Collega's op dezelfde plek zien elkaars prompts met het deelniveau Afdeling. Staat de jouwe er niet bij? Vraag hem na het registreren aan bij je profiel."
                    }
                  />
                )}
              </div>
            )}
            <SearchableSelect
              id={`${idPrefix}-laag-${i}`}
              options={level.options}
              value={selected}
              onChange={(id) => choose(i, id)}
              disabled={disabled || (i === 0 && loading)}
              placeholder={
                i === 0
                  ? loading
                    ? 'Ministeries laden…'
                    : 'Kies je ministerie'
                  : i === 1
                    ? 'Kies je onderdeel'
                    : 'Kies je team of afdeling'
              }
              clearLabel={i === 0 ? undefined : i === 1 ? 'Geen onderdeel' : 'Geen team of afdeling'}
              searchPlaceholder={
                i === 0
                  ? 'Zoek je ministerie'
                  : allowCreate
                    ? 'Zoek of typ wat je wilt aanvragen'
                    : 'Zoek op naam'
              }
              emptyLabel={`Nog niets onder ${where}.`}
              onRequestNew={
                allowCreate && level.parent
                  ? (term) => openAdd(level.parent as Organization, term)
                  : undefined
              }
              requestNewLabel={(term) => `“${term}” aanvragen`}
              requestNewHint={`Nieuw onder ${where}`}
            />
          </div>
        );
      })}

      {allowCreate && deepest && !addUnder && (
        <button
          type="button"
          onClick={() => openAdd(deepest)}
          disabled={disabled}
          className="opl-raak inline-flex items-center gap-1.5 text-sm font-medium text-rijksblauw-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-300"
        >
          <Plus size={14} aria-hidden />
          Mijn onderdeel of team staat er niet bij
        </button>
      )}

      {addUnder && (
        <div
          role="group"
          aria-labelledby={`${idPrefix}-aanvraag-kop`}
          className="rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/50 p-4 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/10"
        >
          <p
            id={`${idPrefix}-aanvraag-kop`}
            className="mb-3 text-sm font-semibold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            Aanvragen onder {addPath}
          </p>

          <div className="space-y-3">
            {names.map((name, i) => (
              <div key={i}>
                <label className="opl-label" htmlFor={`${idPrefix}-nieuw-${i}`}>
                  {LAYER_LABELS[i]}
                </label>
                <input
                  ref={i === 0 ? firstInputRef : undefined}
                  id={`${idPrefix}-nieuw-${i}`}
                  className="opl-input"
                  value={name}
                  maxLength={80}
                  autoComplete="off"
                  aria-describedby={hintId}
                  onChange={(e) => setName(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeAdd();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitAdd();
                    }
                  }}
                  placeholder={LAYER_PLACEHOLDERS[i]}
                />
              </div>
            ))}
          </div>

          {names.length < MAX_NEW_LAYERS && (
            <button
              type="button"
              onClick={() => setNames((prev) => [...prev, ''])}
              disabled={sending}
              className="opl-raak mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-rijksblauw-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-300"
            >
              <Plus size={14} aria-hidden />
              Een laag eronder toevoegen
            </button>
          )}

          <p id={hintId} className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {existing.deepest && existing.rest.length === 0
              ? `“${existing.deepest.name}” bestaat al. Kies hem met de knop hieronder.`
              : filled.length > 0
                ? `Dit wordt aangevraagd: ${preview}. Een beheerder beoordeelt het.`
                : 'Een beheerder beoordeelt je aanvraag.'}
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="opl-btn-ghost" onClick={closeAdd} disabled={sending}>
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => void submitAdd()}
              className="opl-btn-primary"
              disabled={
                sending || filled.length === 0 || cleaned.some((n) => n.length > 0 && n.length < 2)
              }
            >
              {sending
                ? 'Aanvragen…'
                : existing.deepest && existing.rest.length === 0
                  ? 'Deze kiezen'
                  : 'Aanvragen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
