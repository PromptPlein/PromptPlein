import { useState } from 'react';
import { Check, ChevronRight, Info, Layers, Wrench, X } from '@/components/common/icons';
import clsx from 'clsx';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { isContextPrompt } from '@/lib/techniques';
import type { Technique } from '@/types';

interface TechniqueSelectorProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Toon ook de prompt frameworks-groep (raamwerken zoals CARE/CRISP). Standaard true.
   * In de techniek-aanbevelingsflow staat dit op false: daar zijn alleen de losse
   * prompttechnieken bedoeld; de prompt frameworks horen bij de eigen-prompt-flow.
   */
  showContextPrompts?: boolean;
  /**
   * Toon ook de losse prompttechnieken-groep. Standaard true. In de eigen-prompt-flow
   * staat dit op false: daar zijn alleen de complete prompt frameworks bedoeld.
   */
  showTechniques?: boolean;
}

export default function TechniqueSelector({
  selectedId,
  onSelect,
  showContextPrompts = true,
  showTechniques = true,
}: TechniqueSelectorProps) {
  const { techniques } = useReferenceData();

  // Prompt frameworks (complete raamwerken, bijv. CRISP/CARE) los van de
  // losse prompttechnieken tonen, elk in een eigen, duidelijk afgebakende groep.
  const contextPrompts = techniques.filter(isContextPrompt);
  const promptTechniques = techniques.filter((t) => !isContextPrompt(t));

  const showFrameworks = showContextPrompts && contextPrompts.length > 0;
  const showTechs = showTechniques && promptTechniques.length > 0;
  // Beide groepen zichtbaar (de handmatige keuzelijst): zet ze naast elkaar —
  // links frameworks, rechts technieken — elk als verticale lijst (één per rij).
  // Maar één groep zichtbaar: dan gewoon de volle breedte met een 2-koloms grid.
  const sideBySide = showFrameworks && showTechs;

  return (
    <div
      className={clsx(
        // Naast elkaar: een smalle middenkolom voor de verticale scheidingslijn.
        sideBySide
          ? 'grid grid-cols-1 gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-6'
          : 'space-y-8',
      )}
    >
      {showFrameworks && (
        <Group
          icon={<Layers size={16} />}
          title="Prompt frameworks"
          subtitle="Complete raamwerken die je hele prompt structureren."
          accent="oranje"
          techniques={contextPrompts}
          selectedId={selectedId}
          onSelect={onSelect}
          // Naast elkaar: één kaart per rij. Alleen: brede 2-koloms grid.
          columns={sideBySide ? 1 : 2}
        />
      )}

      {/* Verticale scheidingslijn tussen de twee groepen. Het grootste deel is
          vol/donker; alleen een kort stukje aan de boven- én onderkant gaat van
          donker naar transparant (fade binnen ~10% aan elk uiteinde). Loopt iets
          hoger dan de kaarten via een negatieve top-marge. Alleen zichtbaar
          wanneer beide groepen naast elkaar staan (md+). */}
      {sideBySide && (
        <div
          aria-hidden="true"
          // Kleur via currentColor (text-*), zodat dark mode automatisch meegaat.
          // De gradient gebruikt currentColor in het midden en transparant aan de
          // uiteinden, met een korte fade van ~10% aan boven- en onderkant.
          className="-mt-2 hidden w-0.5 self-stretch text-slate-300 md:block dark:text-slate-600"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent 0%, currentColor 10%, currentColor 90%, transparent 100%)',
          }}
        />
      )}

      {showTechs && (
        <Group
          icon={<Wrench size={16} />}
          title="Prompt technieken"
          subtitle="Gerichte technieken voor een specifiek effect."
          accent="blauw"
          techniques={promptTechniques}
          selectedId={selectedId}
          onSelect={onSelect}
          columns={sideBySide ? 1 : 2}
        />
      )}
    </div>
  );
}

/** Accentkleur per groep: oranje voor prompt frameworks, blauw voor prompttechnieken. */
type Accent = 'oranje' | 'blauw';

const ACCENT_STYLES: Record<
  Accent,
  {
    badge: string;
    icon: string;
    rule: string;
    /** Kaartstijl wanneer geselecteerd: rand + ring + achtergrond in de accentkleur. */
    cardActive: string;
    /** Naam-tekstkleur op een kaart (zowel actief als rust). */
    cardName: string;
    /** Het ronde vinkje op een geselecteerde kaart. */
    cardCheck: string;
    /**
     * Gevulde accent-cirkel met pijl rechtsboven: een altijd zichtbare "knop", zodat
     * ook zonder hover meteen duidelijk is dat de kaart aanklikbaar is.
     */
    cardChevronBtn: string;
    /** Hover-rand op een niet-geselecteerde kaart. */
    cardHover: string;
  }
> = {
  oranje: {
    // Titel-badge: getinte achtergrond + accentrand links, zodat de kop opvalt.
    badge:
      'border-rijksoranje/30 bg-rijksoranje/10 text-rijksoranje dark:border-rijksoranje/40 dark:bg-rijksoranje/15',
    icon: 'text-rijksoranje',
    // Volledige scheidingslijn onder de kop, in de accentkleur, vervagend.
    rule: 'from-rijksoranje/50 via-rijksoranje/20',
    cardActive: 'border-rijksoranje bg-rijksoranje/10 ring-2 ring-rijksoranje/20 dark:bg-rijksoranje/15',
    cardName: 'text-rijksoranje dark:text-rijksoranje',
    cardCheck: 'bg-rijksoranje text-white',
    cardChevronBtn: 'bg-rijksoranje text-white shadow-sm group-hover/card:bg-rijksoranje-dark',
    cardHover: 'hover:border-rijksoranje/50',
  },
  blauw: {
    badge:
      'border-rijksblauw-500/30 bg-rijksblauw-50 text-rijksblauw-700 dark:border-rijksblauw-500/40 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200',
    icon: 'text-rijksblauw-500',
    rule: 'from-rijksblauw-500/50 via-rijksblauw-500/20',
    cardActive: 'border-rijksblauw-500 bg-rijksblauw-50 ring-2 ring-rijksblauw-500/20 dark:bg-rijksblauw-500/15',
    cardName: 'text-rijksblauw-700 dark:text-rijksblauw-200',
    cardCheck: 'bg-rijksblauw-500 text-white',
    cardChevronBtn: 'bg-rijksblauw-500 text-white shadow-sm group-hover/card:bg-rijksblauw-700',
    cardHover: 'hover:border-rijksblauw-300',
  },
};

function Group({
  icon,
  title,
  subtitle,
  accent,
  techniques,
  selectedId,
  onSelect,
  columns = 2,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: Accent;
  techniques: Technique[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Aantal kolommen voor de kaarten: 1 = lijst onder elkaar, 2 = breed grid. */
  columns?: 1 | 2;
}) {
  if (techniques.length === 0) return null;
  const styles = ACCENT_STYLES[accent];
  return (
    <div>
      {/* Sectiekop: een opvallende, omkaderde titel-badge met icoon + subtitel. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={clsx(
            'inline-flex items-center gap-2 rounded-lg border-l-4 border px-3 py-1.5 text-sm font-bold uppercase tracking-wide shadow-sm',
            styles.badge,
          )}
        >
          <span className={styles.icon}>{icon}</span>
          {title}
        </span>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      {/* Volledige scheidingslijn onder de kop: markeert de grens van deze sectie. */}
      <div
        className={clsx('mb-4 h-0.5 w-full bg-gradient-to-r to-transparent', styles.rule)}
        aria-hidden="true"
      />

      <div className={clsx('grid grid-cols-1 gap-3', columns === 2 && 'sm:grid-cols-2')}>
        {techniques.map((t) => (
          <TechniqueCard
            key={t.id}
            technique={t}
            active={t.id === selectedId}
            accent={accent}
            onSelect={() => onSelect(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TechniqueCard({
  technique: t,
  active,
  accent,
  onSelect,
}: {
  technique: Technique;
  active: boolean;
  /** Accentkleur van de groep: bepaalt de selectie-/naam-kleur van de kaart. */
  accent: Accent;
  onSelect: () => void;
}) {
  const styles = ACCENT_STYLES[accent];
  // Standaard tonen we alleen de korte versie (titel + korte beschrijving + aantal
  // vervolgvragen). De details (doel + voorbeelden) staan ingeklapt achter de
  // info-knop, zodat de keuzelijst rustig blijft.
  const [showDetails, setShowDetails] = useState(false);

  // De korte beschrijving blijft altijd zichtbaar. Achter de info-knop staan alleen
  // de extra details: het doel en de voorbeelden. Geen extra details → geen info-knop.
  const hasDetails = Boolean(t.strength || (t.use_cases && t.use_cases.length > 0));

  const followUpLabel = `${t.follow_up_questions.length} vervolgvra${
    t.follow_up_questions.length === 1 ? 'ag' : 'gen'
  }`;

  // De kaart is een klikbare regio (selecteert de techniek). We gebruiken een div
  // met role="button" — geen <button> — omdat er een tweede, geneste knop (de
  // info-toggle) in zit en een knop-in-een-knop ongeldige HTML is.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={active}
      className={clsx(
        // Diepte zodat de kaart als klikbare knop leest: een grondschaduw, en bij
        // hover komt de kaart iets omhoog met een sterkere schaduw. Bij indrukken
        // zakt hij weer terug (active:). De ring/rand markeert de gekozen kaart.
        'group/card flex cursor-pointer flex-col rounded-xl border p-4 text-left shadow-sm transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500/40',
        active
          ? clsx(styles.cardActive, 'shadow-md')
          : clsx(
              'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60',
              styles.cardHover,
            ),
      )}
    >
      {/* Titelregel: naam links, en rechtsboven een knoppencluster — de info-knop
          (links) naast de altijd zichtbare, gevulde pijl-knop (rechts). De gevulde
          cirkel maakt ook zonder hover meteen duidelijk dat de kaart aanklikbaar is;
          bij een gekozen kaart wordt de pijl een vinkje. */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className={clsx('font-semibold', styles.cardName)}>{t.name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasDetails && (
            <button
              type="button"
              // Voorkom dat klikken op de info-knop óók de techniek selecteert.
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails((v) => !v);
              }}
              aria-expanded={showDetails}
              aria-label={showDetails ? 'Minder informatie' : 'Meer informatie'}
              title={showDetails ? 'Minder informatie' : 'Meer informatie'}
              className={clsx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition-colors',
                'hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300',
              )}
            >
              {showDetails ? <X size={14} /> : <Info size={15} />}
            </button>
          )}
          <span
            aria-hidden="true"
            className={clsx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
              active ? styles.cardCheck : styles.cardChevronBtn,
            )}
          >
            {active ? (
              <Check size={16} />
            ) : (
              <ChevronRight
                size={16}
                className="transition-transform group-hover/card:translate-x-0.5"
              />
            )}
          </span>
        </div>
      </div>
      {/* Vervagende onderlijn in de accentkleur van de groep (oranje bij
          frameworks, blauw bij technieken), net als onder de sectiekop. */}
      <div
        className={clsx('mb-2.5 h-0.5 w-full bg-gradient-to-r to-transparent', styles.rule)}
        aria-hidden="true"
      />
      {/* Korte beschrijving: altijd zichtbaar. */}
      {t.description && (
        <span className="text-sm text-slate-600 dark:text-slate-300">{t.description}</span>
      )}
      {/* Extra details (doel + voorbeelden): ingeklapt tot de info-knop wordt geklikt. */}
      {showDetails && (
        <>
          {t.strength && (
            <span className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-600 dark:text-slate-300">Doel: </span>
              {t.strength}
            </span>
          )}
          {t.use_cases && t.use_cases.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-500 dark:text-slate-400">
              {t.use_cases.slice(0, 3).map((uc, i) => (
                <li key={i}>{uc}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <span className="mt-2 text-xs text-slate-400 dark:text-slate-500">{followUpLabel}</span>
    </div>
  );
}
