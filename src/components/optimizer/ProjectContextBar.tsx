import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  FolderOpen,
  Loader2,
  Paperclip,
  Plus,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { writeNewProjectHandoff } from '@/services/handoffService';
import type { ChatProject } from '@/types';
import type { GeneratorContext } from '@/services/chatProjectService';

/**
 * De projectbalk boven de promptbouwer: welk chatproject levert de context voor
 * deze prompt?
 *
 * WAAROM DIT ER IS
 * De bouwer kent het onderwerp van de gebruiker niet. Wie een prompt wil voor
 * zijn eigen plugin, applicatie of merk, moet die achtergrond anders bij elke
 * prompt opnieuw uittypen — en doet dat niet, waarna de bouwer een algemene
 * prompt aflevert. Een chatproject bevat die achtergrond al (de
 * projectinstructie); dit is de plek waar hij de bouwer in gaat.
 *
 * Er zijn twee deuren naar dezelfde staat: de knop "Genereer prompt" op de
 * projectpagina (die zet het project klaar via een handoff) en de kiezer hier,
 * voor wie al in de bouwer zit. Deze component toont alleen de staat en laat
 * hem wijzigen; het ophalen doet de pagina.
 *
 * VORM
 * Dit is GEEN losse kaart boven de bouwer maar de bovenste strook ERVAN: hij
 * wordt als eerste stuk van de `header` binnen het omrande blok van
 * OwnPromptOptimizer/GoalDialog gerenderd, zodat de rand en de ronding van de
 * kaart om hem heen lopen. Vandaar geen eigen rand of ronding hier — alleen een
 * onderlijn die hem van de tabs scheidt. Als zwevende strook erboven las hij als
 * een melding náást de bouwer, en werd hij overgeslagen.
 *
 * Binnen die strook is de taal die van de tabs eronder: icoonvierkant van
 * h-10/rounded-xl, vette kop met een beschrijvende regel, en het ronde vinkje
 * van de tabs op de bronbestanden-schakelaar.
 *
 * WISSELEN VAN PROJECT
 * De projectnaam is zélf de kiezer — een chevron en een hover-vlak zeggen dat
 * je hem kunt aanklikken. Dat is de zichtbare route naar een ander project;
 * het kruisje rechts betekent alleen nog "zonder project verder", en dezelfde
 * keuze staat onderin het menu voor wie het kruisje niet als knop herkent.
 */
export default function ProjectContextBar({
  projects,
  context,
  loading,
  onPick,
  onClear,
  onToggleFiles,
}: {
  /** De projecten van de ingelogde gebruiker; leeg = de balk nodigt uit. */
  projects: ChatProject[];
  /** De actieve context, of null wanneer er geen project aanhangt. */
  context: GeneratorContext | null;
  loading: boolean;
  onPick: (projectId: string) => void;
  onClear: () => void;
  /** Bronbestanden mee of alleen de projectinstructie. */
  onToggleFiles: (includeFiles: boolean) => void;
}) {
  const { isAuthenticated, configured } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Mock-modus (geen backend): dan bestaan projecten niet en heeft ook de uitleg
  // geen bestemming om heen te sturen.
  if (!configured) return null;

  /**
   * "Project maken" is één handeling, geen reis: de gebruiker gaat naar de chat
   * én wil daar meteen zijn projectinstructie kwijt. Zonder dit signaal komt hij
   * aan op een pagina waar hij de knop opnieuw moet zoeken. De vlag staat in
   * sessionStorage en niet in router-state, zodat hij ook een tussenstop bij het
   * inlogscherm overleeft (zie handoffService).
   */
  const startNewProject = () => writeNewProjectHandoff();

  /** De projectenlijst; ook de losmaak-regel zit erin (alleen als er iets aanhangt). */
  const menu = (
    // max-h bewust laag: de strook zit ín een blok met overflow-hidden, dus een
    // lang menu wordt onderaan door de kaart afgeknipt in plaats van eroverheen
    // te hangen. 224px past onder elke variant van de bouwer; de rest scrolt.
    <div className="absolute left-0 top-full z-20 mt-1.5 max-h-56 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      {projects.map((project) => {
        const active = project.id === context?.id;
        return (
          <button
            key={project.id}
            type="button"
            className={clsx(
              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
              active
                ? 'bg-rijksblauw-50 font-semibold text-rijksblauw-800 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700',
            )}
            onClick={() => {
              setMenuOpen(false);
              if (!active) onPick(project.id);
            }}
          >
            <FolderOpen
              size={14}
              className={clsx('shrink-0', active ? 'text-rijksblauw-500' : 'text-slate-400')}
            />
            <span className="truncate">{project.name}</span>
            {active && <Check size={14} className="ml-auto shrink-0 text-rijksblauw-500" />}
          </button>
        );
      })}
      <div className="my-1 border-t border-slate-200 dark:border-slate-700" />

      {/* Nog geen project voor dít onderwerp? Dan is "een nieuwe maken" de
          volgende stap, en die hoort in de lijst te staan — niet ergens anders
          in de app waar je hem moet gaan zoeken. Projecten wonen op de
          chatpagina, dus daar komt de gebruiker uit — met de instellingen
          meteen open (zie startNewProject). */}
      <Link
        to="/chat"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-rijksblauw-700 transition-colors hover:bg-rijksblauw-50 dark:text-rijksblauw-200 dark:hover:bg-slate-700"
        onClick={() => {
          setMenuOpen(false);
          startNewProject();
        }}
      >
        <Plus size={14} className="shrink-0" />
        <span className="truncate">Project maken</span>
      </Link>

      {context && (
        // Tweede route naar "zonder project": het kruisje rechtsboven is voor
        // wie het herkent, deze regel voor wie het menu opent om te wisselen en
        // dan pas bedenkt dat hij er helemaal vanaf wil.
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
          onClick={() => {
            setMenuOpen(false);
            onClear();
          }}
        >
          <X size={14} className="shrink-0" />
          <span className="truncate">Verder zonder project</span>
        </button>
      )}
    </div>
  );

  /**
   * De strook zelf. Geen rand en geen ronding: die komt van het omrande blok
   * waar hij de bovenste rij van is. Alleen een onderlijn — dát is wat hem
   * "erbij maar apart" laat lezen.
   */
  const STRIP = 'border-b px-3 py-2.5 sm:px-4 sm:py-3';

  if (loading) {
    return (
      <div
        className={clsx(
          STRIP,
          'flex items-center gap-3 border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-800/60',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm sm:h-10 sm:w-10 dark:bg-slate-700 dark:text-slate-400">
          <Loader2 size={18} className="animate-spin" />
        </span>
        {/* "Laden" duurt een seconde, "analyseren" tientallen: de eerste keer
            dat een project wordt aangehaakt, leest de AI het hele project door.
            Zonder die zin leest de wachttijd als een vastloper. Bij de volgende
            prompt komt de analyse uit de cache en is dit weer een flits. */}
        <span className="text-slate-500 dark:text-slate-400">Je project wordt geanalyseerd…</span>
      </div>
    );
  }

  // ── Geen project aangehaakt ────────────────────────────────────────────────
  // Dit is een AANBOD, en het werd gemist toen het een grijze streep was: de
  // gebruiker moet hier zien dát hij zijn eigen project kan aanhaken en wat dat
  // oplevert. Daarom een getinte strook met kop én uitleg — nog steeds zonder
  // gevuld icoonvierkant, want dat is voorbehouden aan de aangehaakte staat en
  // aan de tabs eronder.
  //
  // De strook staat er ALTIJD, ook zonder account en zonder projecten. Wie de
  // mogelijkheid nooit ziet, vraagt er ook nooit om: voorheen verdween hij
  // precies voor de groep die nog moest ontdekken dat hij bestaat. Alleen de
  // actie rechts verschilt per situatie.
  if (!context) {
    // Wit op de blauwe tint met een blauwe rand: de enige knop in deze strook,
    // en hij moet als knop opvallen zonder de primaire actie van de bouwer te
    // imiteren (die is vol oranje/blauw).
    const CTA =
      'inline-flex items-center gap-1.5 rounded-lg border border-rijksblauw-500/40 bg-white px-3 py-1.5 text-xs font-semibold text-rijksblauw-700 shadow-sm transition-colors hover:border-rijksblauw-500 hover:bg-rijksblauw-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:border-rijksblauw-500/40 dark:bg-slate-800 dark:text-rijksblauw-200 dark:hover:bg-slate-700';

    return (
      <div
        className={clsx(
          STRIP,
          'flex flex-wrap items-center gap-x-3 gap-y-2.5 border-rijksblauw-500/20 bg-rijksblauw-50/60 dark:border-rijksblauw-500/25 dark:bg-rijksblauw-500/[0.07]',
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rijksblauw-500 shadow-sm ring-1 ring-rijksblauw-500/15 sm:h-10 sm:w-10 dark:bg-slate-800 dark:text-rijksblauw-300 dark:ring-rijksblauw-500/30">
          <FolderOpen size={18} />
        </span>
        {/* basis-full: op telefoon krijgen kop en uitleg een hele regel en zakt
            de knop eronder, in plaats van dat beide om dezelfde regel vechten
            en de zin in vier woorden-brede stukjes breekt. */}
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-tight text-slate-900 dark:text-white">
            Genereer de prompt met projectcontext
            {/* Projecten wonen achter de login (de chatpagina zit in de
                RequireAuth-groep). Zeg dat vooraf, in plaats van iemand op een
                knop te laten drukken die hem naar een inlogscherm stuurt. */}
            {!isAuthenticated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rijksblauw-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rijksblauw-700 dark:bg-rijksblauw-500/20 dark:text-rijksblauw-200">
                <Sparkles size={11} />
                Account
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-600 dark:text-slate-300">
            De bouwer kent je product, merk of site dan al, zodat de prompt van hoge kwaliteit is.
          </p>
        </div>

        {projects.length > 0 ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              className={CTA}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <FolderOpen size={14} /> Kies een project
              <ChevronDown size={14} className="opacity-70" />
            </button>
            {menuOpen && menu}
          </div>
        ) : isAuthenticated ? (
          // Ingelogd, maar nog geen project: de knop brengt je naar de plek waar
          // je er een maakt, in plaats van een leeg keuzemenu te openen.
          <Link to="/chat" className={clsx(CTA, 'shrink-0')} onClick={startNewProject}>
            <FolderOpen size={14} /> Project maken
          </Link>
        ) : (
          <Link to="/auth/login" className={clsx(CTA, 'shrink-0')}>
            <FolderOpen size={14} /> Inloggen
          </Link>
        )}
      </div>
    );
  }

  // ── Project aangehaakt ─────────────────────────────────────────────────────
  return (
    <div className="border-b border-rijksblauw-500/25 bg-rijksblauw-50/70 dark:border-rijksblauw-500/30 dark:bg-rijksblauw-500/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 sm:py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rijksblauw-500 text-white shadow-sm sm:h-10 sm:w-10">
          <FolderOpen size={18} />
        </span>

        {/* Naam + wat het project hier doet. De naam is de kiezer. */}
        <div className="min-w-0 flex-1" ref={menuRef}>
          <div className="relative">
            <button
              type="button"
              className="group -mx-1.5 flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-rijksblauw-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:hover:bg-rijksblauw-500/20"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="Kies een ander project"
            >
              <span className="truncate text-[15px] font-bold leading-tight text-slate-900 sm:text-base dark:text-white">
                {context.name}
              </span>
              <ChevronDown
                size={15}
                className="shrink-0 text-rijksblauw-600 transition-transform group-hover:translate-y-px dark:text-rijksblauw-300"
              />
              <span className="sr-only">Kies een ander project</span>
            </button>
            {menuOpen && menu}
          </div>
          {/* Wel of niet geanalyseerd is een echt verschil in wat de bouwer
              meekrijgt, dus staat het er ook echt. Bij een mislukte analyse gaat
              het ruwe projectmateriaal mee — dat is minder dan we hier zouden
              beloven, en dan hoort er niet "geanalyseerd" te staan. */}
          <p className="mt-0.5 text-[13px] leading-snug text-slate-600 dark:text-slate-300">
            {context.analyzed
              ? 'geanalyseerd — levert de context voor deze prompt'
              : 'levert de context voor deze prompt'}
          </p>
        </div>

        {/* Bronbestanden erbij of niet — met hetzelfde ronde vinkje als de tabs
            eronder, zodat het als dezelfde soort keuze leest. Alleen zichtbaar
            als het project bestanden hééft. */}
        {context.fileCount > 0 && (
          <button
            type="button"
            role="switch"
            aria-checked={context.withFiles}
            onClick={() => onToggleFiles(!context.withFiles)}
            title="Stuur ook de bronbestanden van het project mee. Meestal niet nodig: de projectinstructie is genoeg voor de meeste prompts."
            className={clsx(
              'group inline-flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
              // Op telefoon een eigen, volle regel onder de naam (order-last houdt
              // het kruisje op de eerste regel); vanaf sm gewoon rechts ernaast.
              // Zonder basis-full zou de schakelaar zijn vaste breedte opeisen en
              // de projectnaam ernaast tot "WPHando…" knijpen.
              'order-last basis-full justify-center sm:order-none sm:basis-auto',
              context.withFiles
                ? 'border-rijksblauw-500 bg-white text-rijksblauw-800 shadow-sm dark:bg-slate-800 dark:text-rijksblauw-200'
                : 'border-slate-300 bg-white/70 text-slate-600 hover:bg-white dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            <span
              aria-hidden
              className={clsx(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                context.withFiles
                  ? 'border-rijksblauw-500 bg-rijksblauw-500 text-white'
                  : 'border-slate-300 group-hover:border-rijksblauw-400 dark:border-slate-500',
              )}
            >
              <Check
                size={10}
                strokeWidth={3}
                className={context.withFiles ? 'opacity-100' : 'opacity-0'}
              />
            </span>
            <Paperclip size={13} className="shrink-0 opacity-70" />
            <span className="whitespace-nowrap">bronbestanden mee ({context.fileCount})</span>
          </button>
        )}

        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-rijksblauw-700/60 transition-colors hover:bg-rijksblauw-500/10 hover:text-rijksblauw-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 dark:text-rijksblauw-300/60 dark:hover:bg-rijksblauw-500/20 dark:hover:text-rijksblauw-100"
          onClick={onClear}
          aria-label="Project loskoppelen"
          title="Bouw deze prompt zonder projectcontext"
        >
          <X size={15} />
        </button>
      </div>

      {/* Niet alles paste: een eigen regel onder de streep in plaats van een
          losse waarschuwing tussen de knoppen, waar hij werd overgeslagen. */}
      {context.skipped.length > 0 && (
        <p
          className="flex items-start gap-1.5 border-t border-rijksblauw-500/15 px-3 py-2 text-xs text-amber-700 sm:px-3.5 dark:border-rijksblauw-500/20 dark:text-amber-400"
          title={`Buiten het contextbudget gevallen: ${context.skipped.join(', ')}`}
        >
          <Scissors size={12} className="mt-0.5 shrink-0" />
          <span>Niet alles past — weggelaten: {context.skipped.join(', ')}</span>
        </p>
      )}
    </div>
  );
}
