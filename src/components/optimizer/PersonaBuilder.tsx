import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, UserRound } from '@/components/common/icons';
import toast from 'react-hot-toast';
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
      toast.error('Geef eerst een korte aanduiding, bijv. "mijn teammanager".');
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
        toast.error(res.reason?.trim() || 'De aanduiding is nog te vaag om in te vullen.');
        return;
      }
      if (!res.success || res.fields.length === 0) {
        toast.error(res.error ?? 'Invullen mislukt. Probeer een iets concretere aanduiding.');
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
      toast.success('Persona ingevuld met AI. Controleer en pas aan waar nodig.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <BuilderIntro
        title={multi ? 'Beschrijf de persona’s' : 'Beschrijf de persona'}
        text="Vanuit wie of voor wie schrijft de AI? Hoe scherper, hoe beter het resultaat."
      />

      {personas.map((persona, idx) => (
        <PersonaCard
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
        <button
          type="button"
          onClick={addPersona}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rijksblauw-300 px-3 py-2 text-sm font-medium text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 dark:border-rijksblauw-500/40 dark:text-rijksblauw-200 dark:hover:bg-rijksblauw-500/10"
        >
          <Plus size={16} /> Nog een persona toevoegen
        </button>
      )}
    </div>
  );
}

/** Eén persona-kaart: de aanduiding + AI-invulhulp bovenaan, daaronder de vragen. */
function PersonaCard({
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
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
          <UserRound size={16} />
          {multi ? `Persona ${index + 1}` : 'Persona'}
          {persona.hint.trim() && (
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              · {persona.hint.trim()}
            </span>
          )}
        </span>
        {multi && total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            title="Verwijder deze persona"
            aria-label={`Verwijder persona ${index + 1}`}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rijksoranje/10 hover:text-rijksoranje dark:text-slate-500"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Korte aanduiding + AI-invulhulp. */}
      <div className="mb-4 rounded-lg bg-rijksblauw-50/60 p-3 dark:bg-rijksblauw-500/10">
        <div className="mb-1 flex items-center gap-1">
          <label className="opl-label mb-0" htmlFor={`persona-hint-${persona.id}`}>
            Korte aanduiding
          </label>
          <span className="text-sm text-slate-500 dark:text-slate-400">Mag leeg blijven</span>
          <InfoDot
            label="Uitleg bij korte aanduiding"
            text="Weet je de details niet? Geef een korte aanduiding en laat de AI de velden invullen."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`persona-hint-${persona.id}`}
            className="opl-input h-9 flex-1 py-1 text-sm"
            value={persona.hint}
            placeholder="Bijv. mijn teammanager"
            onChange={(e) => onHintChange(e.target.value)}
          />
          <button
            type="button"
            className="opl-btn-primary shrink-0"
            onClick={onAiFill}
            disabled={busy || !persona.hint.trim()}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {busy ? 'Invullen…' : 'Vul aan met AI'}
          </button>
        </div>
      </div>

      {/* De persona-vragen zoals gedefinieerd bij de techniek. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-x-4 gap-y-3">
        {questions.map((q) => {
          const isAi = aiFields?.has(q.id);
          return (
            <div key={q.id} className="min-w-0">
              <div className="mb-0.5 flex min-h-8 flex-wrap items-center gap-1">
                <label className="opl-label mb-0" htmlFor={`persona-${persona.id}-${q.id}`}>
                  {q.label}
                </label>
                {q.why && <InfoDot label={`Uitleg bij: ${q.label}`} text={q.why} />}
                {isAi && <PrefillBadge source="ai" />}
              </div>
              {/* Door de AI ingevulde velden krijgen alleen een badge, geen eigen
                  achtergrond: de tekst is gewoon bewerkbare invoer en moet als
                  normaal veld lezen. */}
              <textarea
                id={`persona-${persona.id}-${q.id}`}
                rows={3}
                className="opl-input resize-y text-sm"
                value={persona.fields[q.id] ?? ''}
                placeholder={q.placeholder}
                onChange={(e) => onFieldChange(q.id, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
