import { useState } from 'react';
import toast from 'react-hot-toast';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { createPrompt } from '@/services/repository';
import { trackEvent } from '@/services/analyticsService';
import { getCurrentUser, SHARING_LEVELS } from '@/lib/utils';
import type { NewPromptInput, Prompt, SharingLevel } from '@/types';

interface PromptUploadFormProps {
  onCreated: (prompt: Prompt) => void;
  onCancel?: () => void;
}

export default function PromptUploadForm({ onCreated, onCancel }: PromptUploadFormProps) {
  const { categories, roles, organizations } = useReferenceData();
  const requireAuth = useAuthGuard();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [roleId, setRoleId] = useState<string>('');
  const [organizationId, setOrganizationId] = useState<string>('');
  const [sharing, setSharing] = useState<SharingLevel>('private');
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
      category_id: categoryId || null,
      role_id: roleId || null,
      organization_id: organizationId || null,
      sharing_level: sharing,
      created_by: createdBy.trim(),
    };
    try {
      const prompt = await createPrompt(input);
      void trackEvent({
        event_type: 'prompt_created',
        user_identifier: input.created_by,
        prompt_id: prompt.id,
      });
      toast.success('Prompt opgeslagen');
      onCreated(prompt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt';
      toast.error(msg);
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
          className="opl-input min-h-[140px] resize-y font-mono text-[13px]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="De oorspronkelijke prompt…"
          aria-invalid={!!errors.content}
        />
        {errors.content && <p className="mt-1 text-xs text-rijksrood">{errors.content}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="opl-label" htmlFor="up-category">
            Categorie
          </label>
          <select
            id="up-category"
            className="opl-input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Geen categorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="opl-label" htmlFor="up-role">
            Rol
          </label>
          <select
            id="up-role"
            className="opl-input"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">Geen rol</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="opl-label" htmlFor="up-sharing">
            Deelniveau
          </label>
          <select
            id="up-sharing"
            className="opl-input"
            value={sharing}
            onChange={(e) => setSharing(e.target.value as SharingLevel)}
          >
            {SHARING_LEVELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} — {s.description}
              </option>
            ))}
          </select>
        </div>

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
