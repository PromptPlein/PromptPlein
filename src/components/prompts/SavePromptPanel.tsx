import { useEffect, useRef, useState } from 'react';
import { Loader2, Save, Sparkles } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
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
      toast.error('Geef de categorie een naam.');
      return;
    }
    if (!user) {
      toast.error('Log in om een categorie aan te vragen.');
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
      toast.success(`Aanvraag voor “${name}” verstuurd; een beheerder beoordeelt hem.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
    } finally {
      setCatRequestBusy(false);
    }
  }

  /** Dien een aanvraag in voor een ontbrekende functie. */
  async function submitRoleRequest() {
    const name = roleRequestName.trim();
    if (!name) {
      toast.error('Geef de functie een naam.');
      return;
    }
    if (!user) {
      toast.error('Log in om een functie aan te vragen.');
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
      toast.success(`Aanvraag voor “${name}” verstuurd; een beheerder beoordeelt hem.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
    } finally {
      setRoleRequestBusy(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Geef je prompt een titel.');
      return;
    }
    // Opslaan vereist een ingelogde gebruiker: de RLS-policy op `prompts` staat
    // alleen inserts toe voor de rol `authenticated`. Zonder sessie geeft Supabase
    // een 403 die voor de gebruiker nietszeggend is — vang dat hier af.
    if (!isAuthenticated) {
      toast.error('Log in om deze prompt op te slaan in de bibliotheek.');
      return;
    }
    // Afdeling/ministerie delen vereist een organisatie om op te richten — anders
    // weet niemand met welke afdeling de template gedeeld is.
    const needsOrg = sharingLevels.includes('department') || sharingLevels.includes('ministry');
    if (needsOrg && !organizationId) {
      toast.error('Kies een organisatie om de prompt met je afdeling of ministerie te delen.');
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
      toast.success('Prompt opgeslagen in de bibliotheek');
      onSaved(prompt);
    } catch (err) {
      toast.error(humanizeSaveError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={
        frameless
          ? 'space-y-3'
          : 'space-y-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10'
      }
    >
      {/* Opslaan vereist een ingelogde gebruiker (RLS op `prompts`). Maak dat
          meteen duidelijk in plaats van een 401 bij het opslaan. */}
      {!isAuthenticated && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          Je bent niet ingelogd. Om een prompt in de bibliotheek op te slaan moet je eerst{' '}
          <Link
            to="/auth/login"
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            inloggen
          </Link>
          . Je kunt de prompt ondertussen wel kopiëren.
        </div>
      )}
      <div>
        <label className="opl-label" htmlFor="tpl-title">
          Titel van de prompt
        </label>
        <div className="relative">
          <input
            id="tpl-title"
            className="opl-input pr-10"
            value={metaLoading ? '' : title}
            disabled={metaLoading}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
            placeholder={
              metaLoading
                ? 'Titel wordt bedacht…'
                : 'Bijv. Vriendelijke afwijzingsbrief aan burger'
            }
          />
          {/* Positionering (translate) op de wrapper, de rotatie (animate-spin)
              op het icoon zelf. Anders botsen beide om dezelfde CSS-transform
              en lijkt de spinner op-en-neer te stuiteren i.p.v. rond te draaien. */}
          {metaLoading && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 size={16} className="animate-spin text-rijksblauw-400" aria-hidden />
            </span>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles size={12} />
          {metaLoading
            ? 'AI bedenkt een titel, omschrijving en categorie op basis van de inhoud…'
            : 'Voorgesteld op basis van de inhoud; pas alles gerust aan.'}
        </p>
      </div>
      <div>
        <label className="opl-label" htmlFor="tpl-desc">
          Omschrijving
        </label>
        <input
          id="tpl-desc"
          className="opl-input"
          value={metaLoading ? '' : description}
          disabled={metaLoading}
          onChange={(e) => {
            descTouched.current = true;
            setDescription(e.target.value);
          }}
          placeholder={
            metaLoading ? 'Omschrijving wordt bedacht…' : 'Korte uitleg over wat deze prompt doet'
          }
        />
      </div>
      <div>
        <label className="opl-label" htmlFor="tpl-category">
          Categorie
        </label>
        <SearchableSelect
          id="tpl-category"
          options={categories.map((c) => ({ id: c.id, label: c.name, hint: c.description }))}
          value={categoryId}
          onChange={(id) => {
            categoryTouched.current = true;
            setCategoryId(id);
            if (id) setPendingCategory(null); // echte keuze vervangt een aanvraag
          }}
          placeholder="Waar is deze prompt voor bedoeld?"
          clearLabel="Geen categorie"
          searchPlaceholder="Zoek een categorie…"
        />

        {/* Aangevraagde (nog niet goedgekeurde) categorie — status blijft 'anders'. */}
        {pendingCategory && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            <Loader2 size={12} className="animate-spin" />
            Categorie “{pendingCategory}” aangevraagd, in afwachting van goedkeuring.
          </p>
        )}

        {/* Expliciete knop: mijn categorie zit er niet tussen → aanvragen. */}
        {!showCatRequest ? (
          <button
            type="button"
            onClick={() => {
              setShowCatRequest(true);
              setCatRequestName('');
            }}
            className="mt-2 text-xs font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
          >
            Mijn categorie zit er niet tussen
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-rijksblauw-200 bg-white p-2.5 dark:border-rijksblauw-500/30 dark:bg-slate-800">
            <label className="opl-label text-xs" htmlFor="tpl-cat-request">
              Nieuwe categorie aanvragen
            </label>
            <input
              id="tpl-cat-request"
              className="opl-input"
              value={catRequestName}
              onChange={(e) => setCatRequestName(e.target.value)}
              placeholder="Naam van de categorie, bijv. Inkoop & Aanbesteding"
              onKeyDown={(e) => e.key === 'Enter' && submitCategoryRequest()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="opl-btn-secondary px-3 py-1.5 text-xs"
                onClick={() => setShowCatRequest(false)}
                disabled={catRequestBusy}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="opl-btn-primary px-3 py-1.5 text-xs"
                onClick={submitCategoryRequest}
                disabled={catRequestBusy}
              >
                {catRequestBusy ? 'Versturen…' : 'Aanvragen'}
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Een beheerder beoordeelt je aanvraag. Tot die tijd blijft de categorie op
              &ldquo;anders&rdquo;.
            </p>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Zo vinden collega&apos;s waar deze prompt voor bedoeld is.
        </p>
      </div>
      <div>
        <label className="opl-label" htmlFor="tpl-role">
          Functie
        </label>
        <SearchableSelect
          id="tpl-role"
          options={roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))}
          value={roleId}
          onChange={(id) => {
            setRoleId(id);
            if (id) setPendingRole(null); // echte keuze vervangt een aanvraag
          }}
          placeholder="Voor welke functie is deze prompt geschreven?"
          clearLabel="Geen functie"
          searchPlaceholder="Zoek een functie…"
        />

        {/* Aangevraagde (nog niet goedgekeurde) functie. */}
        {pendingRole && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            <Loader2 size={12} className="animate-spin" />
            Functie “{pendingRole}” aangevraagd, in afwachting van goedkeuring.
          </p>
        )}

        {/* Expliciete knop: mijn functie zit er niet tussen → aanvragen. */}
        {!showRoleRequest ? (
          <button
            type="button"
            onClick={() => {
              setShowRoleRequest(true);
              setRoleRequestName('');
            }}
            className="mt-2 text-xs font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
          >
            Mijn functie zit er niet tussen
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-rijksblauw-200 bg-white p-2.5 dark:border-rijksblauw-500/30 dark:bg-slate-800">
            <label className="opl-label text-xs" htmlFor="tpl-role-request">
              Nieuwe functie aanvragen
            </label>
            <input
              id="tpl-role-request"
              className="opl-input"
              value={roleRequestName}
              onChange={(e) => setRoleRequestName(e.target.value)}
              placeholder="Naam van de functie, bijv. Beleidsmedewerker Inkoop"
              onKeyDown={(e) => e.key === 'Enter' && submitRoleRequest()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="opl-btn-secondary px-3 py-1.5 text-xs"
                onClick={() => setShowRoleRequest(false)}
                disabled={roleRequestBusy}
              >
                Annuleren
              </button>
              <button
                type="button"
                className="opl-btn-primary px-3 py-1.5 text-xs"
                onClick={submitRoleRequest}
                disabled={roleRequestBusy}
              >
                {roleRequestBusy ? 'Versturen…' : 'Aanvragen'}
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Een beheerder beoordeelt je aanvraag. Tot die tijd laat je de functie leeg.
            </p>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Voor welke functie is deze prompt geschreven?
        </p>
      </div>
      {organizations.length > 0 && (
        <div>
          <label className="opl-label" htmlFor="tpl-organization">
            Organisatie
          </label>
          {/* Beheerders/superadmins mogen elke organisatie (of geen) kiezen.
              Een normale gebruiker kan alleen de eigen organisatie koppelen:
              het veld is dan vergrendeld op de organisatie uit het profiel. */}
          <select
            id="tpl-organization"
            className="opl-input disabled:cursor-not-allowed disabled:opacity-70"
            value={organizationId}
            disabled={!isAdmin}
            onChange={(e) => {
              organizationTouched.current = true;
              setOrganizationId(e.target.value);
            }}
          >
            {/* "Geen organisatie" voor beheerders, of als terugval voor een
                normale gebruiker zonder eigen organisatie (anders heeft het
                vergrendelde veld geen geldige optie om te tonen). */}
            {(isAdmin || !organizationId) && <option value="">Geen organisatie</option>}
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code ? `${o.name} (${o.code})` : o.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {isAdmin
              ? 'Koppel deze prompt aan een ministerie of afdeling, zodat hij vindbaar is via de netwerkverkenner.'
              : 'Deze prompt wordt gekoppeld aan jouw eigen organisatie, zodat hij vindbaar is via de netwerkverkenner.'}
          </p>
        </div>
      )}
      <VisibilityPicker
        idPrefix="tpl"
        value={sharingLevels}
        onChange={(next) => {
          sharingTouched.current = true;
          setSharingLevels(next);
        }}
      />
      <div className="flex justify-end gap-2">
        <button className="opl-btn-secondary" onClick={onCancel} disabled={saving}>
          Annuleren
        </button>
        <button
          className="opl-btn-primary"
          onClick={handleSave}
          disabled={saving || !isAuthenticated}
          title={!isAuthenticated ? 'Log in om op te slaan' : undefined}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </div>
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
