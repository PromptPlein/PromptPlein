import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import MenuAction from '@/components/common/MenuAction';
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
import { copyToClipboard, formatDate, sharingLabel } from '@/lib/utils';
import type { Optimization, Prompt, PublicProfile, SharingLevel } from '@/types';

const SHARING_TAG_COLOR: Record<SharingLevel, 'neutral' | 'hemelblauw' | 'violet' | 'groen'> = {
  private: 'neutral',
  department: 'hemelblauw',
  ministry: 'violet',
  public: 'groen',
};

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteDialogRef = useRef<HTMLElement>(null);
  useNlddEvent(deleteDialogRef, 'close', () => setConfirmDelete(false));
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
    notify.success('Gekopieerd');
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
      notify.error('Log in om een prompt te liken.');
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
      notify.error('Liken mislukt');
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleDelete() {
    if (!prompt) return;
    setConfirmDelete(false);
    await deletePrompt(prompt.id);
    notify.success('Prompt verwijderd');
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
      notify.error('Een titel is verplicht.');
      return;
    }
    setSaving(true);
    try {
      const updated = await savePromptEdit(
        prompt,
        {
          title: draftTitle,
          description: draftDescription,
          content: draftContent,
        },
        user?.id,
      );
      setPrompt(updated);
      setEditing(false);
      setVersionRefresh((n) => n + 1); // versiegeschiedenis verversen
      notify.success('Prompt opgeslagen');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <nldd-simple-section>
        <nldd-title heading-level={1} size={2} text="Prompt laden"></nldd-title>
        <nldd-spacer size="24"></nldd-spacer>
        <nldd-inline-dialog
          variant="loading"
          text="Even geduld, de prompt wordt geladen."
        ></nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  if (!prompt) {
    return (
      <nldd-simple-section>
        <nldd-inline-dialog
          heading-level={1}
          icon="search"
          icon-color="secondary"
          text="Deze prompt bestaat niet (meer)."
        >
          <nldd-button-group slot="actions">
            <nldd-button appearance="primary" href="/zoeken" text="Terug naar zoeken"></nldd-button>
          </nldd-button-group>
        </nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);
  // Alleen de eigenaar of een admin mag de prompt bewerken of verwijderen.
  const isOwner = !!user && prompt.created_by_user === user.id;
  const canManage = isAdmin || isOwner;
  const org = organizationById(author?.organization_id ?? prompt.organization_id);
  const authorName = author?.full_name ? firstName(author.full_name) : prompt.created_by || 'onbekend';

  return (
    <>
      <nldd-simple-section>
        <nldd-container slot="header" max-width="48rem">
          {editing ? (
            <nldd-link
              href={`/prompt/${prompt.id}`}
              size="sm"
              start-icon="close"
              text="Annuleer bewerken"
              onClick={(e) => {
                e.preventDefault();
                if (!saving) cancelEditing();
              }}
            ></nldd-link>
          ) : (
            <nldd-link
              href="/zoeken"
              size="sm"
              start-icon="arrow-left"
              text="Terug"
              onClick={(e) => {
                if (window.history.length <= 1) return;
                e.preventDefault();
                navigate(-1);
              }}
            ></nldd-link>
          )}
          <nldd-spacer size="16"></nldd-spacer>
          {editing ? (
            <nldd-title
              heading-level={1}
              size={2}
              text="Prompt bewerken"
              overline={prompt.title}
            ></nldd-title>
          ) : (
            <nldd-title
              heading-level={1}
              size={2}
              text={prompt.title}
              supporting-text={prompt.description || undefined}
            ></nldd-title>
          )}
          <nldd-spacer size="12"></nldd-spacer>
          <nldd-container layout="wrap" gap="6">
            {category && <nldd-tag color="lintblauw" text={category.name}></nldd-tag>}
            {role && <nldd-tag color="neutral" text={role.name}></nldd-tag>}
            <nldd-tag
              color={SHARING_TAG_COLOR[prompt.sharing_level] ?? 'neutral'}
              text={sharingLabel(prompt.sharing_level)}
            ></nldd-tag>
          </nldd-container>
        </nldd-container>

        <nldd-container max-width="48rem">
          {editing ? (
            <nldd-form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveEdit();
                }}
              >
                <EditForm
                  title={draftTitle}
                  description={draftDescription}
                  content={draftContent}
                  onTitle={setDraftTitle}
                  onDescription={setDraftDescription}
                  onContent={setDraftContent}
                />
                <nldd-form-actions>
                  <nldd-button-group>
                    <nldd-button
                      appearance="primary"
                      type="submit"
                      start-icon="save"
                      text="Bewaar prompt"
                      loading={saving || undefined}
                      loading-text="Bezig met opslaan"
                    ></nldd-button>
                  </nldd-button-group>
                </nldd-form-actions>
              </form>
            </nldd-form>
          ) : (
            <>
              <nldd-toolbar accessible-label="Acties voor deze prompt">
                {canManage && (
                  <nldd-toolbar-item slot="start" priority="3">
                    <nldd-button
                      appearance="primary"
                      start-icon="pencil"
                      text="Bewerk"
                      onClick={startEditing}
                    ></nldd-button>
                    <MenuAction slot="overflow" icon="pencil" text="Bewerk" onSelect={startEditing} />
                  </nldd-toolbar-item>
                )}
                <nldd-toolbar-item slot="start" priority="2">
                  <nldd-button
                    appearance="neutral-tinted"
                    start-icon="share"
                    text="Deel"
                    popup-type="dialog"
                    onClick={() => setShareOpen(true)}
                  ></nldd-button>
                  <MenuAction slot="overflow" icon="share" text="Deel" onSelect={() => setShareOpen(true)} />
                </nldd-toolbar-item>
                <nldd-toolbar-item slot="start" priority="1">
                  <nldd-button
                    appearance="neutral-tinted"
                    start-icon="download"
                    text="Exporteer"
                    popup-type="dialog"
                    onClick={() => setExportOpen(true)}
                  ></nldd-button>
                  <MenuAction
                    slot="overflow"
                    icon="download"
                    text="Exporteer"
                    onSelect={() => setExportOpen(true)}
                  />
                </nldd-toolbar-item>
                <nldd-toolbar-item slot="end" priority="3">
                  <nldd-tooltip text={liked ? 'Like intrekken' : 'Vind ik goed'}>
                    <nldd-toggle-button
                      appearance="neutral-transparent"
                      icon="hand-thumbs-up"
                      text={String(likeCount)}
                      accessible-label={`${liked ? 'Like intrekken' : 'Prompt liken'}, ${likeCount}`}
                      selected={liked || undefined}
                      onClick={() => {
                        if (!likeBusy) void handleLike();
                      }}
                    ></nldd-toggle-button>
                  </nldd-tooltip>
                  <MenuAction
                    slot="overflow"
                    type="checkbox"
                    selected={liked || undefined}
                    icon="hand-thumbs-up"
                    text={`Vind ik goed (${likeCount})`}
                    onSelect={() => {
                      if (!likeBusy) void handleLike();
                    }}
                  />
                </nldd-toolbar-item>
                <nldd-toolbar-item slot="end" priority="3">
                  <nldd-toggle-button
                    appearance="neutral-transparent"
                    variant="icon"
                    icon="star"
                    selected-icon="star-filled"
                    accessible-label="Favoriet"
                    selected={prompt.is_favorite || undefined}
                    onClick={() => void handleFavorite()}
                  ></nldd-toggle-button>
                  <MenuAction
                    slot="overflow"
                    type="checkbox"
                    selected={prompt.is_favorite || undefined}
                    icon="star"
                    text="Favoriet"
                    onSelect={() => void handleFavorite()}
                  />
                </nldd-toolbar-item>
                {canManage && (
                  <nldd-toolbar-item slot="end" priority="0">
                    <nldd-button
                      appearance="critical-transparent"
                      start-icon="trash"
                      text="Verwijder"
                      popup-type="dialog"
                      onClick={() => setConfirmDelete(true)}
                    ></nldd-button>
                    <MenuAction
                      slot="overflow"
                      destructive
                      icon="trash"
                      text="Verwijder"
                      onSelect={() => setConfirmDelete(true)}
                    />
                  </nldd-toolbar-item>
                )}
              </nldd-toolbar>
              <nldd-spacer size="32"></nldd-spacer>

              <nldd-container layout="row" gap="8" vertical-alignment="center">
                <nldd-title heading-level={2} size={4} text="Prompt-inhoud"></nldd-title>
                <nldd-spacer size="flexible"></nldd-spacer>
                <nldd-button
                  appearance="secondary"
                  size="sm"
                  start-icon={copied ? 'check-mark' : 'copy'}
                  text="Kopieer"
                  onClick={() => void handleCopy(prompt.content)}
                ></nldd-button>
              </nldd-container>
              <nldd-spacer size="12"></nldd-spacer>
              <nldd-code-viewer wrap no-copy max-height="360px">
                {prompt.content}
              </nldd-code-viewer>
              <nldd-spacer size="16"></nldd-spacer>

              <nldd-text size="sm" color="secondary">
                Aangemaakt door{' '}
                {prompt.created_by_user ? (
                  <nldd-link href={`/community/${prompt.created_by_user}`} size="inherit" text={authorName}></nldd-link>
                ) : (
                  prompt.created_by || 'onbekend'
                )}
                {org ? ` · ${org.name}` : ''} · {formatDate(prompt.created_at)}
              </nldd-text>
            </>
          )}

          {/* Eerdere optimalisaties */}
          {optimizations.length > 0 && (
            <>
              <nldd-spacer size="32"></nldd-spacer>
              <nldd-container layout="row" gap="8" vertical-alignment="center">
                <nldd-icon icon="history" size="20" color="lintblauw"></nldd-icon>
                <nldd-title
                  heading-level={2}
                  size={4}
                  text={`Eerdere optimalisaties (${optimizations.length})`}
                ></nldd-title>
              </nldd-container>
              <nldd-spacer size="12"></nldd-spacer>
              <nldd-container gap="12">
                {optimizations.map((opt) => {
                  const tech = techniqueById(opt.technique_id);
                  return (
                    <nldd-card key={opt.id}>
                      <nldd-container padding="16">
                        <nldd-container layout="row" gap="8" vertical-alignment="center">
                          <nldd-tag color="lintblauw" text={tech?.name ?? 'Techniek'}></nldd-tag>
                          <nldd-spacer size="flexible"></nldd-spacer>
                          <nldd-icon-button
                            appearance="neutral-transparent"
                            size="sm"
                            icon="copy"
                            accessible-label="Kopieer optimalisatie"
                            onClick={() => void handleCopy(opt.optimized_content)}
                          ></nldd-icon-button>
                        </nldd-container>
                        <nldd-spacer size="8"></nldd-spacer>
                        <nldd-code-viewer wrap no-copy max-height="12rem">
                          {opt.optimized_content}
                        </nldd-code-viewer>
                        <nldd-spacer size="8"></nldd-spacer>
                        <nldd-text size="xs" color="secondary">
                          {formatDate(opt.created_at)}
                        </nldd-text>
                      </nldd-container>
                    </nldd-card>
                  );
                })}
              </nldd-container>
            </>
          )}

          <nldd-spacer size="32"></nldd-spacer>
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
        </nldd-container>
      </nldd-simple-section>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} prompt={prompt} />
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        prompt={prompt}
        meta={{ categoryName: category?.name, roleName: role?.name }}
      />
      <nldd-modal-dialog
        ref={deleteDialogRef}
        open={confirmDelete || undefined}
        variant="alert"
        text={`Verwijder "${prompt.title}"?`}
        supporting-text="De prompt verdwijnt voor iedereen met wie hij gedeeld is. Dit kan niet ongedaan worden gemaakt."
      >
        <nldd-button
          slot="actions"
          appearance="primary"
          text="Behoud prompt"
          onClick={() => setConfirmDelete(false)}
        ></nldd-button>
        <nldd-button
          slot="actions"
          appearance="destructive"
          text="Verwijder prompt"
          onClick={() => void handleDelete()}
        ></nldd-button>
      </nldd-modal-dialog>
    </>
  );
}

/**
 * The edit fields. They mount with the edit mode, so their value bindings
 * attach to fields that exist.
 */
function EditForm({
  title,
  description,
  content,
  onTitle,
  onDescription,
  onContent,
}: {
  title: string;
  description: string;
  content: string;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  onContent: (value: string) => void;
}) {
  const titleRef = useRef<HTMLElement & { value?: string }>(null);
  const descriptionRef = useRef<HTMLElement & { value?: string }>(null);
  const contentRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(titleRef, title, onTitle);
  useNlddValue(descriptionRef, description, onDescription);
  useNlddValue(contentRef, content, onContent);
  return (
    <>
      <nldd-form-field label="Titel">
        <nldd-text-field ref={titleRef} placeholder="Titel van de prompt" required></nldd-text-field>
      </nldd-form-field>
      <nldd-form-field label="Omschrijving" optional>
        <nldd-multi-line-text-field
          ref={descriptionRef}
          rows={2}
          placeholder="Korte omschrijving"
        ></nldd-multi-line-text-field>
      </nldd-form-field>
      <nldd-form-field label="Prompt-inhoud">
        <nldd-multi-line-text-field ref={contentRef} rows={12} resize="vertical"></nldd-multi-line-text-field>
      </nldd-form-field>
    </>
  );
}
