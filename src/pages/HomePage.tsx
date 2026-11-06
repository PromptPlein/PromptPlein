import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  Search,
  Sparkles,
  MessageSquare,
  Layers,
  type LucideIcon,
} from '@/components/common/icons';
import clsx from 'clsx';
import DictationButton from '@/components/common/DictationButton';
import InfoDot from '@/components/common/InfoDot';
import LightSweepBackground from '@/components/common/LightSweepBackground';
import { KIND_OPTIONS } from '@/components/optimizer/kindOptions';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { categoryIcon } from '@/lib/categoryIcons';
import { PROMPT_KINDS, type PromptKind } from '@/lib/techniques';
import { insertDictatedText, useDictation } from '@/lib/useDictation';
import { writeGeneratorHandoff } from '@/services/handoffService';
import { listPrompts } from '@/services/repository';
import { getChatSettingsCached } from '@/services/settingsService';
import { usePromptCommunity } from '@/hooks/usePromptCommunity';
import UploadModal from '@/components/prompts/UploadModal';
import PromptCard from '@/components/prompts/PromptCard';
import { SkeletonGrid } from '@/components/common/Skeleton';
import type { Prompt } from '@/types';

// De kop rouleert per kalenderdag langs vier achtergronden: tegels en polder
// (Three.js), promptregels (Canvas 2D) en effen met lichtbaan (alleen CSS). De
// zware twee zijn lazy, zodat de kop direct rendert en three.js alleen laadt op
// een dag die het nodig heeft.
const DashboardBackground = lazy(() => import('@/components/three/DashboardBackground'));
const PromptLinesBackground = lazy(() => import('@/components/common/PromptLinesBackground'));

const HERO_BACKGROUNDS = ['tegels', 'polder', 'effen', 'regels'] as const;
type HeroBackground = (typeof HERO_BACKGROUNDS)[number];

// Grondkleur van de sectie, zichtbaar zolang de achtergrond nog laadt.
const HERO_BASE_CLASS: Record<HeroBackground, string> = {
  tegels: 'bg-rijksblauw-700',
  polder: 'bg-rijksblauw-900',
  effen: 'bg-rijksblauw-800',
  regels: 'bg-rijksblauw-900',
};

function heroBackgroundForToday(): HeroBackground {
  const now = new Date();
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return HERO_BACKGROUNDS[dayNumber % HERO_BACKGROUNDS.length];
}

/**
 * De startpagina: bovenaan één vraag ("Wat wil je maken?") op de achtergrond
 * van de dag, daaronder de andere taken als tegels, de categorieën als iconen
 * met een aantal en de nieuwste prompts. Uitleg staat niet als lopende tekst op
 * de pagina, maar achter een infobolletje.
 */
export default function HomePage() {
  const navigate = useNavigate();
  const { categories, techniques } = useReferenceData();
  const [recent, setRecent] = useState<Prompt[]>([]);
  // Aantal prompts in totaal en per categorie, voor de getallen op de tegels.
  const [total, setTotal] = useState<number | null>(null);
  const [perCategory, setPerCategory] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  // De chattegel staat er alleen zolang de beheerder de chat aan heeft, net als
  // het menu-item in de kopbalk.
  const [chatEnabled, setChatEnabled] = useState(true);
  const heroBackground = useMemo(heroBackgroundForToday, []);

  // "Wat wil je maken?": de vraag en de soort gaan mee naar de bouwer, die er
  // het framework bij zoekt. Geen soort gekozen = de AI kiest.
  const [question, setQuestion] = useState('');
  const [kind, setKind] = useState<PromptKind | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);
  const dictation = useDictation((spoken) => {
    if (questionRef.current) insertDictatedText(questionRef.current, spoken);
  });

  function handleMake(e: FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (text || kind) writeGeneratorHandoff(text, kind);
    navigate('/genereren');
  }

  useEffect(() => {
    let active = true;
    listPrompts()
      .then((p) => {
        if (!active) return;
        setRecent(p.slice(0, 6));
        setTotal(p.length);
        const counts: Record<string, number> = {};
        for (const prompt of p) {
          if (prompt.category_id) counts[prompt.category_id] = (counts[prompt.category_id] ?? 0) + 1;
        }
        setPerCategory(counts);
      })
      .finally(() => active && setLoading(false));
    void getChatSettingsCached().then((s) => {
      if (active) setChatEnabled(s.enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const { enriched, authors } = usePromptCommunity(recent);

  return (
    <div>
      {/* Kop met de achtergrond van de dag: één vraag, één veld. */}
      <section
        aria-labelledby="home-vraag"
        className={`relative overflow-hidden ${HERO_BASE_CLASS[heroBackground]}`}
      >
        {heroBackground === 'effen' ? (
          <LightSweepBackground />
        ) : (
          <Suspense fallback={null}>
            {heroBackground === 'regels' ? (
              <PromptLinesBackground />
            ) : (
              <DashboardBackground variant={heroBackground} />
            )}
          </Suspense>
        )}
        <div className="relative mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-16">
          <h1
            id="home-vraag"
            className="text-center text-4xl font-extrabold leading-tight text-white sm:text-5xl"
          >
            <label htmlFor="home-vraag-veld">Wat wil je maken?</label>
          </h1>

          <form
            onSubmit={handleMake}
            className="mt-6 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 shadow-lg"
          >
            <input
              ref={questionRef}
              id="home-vraag-veld"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                kind
                  ? KIND_OPTIONS[kind].placeholder
                  : 'Bijvoorbeeld: een brief aan bewoners over werk in hun straat'
              }
              className="h-12 min-w-0 flex-1 basis-64 rounded-lg border-0 bg-transparent px-3 text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500"
            />
            {dictation.available && (
              <DictationButton
                state={dictation.state}
                seconds={dictation.seconds}
                stream={dictation.stream}
                onToggle={dictation.toggle}
                size="md"
              />
            )}
            <button type="submit" className="opl-btn-accent h-12 shrink-0 px-5 text-base">
              Maak prompt <ArrowRight size={18} />
            </button>
          </form>

          {/* De soort: kies je niets, dan kiest de AI. Nog eens klikken op de
              gekozen soort zet hem weer uit. */}
          <div
            role="group"
            aria-label="Wat wil je maken? Kies je niets, dan bepaalt de AI het zelf."
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            {[null, ...PROMPT_KINDS].map((k) => {
              const option = k ? KIND_OPTIONS[k] : { label: 'AI kiest', icon: Sparkles };
              const Icon = option.icon;
              const active = kind === k;
              return (
                <button
                  key={k ?? 'auto'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKind(active ? null : k)}
                  className={clsx(
                    'inline-flex h-11 items-center gap-2 rounded border px-3.5 text-sm font-semibold transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-rijksblauw-700',
                    active
                      ? 'border-white bg-white text-rijksblauw-700'
                      : 'border-white/60 bg-rijksblauw-900/30 text-white hover:border-white hover:bg-white/15',
                  )}
                >
                  <Icon size={18} />
                  {option.label}
                </button>
              );
            })}
            <InfoDot
              onDark
              label="Uitleg over de soorten"
              text={
                kind
                  ? KIND_OPTIONS[kind].hint
                  : 'Geen soort gekozen? Dan kiest de AI het framework dat bij je vraag past.'
              }
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* De andere dingen die je hier kunt doen, elk één tegel. Prompt maken
          heeft geen tegel meer: dat is de vraag in de kop hierboven. */}
      <section className="mb-10" aria-labelledby="home-taken">
        <h2 id="home-taken" className="sr-only">
          Andere taken
        </h2>
        <div
          className={clsx(
            'grid grid-cols-1 gap-4 sm:grid-cols-2',
            chatEnabled ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
          )}
        >
          {chatEnabled && (
            <TaskTile
              to="/chat"
              icon={MessageSquare}
              label="Chatten"
              className="bg-rijksblauw-50 text-rijksblauw-700 hover:bg-rijksblauw-100 dark:bg-rijksblauw-500/20 dark:text-white dark:hover:bg-rijksblauw-500/30"
            />
          )}
          <TaskTile
            to="/zoeken"
            icon={Search}
            label="Prompts zoeken"
            count={total}
            countLabel="prompts"
            className="bg-[#76d2b6]/25 text-rijksblauw-700 hover:bg-[#76d2b6]/40 dark:bg-[#76d2b6]/15 dark:text-white dark:hover:bg-[#76d2b6]/25"
          />
          <TaskTile
            to="/technieken"
            icon={Layers}
            label="Technieken leren"
            count={techniques.length || null}
            countLabel="technieken"
            className="bg-[#ffb612]/20 text-rijksblauw-700 hover:bg-[#ffb612]/35 dark:bg-[#ffb612]/15 dark:text-white dark:hover:bg-[#ffb612]/25"
          />
        </div>
      </section>

      {/* Categorieën als iconen met het aantal prompts. */}
      <section className="mb-10" aria-labelledby="home-categorieen">
        <div className="mb-3 flex items-center gap-1">
          <h2
            id="home-categorieen"
            className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200"
          >
            Categorieën
          </h2>
          <InfoDot
            label="Uitleg over categorieën"
            text="Klik een categorie. Het getal is het aantal prompts."
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const count = perCategory[c.id] ?? 0;
            return (
              <Link
                key={c.id}
                to={`/zoeken?category=${c.id}`}
                title={c.description || undefined}
                className="opl-card group relative flex min-h-[7.5rem] flex-col items-center justify-center gap-2.5 px-2 pb-3 pt-5 text-center hover:border-rijksblauw-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rijksblauw-50 text-rijksblauw-700 transition-colors group-hover:bg-rijksblauw-700 group-hover:text-white dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                  <Icon size={24} />
                </span>
                <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                  {c.name}
                </span>
                {!loading && (
                  <span
                    aria-label={`${count} prompts`}
                    className="absolute right-2 top-2 min-w-[1.5rem] rounded-full bg-rijksblauw-700 px-1.5 text-center text-xs font-bold leading-6 text-white dark:bg-rijksblauw-500"
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Nieuwste prompts */}
      <section aria-labelledby="home-nieuw">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="home-nieuw" className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            Nieuwe prompts
          </h2>
          <Link
            to="/zoeken"
            className="inline-flex items-center gap-1 text-sm font-semibold text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
          >
            Alles <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <SkeletonGrid count={6} />
        ) : recent.length === 0 ? (
          <div className="opl-card flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-slate-600 dark:text-slate-300">Er zijn nog geen prompts.</p>
            <button onClick={() => setUploadOpen(true)} className="opl-btn-primary">
              <Plus size={18} /> Nieuwe prompt
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                author={p.created_by_user ? authors[p.created_by_user] : null}
                onChanged={(u) => setRecent((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
              />
            ))}
          </div>
        )}
      </section>

      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(prompt) => navigate(`/prompt/${prompt.id}`)}
      />
    </div>
  );
}

/** Eén taaktegel: groot icoon, één label, een pijl en soms een aantal. */
function TaskTile({
  to,
  icon: Icon,
  label,
  count,
  countLabel,
  className,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  count?: number | null;
  countLabel?: string;
  className: string;
}): ReactNode {
  return (
    <Link
      to={to}
      className={clsx(
        'flex min-h-[8.5rem] flex-col justify-between gap-4 rounded-xl p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
        className,
      )}
    >
      <span className="flex items-start justify-between">
        <Icon size={44} strokeWidth={1.5} />
        {count != null && (
          <span
            aria-label={`${count} ${countLabel ?? ''}`.trim()}
            className="rounded-full bg-white px-2.5 py-0.5 text-sm font-bold text-rijksblauw-700"
          >
            {count}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="text-2xl font-bold leading-tight">{label}</span>
        <ArrowRight size={22} className="shrink-0" />
      </span>
    </Link>
  );
}
