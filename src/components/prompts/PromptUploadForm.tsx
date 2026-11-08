import { useRef, useState } from 'react';
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
import { useNlddValue } from '@/lib/nldd';
import SearchableSelect from '@/components/common/SearchableSelect';
import VisibilityPicker from '@/components/prompts/VisibilityPicker';
import type { NewPromptInput, Prompt, VisibilityLevel } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/form';
import '@nldd/design-system/form-actions';
import '@nldd/design-system/form-field';
import '@nldd/design-system/multi-line-text-field';
import '@nldd/design-system/text-field';

interface PromptUploadFormProps {
  onCreated: (prompt: Prompt) => void;
  onCancel?: () => void;
}

type FieldElement = HTMLElement & { value?: string };

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
  const titleRef = useRef<FieldElement>(null);
  const descriptionRef = useRef<FieldElement>(null);
  const contentRef = useRef<FieldElement>(null);
  const authorRef = useRef<FieldElement>(null);
  useNlddValue(titleRef, title, setTitle);
  useNlddValue(descriptionRef, description, setDescription);
  useNlddValue(contentRef, content, setContent);
  useNlddValue(authorRef, createdBy, setCreatedBy);

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
    <nldd-form>
      <form noValidate onSubmit={handleSubmit}>
        <nldd-form-field label="Titel">
          <nldd-text-field
            ref={titleRef}
            placeholder="Bijv. Begrijpelijke afwijzingsbrief"
            invalid={!!errors.title || undefined}
          ></nldd-text-field>
          {errors.title && <nldd-form-field-help-text>{errors.title}</nldd-form-field-help-text>}
        </nldd-form-field>

        <nldd-form-field label="Omschrijving" optional>
          <nldd-text-field
            ref={descriptionRef}
            placeholder="Korte uitleg over wat deze prompt doet"
          ></nldd-text-field>
        </nldd-form-field>

        <nldd-form-field label="Prompt-inhoud">
          <nldd-multi-line-text-field
            ref={contentRef}
            rows={6}
            placeholder="De oorspronkelijke prompt…"
            invalid={!!errors.content || undefined}
          ></nldd-multi-line-text-field>
          {errors.content && <nldd-form-field-help-text>{errors.content}</nldd-form-field-help-text>}
        </nldd-form-field>

        <nldd-form-field label="Categorie" optional>
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
          <nldd-form-field-help-text>
            Waar is deze prompt voor bedoeld? Staat de juiste categorie er niet bij? Vraag hem aan.
          </nldd-form-field-help-text>
        </nldd-form-field>

        <nldd-form-field label="Functie" optional>
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
          <nldd-form-field-help-text>
            Voor welke functie is deze prompt geschreven? Staat de juiste functie er niet bij? Vraag hem aan.
          </nldd-form-field-help-text>
        </nldd-form-field>

        {organizations.length > 0 && (
          <nldd-form-field label="Organisatie" optional>
            <SearchableSelect
              id="up-organization"
              options={organizations.map((o) => ({
                id: o.id,
                label: o.code ? `${o.name} (${o.code})` : o.name,
              }))}
              value={organizationId || null}
              onChange={(id) => setOrganizationId(id ?? '')}
              placeholder="Geen organisatie"
              clearLabel="Geen organisatie"
              searchPlaceholder="Zoek een organisatie…"
            />
            <nldd-form-field-help-text>
              Koppel deze prompt aan een ministerie of afdeling, zodat hij vindbaar is via de netwerkverkenner.
            </nldd-form-field-help-text>
          </nldd-form-field>
        )}

        <VisibilityPicker idPrefix="up" value={sharingLevels} onChange={setSharingLevels} />

        <nldd-form-field label="Jouw naam">
          <nldd-text-field
            ref={authorRef}
            autocomplete="name"
            placeholder="Voor- en achternaam"
            invalid={!!errors.createdBy || undefined}
          ></nldd-text-field>
          {errors.createdBy && <nldd-form-field-help-text>{errors.createdBy}</nldd-form-field-help-text>}
        </nldd-form-field>

        <nldd-form-actions>
          <nldd-button-group>
            <nldd-button
              appearance="primary"
              type="submit"
              text="Sla prompt op"
              loading={submitting || undefined}
              loading-text="Bezig met opslaan"
            ></nldd-button>
            {onCancel && <nldd-button appearance="secondary" text="Annuleren" onClick={onCancel}></nldd-button>}
          </nldd-button-group>
        </nldd-form-actions>
      </form>
    </nldd-form>
  );
}
