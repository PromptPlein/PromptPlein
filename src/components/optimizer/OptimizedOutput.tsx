import { useEffect, useRef, useState } from 'react';
import { Copy, Check, RotateCcw, Save, Share2, Loader2, FolderCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { copyToClipboard, getCurrentUser } from '@/lib/utils';
import { createPrompt } from '@/services/repository';
import { generateMetadata } from '@/services/optimizeService';
import { requestCategory } from '@/services/categoryRequestService';
import { requestFunction } from '@/services/functionRequestService';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import ShareModal from '@/components/share/ShareModal';
import SearchableSelect from '@/components/common/SearchableSelect';
import VisibilityPicker from '@/components/prompts/VisibilityPicker';
import type { OptimizeResult, Prompt, Technique, VisibilityLevel } from '@/types';

interface OptimizedOutputProps {
  result: OptimizeResult;
  /** De gekozen techniek (voor de standaardtitel + categorie van de template). */
  technique?: Technique | null;
  /** Het doel dat de gebruiker beschreef (voor een zinvolle standaardtitel). */
  goal?: string;
  onReset: () => void;
}

export default function OptimizedOutput({ result, technique, goal, onReset }: OptimizedOutputProps) {
  const { profile, user, isAuthenticated } = useAuth();
  const { categories, roles, organizations } = useReferenceData();
  const [copied, setCopied] = useState(false);

  // Opslaan-formulier
  const [showSave, setShowSave] = useState(false);
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
  // Standaard delen met de eigen afdeling: dat niveau is direct beschikbaar
  // (geen wachttijd) en is de meest voorkomende keuze. Alleen voorselecteren als
  // we de organisatie van de gebruiker kennen — een afdelingsniveau zonder
  // organisatie zou voor niemand gericht zichtbaar zijn. De maker kan dit
  // aanpassen of meerdere niveaus aanvinken.
  const [sharingLevels, setSharingLevels] = useState<VisibilityLevel[]>(
    profile?.organization_id ? ['department'] : [],
  );
  const sharingTouched = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Prompt | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // AI-suggestie (titel + omschrijving + categorie) op basis van de inhoud,
  // één keer ophalen bij openen van het formulier.
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaRequested, setMetaRequested] = useState(false);
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

  // Het profiel laadt asynchroon: zodra de organisatie van de gebruiker bekend is
  // en de gebruiker de velden nog niet zelf koos, vullen we ze standaard voor —
  // organisatie op die van het profiel, en het afdelings-deelniveau aangevinkt.
  useEffect(() => {
    if (!profile?.organization_id) return;
    if (!organizationTouched.current && !organizationId) {
      setOrganizationId(profile.organization_id);
    }
    if (!sharingTouched.current && sharingLevels.length === 0) {
      setSharingLevels(['department']);
    }
    // sharingLevels bewust niet als dependency: we vullen alleen één keer voor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.organization_id, organizationId]);

  /** Open het opslaan-formulier en haal eenmalig titel + omschrijving + categorie op. */
  function openSave() {
    setShowSave(true);
    if (metaRequested || metaLoading) return;
    setMetaRequested(true);
    setMetaLoading(true);
    generateMetadata({
      templateContent: result.optimized_content,
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
  }

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
      toast.success(`Aanvraag voor “${name}” verstuurd — een beheerder beoordeelt hem.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
    } finally {
      setCatRequestBusy(false);
    }
  }

  async function handleCopy() {
    await copyToClipboard(result.optimized_content);
    setCopied(true);
    toast.success('Prompt-template gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Geef je template een titel.');
      return;
    }
    // Opslaan vereist een ingelogde gebruiker: de RLS-policy op `prompts` staat
    // alleen inserts toe voor de rol `authenticated`. Zonder sessie geeft Supabase
    // een 403 die voor de gebruiker nietszeggend is — vang dat hier af.
    if (!isAuthenticated) {
      toast.error('Log in om deze template op te slaan in de bibliotheek.');
      return;
    }
    // Afdeling/ministerie delen vereist een organisatie om op te richten — anders
    // weet niemand met welke afdeling de template gedeeld is.
    const needsOrg = sharingLevels.includes('department') || sharingLevels.includes('ministry');
    if (needsOrg && !organizationId) {
      toast.error('Kies een organisatie om de template met je afdeling of ministerie te delen.');
      return;
    }
    setSaving(true);
    try {
      const prompt = await createPrompt({
        title: title.trim(),
        description: description.trim() || undefined,
        content: result.optimized_content,
        category_id: categoryId,
        role_id: roleId,
        organization_id: organizationId || null,
        sharing_levels: sharingLevels,
        created_by: profile?.full_name || getCurrentUser() || 'Onbekend',
      });
      setSaved(prompt);
      setShowSave(false);
      toast.success('Template opgeslagen in de bibliotheek');
    } catch (err) {
      toast.error(humanizeSaveError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
        Je herbruikbare template
      </h3>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Kopieer deze template naar je eigen AI-chat, of sla hem op zodat jij en je collega&apos;s
        hem opnieuw kunnen gebruiken. Vul de plekken tussen{' '}
        <span className="font-mono text-xs">[haakjes]</span> per keer aan met je eigen inhoud.
      </p>

      {result.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          {result.error}
        </div>
      )}

      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {result.optimized_content}
      </pre>

      {/* Opgeslagen-bevestiging */}
      {saved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
          <span className="inline-flex items-center gap-2">
            <FolderCheck size={16} /> Opgeslagen als herbruikbare template.
          </span>
          <Link
            to={`/prompt/${saved.id}`}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            Bekijk in de bibliotheek
          </Link>
        </div>
      )}

      {/* Opslaan-formulier */}
      {showSave && !saved && (
        <div className="space-y-3 rounded-xl border border-rijksblauw-200 bg-rijksblauw-50/40 p-4 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
          {/* Opslaan vereist een ingelogde gebruiker (RLS op `prompts`). Maak dat
              meteen duidelijk in plaats van een 401 bij het opslaan. */}
          {!isAuthenticated && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
              Je bent niet ingelogd. Om een template in de bibliotheek op te slaan moet je eerst{' '}
              <Link
                to="/auth/login"
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                inloggen
              </Link>
              . Je kunt de template ondertussen wel kopiëren.
            </div>
          )}
          <div>
            <label className="opl-label" htmlFor="tpl-title">
              Titel van de template
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
              {metaLoading && (
                <Loader2
                  size={16}
                  className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-rijksblauw-400"
                  aria-hidden
                />
              )}
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Sparkles size={12} />
              {metaLoading
                ? 'AI bedenkt een titel, omschrijving en categorie op basis van de inhoud…'
                : 'Voorgesteld op basis van de inhoud — pas alles gerust aan.'}
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
                metaLoading ? 'Omschrijving wordt bedacht…' : 'Korte uitleg over wat deze template doet'
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
                Categorie “{pendingCategory}” aangevraagd — in afwachting van goedkeuring.
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
              onChange={(id) => setRoleId(id)}
              placeholder="Voor welke functie is deze prompt geschreven?"
              clearLabel="Geen functie"
              searchPlaceholder="Zoek een functie…"
              onRequestNew={
                user
                  ? async (term) => {
                      try {
                        await requestFunction({ name: term, requestedBy: user.id });
                        toast.success(`Aanvraag voor “${term}” verstuurd — een beheerder beoordeelt hem.`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Aanvraag mislukt');
                      }
                    }
                  : undefined
              }
              requestNewLabel={(term) => `“${term}” als nieuwe functie aanvragen`}
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Voor welke functie is deze prompt geschreven?
            </p>
          </div>
          {organizations.length > 0 && (
            <div>
              <label className="opl-label" htmlFor="tpl-organization">
                Organisatie
              </label>
              <select
                id="tpl-organization"
                className="opl-input"
                value={organizationId}
                onChange={(e) => {
                  organizationTouched.current = true;
                  setOrganizationId(e.target.value);
                }}
              >
                <option value="">Geen organisatie</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code ? `${o.name} (${o.code})` : o.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Koppel deze template aan een ministerie of afdeling, zodat hij vindbaar is via de
                netwerkverkenner.
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
            <button className="opl-btn-secondary" onClick={() => setShowSave(false)} disabled={saving}>
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
      )}

      {/* Acties */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="opl-btn-secondary" onClick={onReset}>
          <RotateCcw size={16} /> Opnieuw
        </button>
        {saved ? (
          <button className="opl-btn-secondary" onClick={() => setShareOpen(true)}>
            <Share2 size={16} /> Delen met collega&apos;s
          </button>
        ) : (
          <button className="opl-btn-secondary" onClick={() => (showSave ? setShowSave(false) : openSave())}>
            <Save size={16} /> Opslaan in bibliotheek
          </button>
        )}
        <button className="opl-btn-primary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Gekopieerd' : 'Kopieer template'}
        </button>
      </div>

      {saved && <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} prompt={saved} />}
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
    e?.code === '42501' || // onvoldoende rechten (RLS)
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('row-level security') ||
    msg.includes('row level security');
  if (isAuthIssue) {
    return 'Je bent niet (meer) ingelogd. Log opnieuw in om de template op te slaan.';
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
  return technique ? `${technique.name}-template` : 'Nieuwe template';
}
