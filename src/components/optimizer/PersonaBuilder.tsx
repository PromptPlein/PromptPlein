import { useEffect, useMemo, useRef, useState } from 'react';
import { useNlddValue } from '@/lib/nldd';
import { notify } from '@/lib/notify';
import PrefillBadge from './PrefillBadge';
import { fillPersona } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import type { Technique } from '@/types';
import {
  emptyPersona,
  resolvePersonaQuestions,
  serializePersonas,
  type PersonaEntry,
  type PersonaFieldKey,
  type PersonaQuestion,
} from '@/lib/persona';
import BuilderIntro from './BuilderIntro';
import InfoDot from '@/components/common/InfoDot';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/divider';
import '@nldd/design-system/icon-button';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';

/** Client-side unieke id voor een nieuwe persona-kaart. */
function newId(): string {
  return `persona-${Math.random().toString(36).slice(2, 9)}`;
}

interface PersonaBuilderProps {
  /** Meerdere persona's toestaan (Multi-Persona) of precies één (Persona Prompting). */
  multi: boolean;
  /** Admin-AI-instellingen voor de invulhulp. */
  settings: AiSettings;
  /**
   * De gekozen techniek. De vragen van deze bouwer komen uit de vervolgvragen van
   * de techniek (beheerd in de admin, inclusief de toelichting per veld). Zonder
   * techniek — of zolang die nog geen vragen heeft — gelden de standaardvragen.
   */
  technique?: Technique;
  /** Optionele context (het doel), voedt de AI-invulhulp. */
  context?: string;
  /**
   * Aangeroepen met de geserialiseerde persona-tekst zodra die wijzigt, zodat de
   * stap deze als antwoord kan meenemen in de analyse/compose.
   */
  onSerialized: (text: string) => void;
}

/**
 * Gestructureerde persona-definitie voor de Persona-/Multi-Persona-stappen. Per
 * persona een reeks gerichte vragen (standaard: rol, ervaring, belang, focus,
 * wat-niet, toon, blinde vlek) die in de admin te beheren zijn. Bij Multi-Persona
 * kan de gebruiker meerdere persona's toevoegen. Weet de gebruiker de details niet,
 * dan vult de AI de velden in op basis van een korte aanduiding ("mijn teammanager")
 * — bewerkbaar, met een AI-suggestie-label.
 */
export default function PersonaBuilder({
  multi,
  settings,
  technique,
  context,
  onSerialized,
}: PersonaBuilderProps) {
  const [personas, setPersonas] = useState<PersonaEntry[]>(() => [emptyPersona(newId())]);
  // Per persona-id: welke velden zijn door de AI ingevuld (voor het suggestie-label).
  const [aiFields, setAiFields] = useState<Record<string, Set<PersonaFieldKey>>>({});
  // Per persona-id: draait de AI-invulhulp nu?
  const [busyId, setBusyId] = useState<string | null>(null);

  // De vragen zoals de admin ze heeft gedefinieerd voor deze techniek.
  const questions = useMemo(() => resolvePersonaQuestions(technique), [technique]);

  // Meld de geserialiseerde tekst terug zodra de persona's (of de vragen) wijzigen.
  useEffect(() => {
    onSerialized(serializePersonas(personas, questions));
    // onSerialized is stabiel genoeg (setter uit de ouder); alleen op de inhoud reageren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, questions]);

  function updateField(pid: string, key: PersonaFieldKey, value: string) {
    setPersonas((prev) =>
      prev.map((p) => (p.id === pid ? { ...p, fields: { ...p.fields, [key]: value } } : p)),
    );
    // Handmatige wijziging → het AI-suggestie-label vervalt voor dit veld.
    setAiFields((prev) => {
      const set = prev[pid];
      if (!set?.has(key)) return prev;
      const next = new Set(set);
      next.delete(key);
      return { ...prev, [pid]: next };
    });
  }

  function updateHint(pid: string, hint: string) {
    setPersonas((prev) => prev.map((p) => (p.id === pid ? { ...p, hint } : p)));
  }

  function addPersona() {
    setPersonas((prev) => [...prev, emptyPersona(newId())]);
  }

  function removePersona(pid: string) {
    setPersonas((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== pid)));
    setAiFields((prev) => {
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  }

  /** Laat de AI de velden van deze persona invullen op basis van de korte aanduiding. */
  async function aiFill(pid: string) {
    const persona = personas.find((p) => p.id === pid);
    if (!persona) return;
    const hint = persona.hint.trim();
    if (!hint) {
      notify.error('Geef eerst een korte aanduiding, bijv. "mijn teammanager".');
      return;
    }
    setBusyId(pid);
    try {
      const res = await fillPersona({
        hint,
        context,
        // De AI vult exact de velden die de admin heeft gedefinieerd; de toelichting
        // per veld gaat mee als instructie.
        questions: questions.map((q) => ({ id: q.id, label: q.label, why: q.why })),
        preferredProvider: settings.provider,
        preferredModel: settings.model,
      });
      if (res.unclear) {
        notify.error(res.reason?.trim() || 'De aanduiding is nog te vaag om in te vullen.');
        return;
      }
      if (!res.success || res.fields.length === 0) {
        notify.error(res.error ?? 'Invullen mislukt. Probeer een iets concretere aanduiding.');
        return;
      }
      // Vul de velden in (bestaande, door de gebruiker ingevulde velden niet overschrijven).
      // Alleen velden die de techniek kent: een veld-id dat de AI verzint, heeft
      // geen invoerveld en zou anders onzichtbaar in de tekst belanden.
      const known = new Set(questions.map((q) => q.id));
      const touched = new Set<PersonaFieldKey>();
      setPersonas((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          const fields = { ...p.fields };
          for (const f of res.fields) {
            const key = f.id as PersonaFieldKey;
            if (!known.has(key)) continue;
            if (!fields[key]?.trim()) {
              fields[key] = f.value;
              touched.add(key);
            }
          }
          return { ...p, fields };
        }),
      );
      setAiFields((prev) => ({ ...prev, [pid]: touched }));
      notify.success('Persona ingevuld met AI. Controleer en pas aan waar nodig.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <nldd-container gap="24">
      <BuilderIntro
        title={multi ? 'Beschrijf de persona’s' : 'Beschrijf de persona'}
        text="Vanuit wie of voor wie schrijft de AI? Hoe scherper, hoe beter het resultaat."
      />

      {personas.map((persona, idx) => (
        <PersonaBlock
          key={persona.id}
          index={idx}
          total={personas.length}
          multi={multi}
          persona={persona}
          questions={questions}
          aiFields={aiFields[persona.id]}
          busy={busyId === persona.id}
          onHintChange={(v) => updateHint(persona.id, v)}
          onFieldChange={(key, v) => updateField(persona.id, key, v)}
          onAiFill={() => void aiFill(persona.id)}
          onRemove={() => removePersona(persona.id)}
        />
      ))}

      {multi && (
        <nldd-button-group>
          <nldd-button appearance="secondary" start-icon="plus" text="Nog een persona toevoegen" onClick={addPersona}></nldd-button>
        </nldd-button-group>
      )}
    </nldd-container>
  );
}

/**
 * One persona: with several, a heading and a divider above it; then the short
 * description with the AI fill aid, and the questions under it.
 */
function PersonaBlock({
  index,
  total,
  multi,
  persona,
  questions,
  aiFields,
  busy,
  onHintChange,
  onFieldChange,
  onAiFill,
  onRemove,
}: {
  index: number;
  total: number;
  multi: boolean;
  persona: PersonaEntry;
  questions: PersonaQuestion[];
  aiFields?: Set<PersonaFieldKey>;
  busy: boolean;
  onHintChange: (v: string) => void;
  onFieldChange: (key: PersonaFieldKey, v: string) => void;
  onAiFill: () => void;
  onRemove: () => void;
}) {
  const hintRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(hintRef, persona.hint, onHintChange);
  return (
    <nldd-container gap="16">
      {multi && (
        <nldd-container gap="16">
          {index > 0 && <nldd-divider></nldd-divider>}
          <nldd-container layout="row" gap="8" vertical-alignment="center">
            <nldd-title
              heading-level={3}
              size={5}
              text={`Persona ${index + 1}`}
              supporting-text={persona.hint.trim() || undefined}
            ></nldd-title>
            <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
            {total > 1 && (
              <nldd-icon-button
                appearance="neutral-transparent"
                icon="trash"
                accessible-label={`Verwijder persona ${index + 1}`}
                onClick={onRemove}
              ></nldd-icon-button>
            )}
          </nldd-container>
        </nldd-container>
      )}

      {/* Short description and the AI fill aid. */}
      <nldd-box background="accent-tinted">
        <nldd-container padding="16" gap="8">
          <nldd-container layout="row" gap="4" vertical-alignment="center">
            <nldd-text weight="bold">Korte aanduiding</nldd-text>
            <InfoDot
              label="Uitleg bij korte aanduiding"
              text="Weet je de details niet? Geef een korte aanduiding en laat de AI de velden invullen. Mag leeg blijven."
            />
          </nldd-container>
          <nldd-container layout="wrap" gap="8" vertical-alignment="center">
            <nldd-text-field
              ref={hintRef}
              width="20rem"
              accessible-label="Korte aanduiding"
              placeholder="Bijv. mijn teammanager"
            ></nldd-text-field>
            <nldd-button
              appearance="secondary"
              start-icon="sparkles"
              text="Vul aan met AI"
              loading={busy || undefined}
              loading-text="Invullen…"
              disabled={busy || !persona.hint.trim() || undefined}
              onClick={onAiFill}
            ></nldd-button>
          </nldd-container>
        </nldd-container>
      </nldd-box>

      {/* The persona questions as defined with the technique. A field the AI
          filled only gets a label, no surface of its own: it is ordinary,
          editable input. Bottom alignment keeps the fields of a row level when
          one label runs over two lines. */}
      <nldd-container layout="grid" gap="16" vertical-alignment="bottom" sm-column-count={1} md-column-count={2} lg-column-count={3}>
        {questions.map((q) => (
          <PersonaField
            key={q.id}
            question={q}
            value={persona.fields[q.id] ?? ''}
            isAi={Boolean(aiFields?.has(q.id))}
            onValue={(v) => onFieldChange(q.id, v)}
          />
        ))}
      </nldd-container>
    </nldd-container>
  );
}

function PersonaField({
  question,
  value,
  isAi,
  onValue,
}: {
  question: PersonaQuestion;
  value: string;
  isAi: boolean;
  onValue: (v: string) => void;
}) {
  const ref = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(ref, value, onValue);
  return (
    <nldd-container gap="8">
      <nldd-container layout="row" gap="4" vertical-alignment="center">
        <nldd-text weight="bold">{question.label}</nldd-text>
        {question.why && <InfoDot label={`Uitleg bij: ${question.label}`} text={question.why} />}
        {isAi && <PrefillBadge source="ai" />}
      </nldd-container>
      <nldd-multi-line-text-field
        ref={ref}
        rows={3}
        resize="vertical"
        accessible-label={question.label}
        placeholder={question.placeholder}
      ></nldd-multi-line-text-field>
    </nldd-container>
  );
}
