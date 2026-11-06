import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Copy, Check, Library, Eye, ExternalLink, Lock, LogIn } from '@/components/common/icons';
import toast from 'react-hot-toast';
import { getShareByToken, trackShareView } from '@/services/shareService';
import { getPrompt } from '@/services/repository';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard, formatDate, sharingBadgeClasses, sharingLabel } from '@/lib/utils';
import type { EmailShare, Prompt } from '@/types';

export default function SharePreviewPage() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const { categoryById, roleById } = useReferenceData();
  // De zichtbaarheid van de prompt hangt af van de sessie (RLS). Daarom laden we
  // opnieuw zodra de auth-status verandert (bijv. terugkeren na inloggen).
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [share, setShare] = useState<EmailShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  // De weergave maar één keer per bezoek tellen, ook al herladen we na inloggen.
  const viewTracked = useRef(false);

  useEffect(() => {
    if (!token) return;
    // Wacht tot de auth-status bekend is, anders laden we de prompt mogelijk als
    // 'anon' terwijl er net een sessie wordt hersteld.
    if (authLoading) return;
    let active = true;
    setLoading(true);
    (async () => {
      const s = await getShareByToken(token);
      if (!active) return;
      setShare(s);
      if (s) {
        // Tel de weergave eenmalig — niet opnieuw bij de herlaad-na-inloggen.
        if (!viewTracked.current) {
          viewTracked.current = true;
          await trackShareView(token);
        }
        const p = await getPrompt(s.prompt_id);
        if (active) setPrompt(p);
      }
    })().finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // isAuthenticated als dependency: na inloggen laden we de prompt opnieuw,
    // zodat de gebruiker hem meteen ziet zonder de pagina te herladen.
  }, [token, isAuthenticated, authLoading]);

  async function copy() {
    if (!prompt) return;
    await copyToClipboard(prompt.content);
    setCopied(true);
    toast.success('Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading || authLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  // De deel-link bestaat echt niet (token onbekend) → genuine 'niet gevonden'.
  if (!share) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Link niet gevonden
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Deze deel-link bestaat niet (meer) of is verlopen.
        </p>
        <Link to="/" className="opl-btn-primary mt-6 inline-flex">
          Naar de bibliotheek
        </Link>
      </div>
    );
  }

  // De deel-link bestaat wél, maar de prompt is niet zichtbaar. Dat komt door de
  // zichtbaarheidsregels (RLS): de prompt is gedeeld op afdelings-/ministerieniveau.
  // - Niet ingelogd → vraag om in te loggen en kom daarna direct hier terug.
  // - Wel ingelogd → de prompt hoort bij een ander ministerie/afdeling: geen toegang.
  if (!prompt) {
    if (!isAuthenticated) {
      return (
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rijksblauw-50 text-rijksblauw-600 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
            <Lock size={26} />
          </span>
          <h1 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            Log in om deze prompt te bekijken
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Deze prompt is gedeeld binnen de overheid. Log in met je account; daarna open je de
            prompt meteen; je hoeft de link niet opnieuw te openen.
          </p>
          <Link
            to="/auth/login"
            state={{ from: location.pathname }}
            className="opl-btn-primary mt-6 inline-flex items-center gap-2"
          >
            <LogIn size={18} /> Inloggen
          </Link>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Nog geen account?{' '}
            <Link
              to="/auth/signup"
              className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
            >
              Registreren
            </Link>
          </p>
        </div>
      );
    }
    // Ingelogd, maar geen toegang: de prompt hoort bij een andere afdeling/ministerie.
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <Lock size={26} />
        </span>
        <h1 className="text-xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
          Geen toegang tot deze prompt
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Deze prompt is gedeeld binnen een ander ministerie of een andere afdeling, of is nog niet
          goedgekeurd. Daardoor kun je hem niet bekijken.
        </p>
        <Link to="/" className="opl-btn-primary mt-6 inline-flex">
          Naar de bibliotheek
        </Link>
      </div>
    );
  }

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Library size={18} className="text-rijksblauw-500" />
        Gedeelde prompt
        <span className="ml-auto inline-flex items-center gap-1 text-xs">
          <Eye size={13} /> {share.view_count + 1} weergaven
        </span>
      </div>

      <div className="opl-card p-6">
        <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{prompt.title}</h1>
        {prompt.description && <p className="mt-2 text-slate-600 dark:text-slate-300">{prompt.description}</p>}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {category && <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">{category.name}</span>}
          {role && <span className="opl-badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{role.name}</span>}
          <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
            {sharingLabel(prompt.sharing_level)}
          </span>
        </div>

        <div className="mt-5 mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Prompt-inhoud</h2>
          <button onClick={copy} className="inline-flex items-center gap-1 text-sm text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200">
            {copied ? <Check size={14} /> : <Copy size={14} />} Kopiëren
          </button>
        </div>
        <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {prompt.content}
        </pre>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Gedeeld door {share.shared_by || 'een collega'} · {formatDate(share.shared_at)}
        </p>
      </div>

      <div className="mt-4 text-center">
        <Link to={`/prompt/${prompt.id}`} className="inline-flex items-center gap-1 text-sm text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200">
          Open in de bibliotheek <ExternalLink size={14} />
        </Link>
      </div>
    </div>
  );
}
