import { useState } from 'react';
import { Copy, Check, RotateCcw, Save, Share2, Loader2, FolderCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { copyToClipboard, getCurrentUser, SHARING_LEVELS } from '@/lib/utils';
import { createPrompt } from '@/services/repository';
import { generateTitle } from '@/services/optimizeService';
import { useAuth } from '@/context/AuthContext';
import { useReferenceData } from '@/context/ReferenceDataContext';
import ShareModal from '@/components/share/ShareModal';
import type { OptimizeResult, Prompt, SharingLevel, Technique } from '@/types';

interface OptimizedOutputProps {
  result: OptimizeResult;
  /** De gekozen techniek (voor de standaardtitel + categorie van de template). */
  technique?: Technique | null;
  /** Het doel dat de gebruiker beschreef (voor een zinvolle standaardtitel). */
  goal?: string;
  onReset: () => void;
}

export default function OptimizedOutput({ result, technique, goal, onReset }: OptimizedOutputProps) {
  const { profile } = useAuth();
  const { categories } = useReferenceData();
  const [copied, setCopied] = useState(false);

  // Opslaan-formulier
  const [showSave, setShowSave] = useState(false);
  // Start leeg: tijdens het laden zien we alleen het laadscherm, geen oude
  // standaardtitel die later "verspringt" naar de AI-suggestie.
  const [title, setTitle] = useState('');
  const [sharing, setSharing] = useState<SharingLevel>('public');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Prompt | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // AI-titelsuggestie op basis van de inhoud (één keer ophalen bij openen).
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleSuggested, setTitleSuggested] = useState(false);
  // Bewaak of de gebruiker de titel zelf heeft aangepast, zodat de AI-suggestie
  // hun invoer niet overschrijft als die later binnenkomt.
  const [titleTouched, setTitleTouched] = useState(false);

  /** Open het opslaan-formulier en haal eenmalig een AI-titel op uit de inhoud. */
  function openSave() {
    setShowSave(true);
    if (titleSuggested || titleLoading) return;
    setTitleSuggested(true);
    setTitleLoading(true);
    generateTitle({ templateContent: result.optimized_content })
      .then((suggested) => {
        // Alleen overnemen als de gebruiker nog niet zelf heeft getypt.
        if (titleTouched) return;
        // AI-titel als die er is, anders een zinvolle standaardtitel.
        setTitle(suggested || defaultTitle(technique, goal));
      })
      .catch(() => {
        // Suggestie mislukt: val terug op een standaardtitel, tenzij de
        // gebruiker ondertussen zelf heeft getypt.
        if (!titleTouched) setTitle(defaultTitle(technique, goal));
      })
      .finally(() => setTitleLoading(false));
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
    setSaving(true);
    try {
      const prompt = await createPrompt({
        title: title.trim(),
        description: goal?.trim() ? `Doel: ${goal.trim()}` : undefined,
        content: result.optimized_content,
        category_id: categories[0]?.id ?? null,
        sharing_level: sharing,
        created_by: profile?.full_name || getCurrentUser() || 'Onbekend',
      });
      setSaved(prompt);
      setShowSave(false);
      toast.success('Template opgeslagen in de bibliotheek');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
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
          <div>
            <label className="opl-label" htmlFor="tpl-title">
              Titel van de template
            </label>
            <div className="relative">
              <input
                id="tpl-title"
                className="opl-input pr-10"
                value={titleLoading ? '' : title}
                disabled={titleLoading}
                onChange={(e) => {
                  setTitleTouched(true);
                  setTitle(e.target.value);
                }}
                placeholder={
                  titleLoading
                    ? 'Titel wordt bedacht…'
                    : 'Bijv. Vriendelijke afwijzingsbrief aan burger'
                }
              />
              {titleLoading && (
                <Loader2
                  size={16}
                  className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-rijksblauw-400"
                  aria-hidden
                />
              )}
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Sparkles size={12} />
              {titleLoading
                ? 'AI bedenkt een passende titel op basis van de inhoud…'
                : 'Titel voorgesteld op basis van de inhoud — pas hem gerust aan.'}
            </p>
          </div>
          <div>
            <label className="opl-label" htmlFor="tpl-sharing">
              Wie mag hem zien?
            </label>
            <select
              id="tpl-sharing"
              className="opl-input"
              value={sharing}
              onChange={(e) => setSharing(e.target.value as SharingLevel)}
            >
              {SHARING_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {SHARING_LEVELS.find((s) => s.value === sharing)?.description}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="opl-btn-secondary" onClick={() => setShowSave(false)} disabled={saving}>
              Annuleren
            </button>
            <button className="opl-btn-primary" onClick={handleSave} disabled={saving}>
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
