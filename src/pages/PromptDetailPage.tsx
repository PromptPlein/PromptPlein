import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  Pencil,
  Save,
  X,
  Star,
  Share2,
  Trash2,
  History,
  Download,
  ThumbsUp,
  Building2,
} from '@/components/common/icons';
import toast from 'react-hot-toast';
import ShareModal from '@/components/share/ShareModal';
import ExportModal from '@/components/export/ExportModal';
import CollaborationPanel from '@/components/collaboration/CollaborationPanel';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import {
  deletePrompt,
  getPrompt,
  listOptimizations,
  savePromptEdit,
  toggleFavorite,
} from '@/services/repository';
import { getLikeInfo, toggleLike } from '@/services/likeService';
import { getPublicProfile, firstName } from '@/services/communityService';
import {
  copyToClipboard,
  formatDate,
  sharingBadgeClasses,
  sharingLabel,
} from '@/lib/utils';
import type { Optimization, Prompt, PublicProfile } from '@/types';

export default function PromptDetailPage() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { categoryById, roleById, techniqueById, organizationById } = useReferenceData();
  const { user, configured, isAdmin } = useAuth();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [optimizations, setOptimizations] = useState<Optimization[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [author, setAuthor] = useState<PublicProfile | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // Inline bewerken (alleen voor eigenaar/admin).
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  // Verhoogd na een opslag, zodat de versiegeschiedenis ververst.
  const [versionRefresh, setVersionRefresh] = useState(0);

  useEffect(() => {
    if (!promptId) return;
    let active = true;
    setLoading(true);
    Promise.all([getPrompt(promptId), listOptimizations(promptId)])
      .then(([p, opts]) => {
        if (!active) return;
        setPrompt(p);
        setOptimizations(opts);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [promptId]);

  // Likes + auteursprofiel laden zodra de prompt bekend is.
  useEffect(() => {
    if (!prompt) return;
    let active = true;
    getLikeInfo([prompt.id], user?.id)
      .then((info) => {
        if (!active) return;
        const state = info[prompt.id];
        if (state) {
          setLikeCount(state.like_count);
          setLiked(state.liked_by_me);
        }
      })
      .catch(() => undefined);
    if (prompt.created_by_user) {
      getPublicProfile(prompt.created_by_user)
        .then((p) => active && setAuthor(p))
        .catch(() => active && setAuthor(null));
    } else {
      setAuthor(null);
    }
    return () => {
      active = false;
    };
  }, [prompt, user?.id]);

  async function handleCopy(text: string) {
    await copyToClipboard(text);
    setCopied(true);
    toast.success('Gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleFavorite() {
    if (!prompt) return;
    const updated = await toggleFavorite(prompt);
    setPrompt(updated);
  }

  async function handleLike() {
    if (!prompt) return;
    if (configured && !user) {
      toast.error('Log in om een prompt te liken.');
      navigate('/auth/login');
      return;
    }
    setLikeBusy(true);
    const prevCount = likeCount;
    const prevLiked = liked;
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));
    try {
      const state = await toggleLike(prompt.id, user?.id ?? 'local-user');
      setLiked(state.liked_by_me);
      setLikeCount(state.like_count);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      toast.error('Liken mislukt');
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleDelete() {
    if (!prompt) return;
    if (!confirm('Weet je zeker dat je deze prompt wilt verwijderen?')) return;
    await deletePrompt(prompt.id);
    toast.success('Prompt verwijderd');
    navigate('/zoeken');
  }

  function startEditing() {
    if (!prompt) return;
    setDraftTitle(prompt.title);
    setDraftDescription(prompt.description ?? '');
    setDraftContent(prompt.content);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function handleSaveEdit() {
    if (!prompt) return;
    if (!draftTitle.trim()) {
      toast.error('Een titel is verplicht.');
      return;
    }
    setSaving(true);
    try {
      const updated = await savePromptEdit(
        prompt,
        { title: draftTitle, description: draftDescription, content: draftContent },
        user?.id,
      );
      setPrompt(updated);
      setEditing(false);
      setVersionRefresh((n) => n + 1); // versiegeschiedenis verversen
      toast.success('Prompt opgeslagen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="skeleton mb-4 h-8 w-2/3 rounded" />
        <div className="skeleton h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-slate-600 dark:text-slate-300">Deze prompt bestaat niet (meer).</p>
        <Link to="/zoeken" className="opl-btn-primary mt-4 inline-flex">
          Terug naar zoeken
        </Link>
      </div>
    );
  }

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);
  // Alleen de eigenaar of een admin mag de prompt bewerken of verwijderen.
  const isOwner = !!user && prompt.created_by_user === user.id;
  const canManage = isAdmin || isOwner;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft size={16} /> Terug
      </button>

      <div className="opl-card p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          {editing ? (
            <input
              className="opl-input flex-1 text-xl font-bold"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Titel van de prompt"
              aria-label="Titel"
            />
          ) : (
            <h1 className="text-2xl font-bold text-rijksblauw-700 dark:text-rijksblauw-200">{prompt.title}</h1>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={handleLike}
              disabled={likeBusy}
              className={
                liked
                  ? 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-rijksblauw-600 dark:text-rijksblauw-300'
                  : 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-slate-400 hover:bg-rijksblauw-50 hover:text-rijksblauw-600 dark:text-slate-500 dark:hover:bg-rijksblauw-500/10 dark:hover:text-rijksblauw-300'
              }
              aria-label={liked ? 'Like intrekken' : 'Prompt liken'}
              aria-pressed={liked}
              title={liked ? 'Like intrekken' : 'Vind ik goed'}
            >
              <ThumbsUp size={20} className={liked ? 'fill-rijksblauw-500/20' : ''} />
              <span className="tabular-nums">{likeCount}</span>
            </button>
            <button
              onClick={handleFavorite}
              className="rounded-md p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-500 dark:text-slate-500 dark:hover:bg-amber-500/10"
              aria-label="Favoriet"
            >
              <Star size={22} className={prompt.is_favorite ? 'fill-amber-400 text-amber-400' : ''} />
            </button>
          </div>
        </div>

        {editing ? (
          <textarea
            className="opl-input mb-4 min-h-[60px] resize-y"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="Korte omschrijving (optioneel)"
            aria-label="Omschrijving"
          />
        ) : (
          prompt.description && (
            <p className="mb-4 text-slate-600 dark:text-slate-300">{prompt.description}</p>
          )
        )}

        <div className="mb-5 flex flex-wrap gap-1.5">
          {category && (
            <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">{category.name}</span>
          )}
          {role && (
            <span className="opl-badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{role.name}</span>
          )}
          <span className={`opl-badge ${sharingBadgeClasses(prompt.sharing_level)}`}>
            {sharingLabel(prompt.sharing_level)}
          </span>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Prompt-inhoud</h2>
          {!editing && (
            <button
              onClick={() => handleCopy(prompt.content)}
              className="inline-flex items-center gap-1 text-sm text-rijksblauw-500 hover:text-rijksblauw-700 dark:text-rijksblauw-300 dark:hover:text-rijksblauw-200"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} Kopiëren
            </button>
          )}
        </div>
        {editing ? (
          <textarea
            className="mb-5 min-h-[280px] w-full resize-y rounded-xl border border-rijksblauw-300 bg-white p-4 font-mono text-[13px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-rijksblauw-500/30 dark:border-rijksblauw-500/40 dark:bg-slate-900 dark:text-slate-200"
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            aria-label="Prompt-inhoud"
          />
        ) : (
          <pre className="mb-5 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {prompt.content}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          {editing ? (
            <>
              <button onClick={handleSaveEdit} disabled={saving} className="opl-btn-primary">
                <Save size={16} /> {saving ? 'Opslaan…' : 'Prompt opslaan'}
              </button>
              <button onClick={cancelEditing} disabled={saving} className="opl-btn-secondary">
                <X size={16} /> Annuleren
              </button>
            </>
          ) : (
            <>
              {/* Bewerken alleen voor eigenaar/admin. */}
              {canManage && (
                <button onClick={startEditing} className="opl-btn-primary">
                  <Pencil size={16} /> Bewerken
                </button>
              )}
              <button onClick={() => setShareOpen(true)} className="opl-btn-secondary">
                <Share2 size={16} /> Delen
              </button>
              <button onClick={() => setExportOpen(true)} className="opl-btn-secondary">
                <Download size={16} /> Exporteren
              </button>
              {/* Verwijderen alleen voor eigenaar/admin. */}
              {canManage && (
                <button
                  onClick={handleDelete}
                  className="opl-btn-ghost ml-auto text-rijksrood hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  <Trash2 size={16} /> Verwijderen
                </button>
              )}
            </>
          )}
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          Aangemaakt door{' '}
          {prompt.created_by_user ? (
            <Link
              to={`/community/${prompt.created_by_user}`}
              className="font-medium text-rijksblauw-600 hover:underline dark:text-rijksblauw-300"
            >
              {author?.full_name ? firstName(author.full_name) : prompt.created_by || 'onbekend'}
            </Link>
          ) : (
            <span className="font-medium text-slate-500 dark:text-slate-400">
              {prompt.created_by || 'onbekend'}
            </span>
          )}
          {(() => {
            const org = organizationById(author?.organization_id ?? prompt.organization_id);
            return org ? (
              <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                <Building2 size={12} /> {org.name}
              </span>
            ) : null;
          })()}
          <span>· {formatDate(prompt.created_at)}</span>
        </p>
      </div>

      {/* Eerdere optimalisaties */}
      {optimizations.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-rijksblauw-700 dark:text-rijksblauw-200">
            <History size={20} /> Eerdere optimalisaties ({optimizations.length})
          </h2>
          <div className="space-y-3">
            {optimizations.map((opt) => {
              const tech = techniqueById(opt.technique_id);
              return (
                <div key={opt.id} className="opl-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="opl-badge bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200">
                      {tech?.name ?? 'Techniek'}
                    </span>
                    <button
                      onClick={() => handleCopy(opt.optimized_content)}
                      className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                      aria-label="Kopieer optimalisatie"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {opt.optimized_content}
                  </pre>
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{formatDate(opt.created_at)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <CollaborationPanel
        prompt={prompt}
        refreshKey={versionRefresh}
        canEditVisibility={canManage}
        onVisibilityChanged={async () => {
          // Zichtbaarheid is aangepast → prompt opnieuw ophalen zodat de
          // sharing-badge bovenaan de pagina klopt.
          const fresh = await getPrompt(prompt.id);
          if (fresh) setPrompt(fresh);
        }}
      />

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} prompt={prompt} />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        prompt={prompt}
        meta={{ categoryName: category?.name, roleName: role?.name }}
      />
    </div>
  );
}
