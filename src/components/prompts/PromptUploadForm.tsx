import { useState } from 'react';
import { notify } from '@/lib/notify';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { createPrompt } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { requestCategory } from '@/services/categoryRequestService';
import { requestFunction } from '@/services/functionRequestService';
import { getCurrentUser } from '@/lib/utils';
import { usePersistentDraft } from '@/lib/usePersistentDraft';
import SearchableSelect from '@/components/common/SearchableSelect';
import VisibilityPicker from '@/components/prompts/VisibilityPicker';
import type { NewPromptInput, Prompt, VisibilityLevel } from '@/types';

interface PromptUploadFormProps {
  onCreated: (prompt: Prompt) => void;
  onCancel?: () => void;
}

export default function PromptUploadForm({ onCreated, onCancel }: PromptUploadFormProps) {
  const { categories, roles, organizations } = useReferenceData();
  const { user } = useAuth();
  const requireAuth = useAuthGuard();
  // De tekstvelden staan als concept in localStorage: sluit het venster per
  // ongeluk (Escape, kruisje, klik ernaast), dan staat de tekst er bij het
  // heropenen weer. Pas na opslaan wordt het concept gewist.
  const [title, setTitle, clearTitle] = usePersistentDraft('upload.title');
  const [description, setDescription, clearDescription] = usePersistentDraft('upload.description');
  const [content, setContent, clearContent] = usePersistentDraft('upload.content');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string>('');
  const [sharingLevels, setSharingLevels] = useState<VisibilityLevel[]>([]);
  const [createdBy, setCreatedBy] = useState(getCurrentUser());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Titel is verplicht.';
    if (!content.trim()) next.content = 'Prompt-inhoud is verplicht.';
    if (!createdBy.trim()) next.createdBy = 'Vul je naam in.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!requireAuth('Log in om een prompt op te slaan.')) return;
    setSubmitting(true);
    const input: NewPromptInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      content: content.trim(),
      category_id: categoryId,
      role_id: roleId,
      organization_id: organizationId || null,
      sharing_levels: sharingLevels,
      created_by: createdBy.trim(),
    };
    try {
      const prompt = await createPrompt(input);
      void trackEvent({
        event_type: 'prompt_created',
        user_identifier: input.created_by,
        prompt_id: prompt.id,
      });
      notify.success('Prompt opgeslagen');
      clearTitle();
      clearDescription();
      clearContent();
      onCreated(prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt';
      notify.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="opl-label" htmlFor="up-title">
          Titel <span className="text-rijksrood">*</span>
        </label>
        <input
          id="up-title"
          className="opl-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bijv. Begrijpelijke afwijzingsbrief"
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="mt-1 text-xs text-rijksrood">{errors.title}</p>}
      </div>

      <div>
        <label className="opl-label" htmlFor="up-desc">
          Omschrijving
        </label>
        <input
          id="up-desc"
          className="opl-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Korte uitleg over wat deze prompt doet"
        />
      </div>

      <div>
        <label className="opl-label" htmlFor="up-content">
          Prompt-inhoud <span className="text-rijksrood">*</span>
        </label>
        <textarea
          id="up-content"
          className="opl-input min-h-[140px] resize-y font-mono text-[0.8125rem]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="De oorspronkelijke prompt…"
          aria-invalid={!!errors.content}
        />
        {errors.content && <p className="mt-1 text-xs text-rijksrood">{errors.content}</p>}
      </div>

      <div>
        <label className="opl-label" htmlFor="up-category">
          Categorie
        </label>
        <SearchableSelect
          id="up-category"
          options={categories.map((c) => ({ id: c.id, label: c.name, hint: c.description }))}
          value={categoryId}
          onChange={(id) => setCategoryId(id)}
          placeholder="Waar is deze prompt voor bedoeld?"
          clearLabel="Geen categorie"
          searchPlaceholder="Zoek een categorie…"
          onRequestNew={
            user
              ? async (term) => {
                  try {
                    await requestCategory({ name: term, requestedBy: user.id });
                    notify.success(`Aanvraag voor “${term}” verstuurd; een beheerder beoordeelt hem.`);
                  } catch (err) {
                    notify.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
                  }
                }
              : undefined
          }
          requestNewLabel={(term) => `“${term}” als nieuwe categorie aanvragen`}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Waar is deze prompt voor bedoeld? Staat de juiste categorie er niet bij? Vraag hem aan.
        </p>
      </div>

      <div>
        <label className="opl-label" htmlFor="up-role">
          Functie
        </label>
        <SearchableSelect
          id="up-role"
          options={roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))}
          value={roleId}
          onChange={(id) => setRoleId(id)}
          placeholder="Voor welke functie is deze prompt geschreven?"
          clearLabel="Geen functie"
          searchPlaceholder="Zoek een functie…"
          onRequestNew={
            user
              ? async (term) => {
                  try {
                    await requestFunction({ name: term, requestedBy: user.id });
                    notify.success(`Aanvraag voor “${term}” verstuurd; een beheerder beoordeelt hem.`);
                  } catch (err) {
                    notify.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
                  }
                }
              : undefined
          }
          requestNewLabel={(term) => `“${term}” als nieuwe functie aanvragen`}
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Voor welke functie is deze prompt geschreven? Staat de juiste functie er niet bij? Vraag hem aan.
        </p>
      </div>

      {organizations.length > 0 && (
        <div>
          <label className="opl-label" htmlFor="up-organization">
            Organisatie
          </label>
          <select
            id="up-organization"
            className="opl-input"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            <option value="">Geen organisatie</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code ? `${o.name} (${o.code})` : o.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Koppel deze prompt aan een ministerie of afdeling, zodat hij vindbaar is via de netwerkverkenner.
          </p>
        </div>
      )}

      <VisibilityPicker idPrefix="up" value={sharingLevels} onChange={setSharingLevels} />

      <div>
        <label className="opl-label" htmlFor="up-author">
          Jouw naam <span className="text-rijksrood">*</span>
        </label>
        <input
          id="up-author"
          className="opl-input"
          value={createdBy}
          onChange={(e) => setCreatedBy(e.target.value)}
          placeholder="Voor- en achternaam"
          aria-invalid={!!errors.createdBy}
        />
        {errors.createdBy && <p className="mt-1 text-xs text-rijksrood">{errors.createdBy}</p>}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button type="button" className="opl-btn-secondary" onClick={onCancel}>
            Annuleren
          </button>
        )}
        <button type="submit" className="opl-btn-primary" disabled={submitting}>
          {submitting ? 'Opslaan…' : 'Prompt opslaan'}
        </button>
      </div>
    </form>
  );
}
