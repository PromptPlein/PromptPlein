import { useEffect, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2, UserRound } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import PrefillBadge from './PrefillBadge';
import { fillPersona } from '@/services/optimizeService';
import type { AiSettings } from '@/services/settingsService';
import {
  PERSONA_QUESTIONS,
  emptyPersona,
  serializePersonas,
  type PersonaEntry,
  type PersonaFieldKey,
} from '@/lib/persona';

/** Client-side unieke id voor een nieuwe persona-kaart. */
function newId(): string {
  return `persona-${Math.random().toString(36).slice(2, 9)}`;
}

interface PersonaBuilderProps {
  /** Meerdere persona's toestaan (Multi-Persona) of precies één (Persona Prompting). */
  multi: boolean;
  /** Admin-AI-instellingen voor de invulhulp. */
  settings: AiSettings;
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
 * persona zeven gerichte vragen (rol, ervaring, belang, focus, wat-niet, toon,
 * blinde vlek). Bij Multi-Persona kan de gebruiker meerdere persona's toevoegen.
 * Weet de gebruiker de details niet, dan vult de AI de velden in op basis van een
 * korte aanduiding ("mijn teammanager") — bewerkbaar, met een AI-suggestie-label.
 */
export default function PersonaBuilder({ multi, settings, context, onSerialized }: PersonaBuilderProps) {
  const [personas, setPersonas] = useState<PersonaEntry[]>(() => [emptyPersona(newId())]);
  // Per persona-id: welke velden zijn door de AI ingevuld (voor het suggestie-label).
  const [aiFields, setAiFields] = useState<Record<string, Set<PersonaFieldKey>>>({});
  // Per persona-id: draait de AI-invulhulp nu?
  const [busyId, setBusyId] = useState<string | null>(null);

  // Meld de geserialiseerde tekst terug zodra de persona's wijzigen.
  useEffect(() => {
    onSerialized(serializePersonas(personas));
    // onSerialized is stabiel genoeg (setter uit de ouder); alleen op personas reageren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas]);

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
        questions: PERSONA_QUESTIONS.map((q) => ({ id: q.id, label: q.label, why: q.why })),
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
      const touched = new Set<PersonaFieldKey>();
      setPersonas((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          const fields = { ...p.fields };
          for (const f of res.fields) {
            const key = f.id as PersonaFieldKey;
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
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Beschrijf {multi ? 'de persona’s' : 'de persona'} vanuit wie of voor wie de AI schrijft. Hoe
        scherper, hoe beter het resultaat. Weet je iets niet? Geef een korte aanduiding en laat de AI
        de velden invullen — je kunt alles daarna aanpassen.
      </p>

      {personas.map((persona, idx) => (
        <PersonaCard
          key={persona.id}
          index={idx}
          total={personas.length}
          multi={multi}
          persona={persona}
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

/** Eén persona-kaart: de aanduiding + AI-invulhulp bovenaan, daaronder de 7 vragen. */
function PersonaCard({
  index,
  total,
  multi,
  persona,
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
              — {persona.hint.trim()}
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
      <div className="mb-4 rounded-lg border border-rijksblauw-200 bg-rijksblauw-50/40 p-3 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
        <label className="opl-label mb-1 block" htmlFor={`persona-hint-${persona.id}`}>
          Korte aanduiding <span className="font-normal text-slate-400">(optioneel)</span>
        </label>
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
            className="opl-btn-secondary shrink-0"
            onClick={onAiFill}
            disabled={busy || !persona.hint.trim()}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {busy ? 'Invullen…' : 'Vul aan met AI'}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Weet je de details niet? Geef een korte aanduiding en laat de AI de velden hieronder invullen.
        </p>
      </div>

      {/* De zeven persona-vragen. */}
      <div className="space-y-3">
        {PERSONA_QUESTIONS.map((q) => {
          const isAi = aiFields?.has(q.id);
          return (
            <div key={q.id}>
              <label
                className="opl-label mb-0.5 flex flex-wrap items-center gap-2"
                htmlFor={`persona-${persona.id}-${q.id}`}
              >
                <span>{q.label}</span>
                {isAi && <PrefillBadge source="ai" />}
              </label>
              <textarea
                id={`persona-${persona.id}-${q.id}`}
                className={clsx(
                  'opl-input min-h-[52px] resize-y text-sm',
                  isAi && 'border-rijksoranje/40 bg-rijksoranje/5 dark:bg-rijksoranje/10',
                )}
                value={persona.fields[q.id] ?? ''}
                placeholder={q.placeholder}
                onChange={(e) => onFieldChange(q.id, e.target.value)}
              />
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{q.why}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
