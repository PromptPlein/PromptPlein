import { useEffect, useRef, useState } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { getCurrentUser } from '@/lib/utils';
import { createPrompt } from '@/services/repository';
import { generateMetadata } from '@/services/optimizeService';
import { requestCategory } from '@/services/categoryRequestService';
import { requestFunction } from '@/services/functionRequestService';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import SearchableSelect from '@/components/common/SearchableSelect';
import VisibilityPicker from '@/components/prompts/VisibilityPicker';
import type { Prompt, Technique, VisibilityLevel } from '@/types';
import '@nldd/design-system/banner';
import '@nldd/design-system/box';
import '@nldd/design-system/button';
import '@nldd/design-system/button-group';
import '@nldd/design-system/container';
import '@nldd/design-system/form-field';
import '@nldd/design-system/text-field';

interface SavePromptPanelProps {
  /** De prompt-inhoud die wordt opgeslagen. */
  content: string;
  /** De gekozen techniek (voor de standaardtitel als de AI-suggestie faalt). */
  technique?: Technique | null;
  /** Het doel dat de gebruiker beschreef (voor een zinvolle standaardtitel). */
  goal?: string;
  onSaved: (prompt: Prompt) => void;
  onCancel: () => void;
  /**
   * Zonder de omlijnde kaartstijl renderen — voor gebruik binnen een modal
   * (de chat), waar de modal zelf al het kader is.
   */
  frameless?: boolean;
}

/**
 * Het opslagformulier voor een prompt: AI-gesuggereerde titel/omschrijving/
 * categorie, functie- en organisatiekeuze, zichtbaarheid en de aanvraagpanelen
 * voor ontbrekende categorieën/functies. Losgemaakt uit OptimizedOutput zodat
 * de chat ("Bewaar als prompt") hetzelfde formulier gebruikt.
 */
type FieldElement = HTMLElement & { value?: string };

export default function SavePromptPanel({
  content,
  technique,
  goal,
  onSaved,
  onCancel,
  frameless = false,
}: SavePromptPanelProps) {
  const { profile, user, isAuthenticated, isAdmin } = useAuth();
  const { categories, roles, organizations } = useReferenceData();

  // Start leeg: tijdens het laden zien we alleen het laadscherm, geen oude
  // standaardtitel die later "verspringt" naar de AI-suggestie.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Categorie en organisatie moeten net als bij het uploaden gekozen kunnen worden.
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Functie: voor welke functie is deze prompt geschreven (zelfde keuze als bij het uploaden).
  const [roleId, setRoleId] = useState<string | null>(null);
  // Organisatie staat standaard op die van de gebruiker (uit het profiel), zodat
  // de template meteen aan de eigen afdeling/ministerie gekoppeld is. De maker
  // kan dit aanpassen. We onthouden of de gebruiker het veld zelf heeft gewijzigd.
  const [organizationId, setOrganizationId] = useState<string>(profile?.organization_id ?? '');
  const organizationTouched = useRef(false);
  // Standaard privé (geen enkel niveau aangevinkt): de maker deelt pas bewust.
  // Dit is de veiligste default — niemand deelt per ongeluk met de afdeling,
  // het ministerie of de hele Rijksoverheid.
  const [sharingLevels, setSharingLevels] = useState<VisibilityLevel[]>([]);
  const sharingTouched = useRef(false);
  const [saving, setSaving] = useState(false);
  // AI-suggestie (titel + omschrijving + categorie) op basis van de inhoud,
  // één keer ophalen bij het openen van het formulier.
  const [metaLoading, setMetaLoading] = useState(false);
  // Refs bewaken of de gebruiker een veld zelf heeft aangepast, zodat een laat
  // binnenkomende AI-suggestie hun invoer niet overschrijft (geen stale closure).
  const titleTouched = useRef(false);
  const descTouched = useRef(false);
  const categoryTouched = useRef(false);
  // Categorie-aanvraag: paneel om een ontbrekende categorie aan te vragen.
  const [showCatRequest, setShowCatRequest] = useState(false);
  const [catRequestName, setCatRequestName] = useState('');
  const [catRequestBusy, setCatRequestBusy] = useState(false);
  // Naam van de aangevraagde categorie zodra de aanvraag is verstuurd (pending).
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  // Functie-aanvraag: paneel om een ontbrekende functie aan te vragen (zelfde
  // patroon als de categorie-aanvraag hierboven).
  const [showRoleRequest, setShowRoleRequest] = useState(false);
  const [roleRequestName, setRoleRequestName] = useState('');
  const [roleRequestBusy, setRoleRequestBusy] = useState(false);
  // Naam van de aangevraagde functie zodra de aanvraag is verstuurd (pending).
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  const titleRef = useRef<FieldElement>(null);
  const descRef = useRef<FieldElement>(null);
  const catRequestRef = useRef<FieldElement>(null);
  const roleRequestRef = useRef<FieldElement>(null);
  useNlddValue(titleRef, metaLoading ? '' : title, (value) => {
    titleTouched.current = true;
    setTitle(value);
  });
  useNlddValue(descRef, metaLoading ? '' : description, (value) => {
    descTouched.current = true;
    setDescription(value);
  });
  useNlddValue(catRequestRef, catRequestName, setCatRequestName);
  useNlddValue(roleRequestRef, roleRequestName, setRoleRequestName);

  // The request field takes the focus when it opens, except on a touch screen,
  // where the keyboard would cover the form.
  useEffect(() => {
    if (showCatRequest && !window.matchMedia('(pointer: coarse)').matches) catRequestRef.current?.focus();
  }, [showCatRequest]);
  useEffect(() => {
    if (showRoleRequest && !window.matchMedia('(pointer: coarse)').matches) roleRequestRef.current?.focus();
  }, [showRoleRequest]);

  // Het profiel laadt asynchroon: zodra de organisatie van de gebruiker bekend is
  // en de gebruiker het veld nog niet zelf koos, vullen we de organisatie voor op
  // die van het profiel. De zichtbaarheid blijft bewust op privé (standaard) staan.
  useEffect(() => {
    if (!profile?.organization_id) return;
    if (!organizationTouched.current && !organizationId) {
      setOrganizationId(profile.organization_id);
    }
  }, [profile?.organization_id, organizationId]);

  // AI-metadata één keer ophalen bij het openen van het formulier; de
  // touched-refs beschermen wat de gebruiker ondertussen zelf typte.
  const metaRequestedRef = useRef(false);
  useEffect(() => {
    if (metaRequestedRef.current) return;
    metaRequestedRef.current = true;
    setMetaLoading(true);
    generateMetadata({
      templateContent: content,
      categories: categories.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    })
      .then((meta) => {
        // Elk veld alleen voorvullen als de gebruiker het nog niet zelf raakte.
        if (!titleTouched.current) setTitle(meta.title || defaultTitle(technique, goal));
        if (!descTouched.current && meta.description) setDescription(meta.description);
        if (!categoryTouched.current && meta.category_id) setCategoryId(meta.category_id);
      })
      .catch(() => {
        if (!titleTouched.current) setTitle(defaultTitle(technique, goal));
      })
      .finally(() => setMetaLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Dien een aanvraag in voor een ontbrekende categorie. */
  async function submitCategoryRequest() {
    const name = catRequestName.trim();
    if (!name) {
      notify.error('Geef de categorie een naam.');
      return;
    }
    if (!user) {
      notify.error('Log in om een categorie aan te vragen.');
      return;
    }
    setCatRequestBusy(true);
    try {
      await requestCategory({ name, requestedBy: user.id });
      // Categorie nog niet beschikbaar: laat de keuze leeg (status blijft 'anders'
      // tot een beheerder de categorie goedkeurt) en toon de aanvraag als pending.
      categoryTouched.current = true;
      setCategoryId(null);
      setPendingCategory(name);
      setShowCatRequest(false);
      setCatRequestName('');
      notify.success(`Aanvraag voor “${name}” verstuurd; een beheerder beoordeelt hem.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
    } finally {
      setCatRequestBusy(false);
    }
  }

  /** Dien een aanvraag in voor een ontbrekende functie. */
  async function submitRoleRequest() {
    const name = roleRequestName.trim();
    if (!name) {
      notify.error('Geef de functie een naam.');
      return;
    }
    if (!user) {
      notify.error('Log in om een functie aan te vragen.');
      return;
    }
    setRoleRequestBusy(true);
    try {
      await requestFunction({ name, requestedBy: user.id });
      // Functie nog niet beschikbaar: laat de keuze leeg tot een beheerder de
      // functie goedkeurt en toon de aanvraag als pending.
      setRoleId(null);
      setPendingRole(name);
      setShowRoleRequest(false);
      setRoleRequestName('');
      notify.success(`Aanvraag voor “${name}” verstuurd; een beheerder beoordeelt hem.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
    } finally {
      setRoleRequestBusy(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      notify.error('Geef je prompt een titel.');
      return;
    }
    // Opslaan vereist een ingelogde gebruiker: de RLS-policy op `prompts` staat
    // alleen inserts toe voor de rol `authenticated`. Zonder sessie geeft Supabase
    // een 403 die voor de gebruiker nietszeggend is — vang dat hier af.
    if (!isAuthenticated) {
      notify.error('Log in om deze prompt op te slaan in de bibliotheek.');
      return;
    }
    // Afdeling/ministerie delen vereist een organisatie om op te richten — anders
    // weet niemand met welke afdeling de template gedeeld is.
    const needsOrg = sharingLevels.includes('department') || sharingLevels.includes('ministry');
    if (needsOrg && !organizationId) {
      notify.error('Kies een organisatie om de prompt met je afdeling of ministerie te delen.');
      return;
    }
    setSaving(true);
    try {
      const prompt = await createPrompt({
        title: title.trim(),
        description: description.trim() || undefined,
        content,
        category_id: categoryId,
        role_id: roleId,
        organization_id: organizationId || null,
        sharing_levels: sharingLevels,
        created_by: profile?.full_name || getCurrentUser() || 'Onbekend',
      });
      notify.success('Prompt opgeslagen in de bibliotheek');
      onSaved(prompt);
    } catch (err) {
      notify.error(humanizeSaveError(err));
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <nldd-container gap="16">
      {/* Saving needs a signed-in user (RLS on `prompts`). Say so at once
          instead of failing with a 401 on save. */}
      {!isAuthenticated && (
        <nldd-banner
          variant="warning"
          size="sm"
          text="Je bent niet ingelogd."
          supporting-text="Om een prompt in de bibliotheek op te slaan moet je eerst inloggen. Je kunt de prompt ondertussen wel kopiëren."
        >
          <nldd-button slot="actions" appearance="secondary" text="Inloggen" href="/auth/login"></nldd-button>
        </nldd-banner>
      )}

      <nldd-form-field label="Titel van de prompt">
        <nldd-text-field
          ref={titleRef}
          disabled={metaLoading || undefined}
          placeholder={metaLoading ? 'Titel wordt bedacht…' : 'Bijv. Vriendelijke afwijzingsbrief aan burger'}
        ></nldd-text-field>
        <nldd-form-field-help-text>
          {metaLoading
            ? 'AI bedenkt een titel, omschrijving en categorie op basis van de inhoud…'
            : 'Voorgesteld op basis van de inhoud; pas alles gerust aan.'}
        </nldd-form-field-help-text>
      </nldd-form-field>

      <nldd-form-field label="Omschrijving" optional>
        <nldd-text-field
          ref={descRef}
          disabled={metaLoading || undefined}
          placeholder={metaLoading ? 'Omschrijving wordt bedacht…' : 'Korte uitleg over wat deze prompt doet'}
        ></nldd-text-field>
      </nldd-form-field>

      <nldd-container gap="8">
        <nldd-form-field label="Categorie" optional>
          <SearchableSelect
            id="tpl-category"
            options={categories.map((c) => ({ id: c.id, label: c.name, hint: c.description }))}
            value={categoryId}
            onChange={(id) => {
              categoryTouched.current = true;
              setCategoryId(id);
              if (id) setPendingCategory(null); // a real choice replaces a request
            }}
            placeholder="Waar is deze prompt voor bedoeld?"
            clearLabel="Geen categorie"
            searchPlaceholder="Zoek een categorie…"
          />
          <nldd-form-field-help-text>
            Zo vinden collega&apos;s waar deze prompt voor bedoeld is.
          </nldd-form-field-help-text>
        </nldd-form-field>

        {/* A requested category that is not approved yet: the status stays 'anders'. */}
        {pendingCategory && (
          <nldd-banner
            variant="warning"
            size="sm"
            icon="clock"
            text={`Categorie “${pendingCategory}” aangevraagd, in afwachting van goedkeuring.`}
          ></nldd-banner>
        )}

        {!showCatRequest ? (
          <nldd-container layout="row">
            <nldd-button
              appearance="neutral-transparent"
              size="sm"
              start-icon="add"
              text="Mijn categorie zit er niet tussen"
              onClick={() => {
                setShowCatRequest(true);
                setCatRequestName('');
              }}
            ></nldd-button>
          </nldd-container>
        ) : (
          <RequestBox
            fieldRef={catRequestRef}
            label="Nieuwe categorie aanvragen"
            placeholder="Naam van de categorie, bijv. Inkoop & Aanbesteding"
            help="Een beheerder beoordeelt je aanvraag. Tot die tijd blijft de categorie op “anders”."
            busy={catRequestBusy}
            onSubmit={() => void submitCategoryRequest()}
            onCancel={() => setShowCatRequest(false)}
          />
        )}
      </nldd-container>

      <nldd-container gap="8">
        <nldd-form-field label="Functie" optional>
          <SearchableSelect
            id="tpl-role"
            options={roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))}
            value={roleId}
            onChange={(id) => {
              setRoleId(id);
              if (id) setPendingRole(null); // a real choice replaces a request
            }}
            placeholder="Voor welke functie is deze prompt geschreven?"
            clearLabel="Geen functie"
            searchPlaceholder="Zoek een functie…"
          />
          <nldd-form-field-help-text>Voor welke functie is deze prompt geschreven?</nldd-form-field-help-text>
        </nldd-form-field>

        {pendingRole && (
          <nldd-banner
            variant="warning"
            size="sm"
            icon="clock"
            text={`Functie “${pendingRole}” aangevraagd, in afwachting van goedkeuring.`}
          ></nldd-banner>
        )}

        {!showRoleRequest ? (
          <nldd-container layout="row">
            <nldd-button
              appearance="neutral-transparent"
              size="sm"
              start-icon="add"
              text="Mijn functie zit er niet tussen"
              onClick={() => {
                setShowRoleRequest(true);
                setRoleRequestName('');
              }}
            ></nldd-button>
          </nldd-container>
        ) : (
          <RequestBox
            fieldRef={roleRequestRef}
            label="Nieuwe functie aanvragen"
            placeholder="Naam van de functie, bijv. Beleidsmedewerker Inkoop"
            help="Een beheerder beoordeelt je aanvraag. Tot die tijd laat je de functie leeg."
            busy={roleRequestBusy}
            onSubmit={() => void submitRoleRequest()}
            onCancel={() => setShowRoleRequest(false)}
          />
        )}
      </nldd-container>

      {organizations.length > 0 && (
        <nldd-form-field label="Organisatie" optional>
          {/* Admins may pick any organization (or none). A normal user can only
              link their own organization: the field is then locked to the one
              from the profile. */}
          <SearchableSelect
            id="tpl-organization"
            options={organizations.map((o) => ({
              id: o.id,
              label: o.code ? `${o.name} (${o.code})` : o.name,
            }))}
            value={organizationId || null}
            disabled={!isAdmin}
            onChange={(id) => {
              organizationTouched.current = true;
              setOrganizationId(id ?? '');
            }}
            placeholder="Geen organisatie"
            clearLabel={isAdmin || !organizationId ? 'Geen organisatie' : undefined}
            searchPlaceholder="Zoek een organisatie…"
          />
          <nldd-form-field-help-text>
            {isAdmin
              ? 'Koppel deze prompt aan een ministerie of afdeling, zodat hij vindbaar is via de netwerkverkenner.'
              : 'Deze prompt wordt gekoppeld aan jouw eigen organisatie, zodat hij vindbaar is via de netwerkverkenner.'}
          </nldd-form-field-help-text>
        </nldd-form-field>
      )}

      <VisibilityPicker
        idPrefix="tpl"
        value={sharingLevels}
        onChange={(next) => {
          sharingTouched.current = true;
          setSharingLevels(next);
        }}
      />

      <nldd-button-group>
        <nldd-button
          appearance="primary"
          start-icon="save"
          text="Opslaan"
          loading={saving || undefined}
          loading-text="Bezig met opslaan"
          disabled={!isAuthenticated || undefined}
          onClick={() => void handleSave()}
        ></nldd-button>
        <nldd-button
          appearance="secondary"
          text="Annuleren"
          disabled={saving || undefined}
          onClick={onCancel}
        ></nldd-button>
      </nldd-button-group>
    </nldd-container>
  );

  if (frameless) return form;
  return (
    <nldd-box background="accent-tinted">
      <nldd-container padding="16">{form}</nldd-container>
    </nldd-box>
  );
}

/** The small form to request a missing category or role. */
function RequestBox({
  fieldRef,
  label,
  placeholder,
  help,
  busy,
  onSubmit,
  onCancel,
}: {
  fieldRef: React.RefObject<FieldElement>;
  label: string;
  placeholder: string;
  help: string;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <nldd-box background="base">
      <nldd-container padding="12" gap="8">
        <nldd-form-field label={label}>
          <nldd-text-field
            ref={fieldRef}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
              }
            }}
          ></nldd-text-field>
          <nldd-form-field-help-text>{help}</nldd-form-field-help-text>
        </nldd-form-field>
        <nldd-button-group size="sm">
          <nldd-button
            appearance="primary"
            text="Aanvragen"
            loading={busy || undefined}
            loading-text="Bezig met versturen"
            onClick={onSubmit}
          ></nldd-button>
          <nldd-button appearance="secondary" text="Annuleren" disabled={busy || undefined} onClick={onCancel}></nldd-button>
        </nldd-button-group>
      </nldd-container>
    </nldd-box>
  );
}

/**
 * Vertaal een opslag-fout naar een begrijpelijke melding. De ruwe Supabase-fout
 * (401, of een RLS-overtreding) zegt de gebruiker niets — een 401/JWT-fout
 * betekent vrijwel altijd dat de sessie ontbreekt of is verlopen.
 */
function humanizeSaveError(err: unknown): string {
  // Supabase/PostgREST-fouten dragen vaak een `code` en/of `status`.
  const e = err as { code?: string; status?: number; message?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  const isAuthIssue =
    e?.status === 401 ||
    e?.code === 'PGRST301' || // JWT ontbreekt/ongeldig
    msg.includes('jwt') ||
    msg.includes('unauthorized');
  if (isAuthIssue) {
    return 'Je bent niet (meer) ingelogd. Log opnieuw in om de prompt op te slaan.';
  }
  // Een RLS-weigering is geen loginprobleem: createPrompt controleert de sessie
  // al vóór de insert. Wie hier komt is ingelogd, maar de database staat het niet toe.
  const isRlsDenied =
    e?.code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('row level security');
  if (isRlsDenied) {
    return 'De database staat het opslaan van deze prompt niet toe. Je bent wel ingelogd; meld dit bij de beheerder.';
  }
  return e?.message || 'Opslaan mislukt';
}

/** Stel een zinvolle standaardtitel voor op basis van techniek en doel. */
function defaultTitle(technique?: Technique | null, goal?: string): string {
  const g = (goal ?? '').trim();
  if (g) {
    const short = g.length > 60 ? `${g.slice(0, 57)}…` : g;
    // Eerste letter hoofdletter voor een nettere titel.
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  return technique ? `${technique.name}-prompt` : 'Nieuwe prompt';
}
