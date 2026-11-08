import { useEffect, useRef, useState, type FormEvent } from 'react';
import { notify } from '@/lib/notify';
import { useNlddValue } from '@/lib/nldd';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import {
  addComment,
  deleteComment,
  listComments,
  listVersions,
} from '@/services/collaborationService';
import VisibilityApprovalPanel from '@/components/collaboration/VisibilityApprovalPanel';
import type { Prompt, PromptComment, PromptVersion } from '@/types';
import '@nldd/design-system/button';
import '@nldd/design-system/card';
import '@nldd/design-system/cell';
import '@nldd/design-system/code-viewer';
import '@nldd/design-system/container';
import '@nldd/design-system/form';
import '@nldd/design-system/icon-cell';
import '@nldd/design-system/inline-dialog';
import '@nldd/design-system/list';
import '@nldd/design-system/list-item';
import '@nldd/design-system/list-item-segment';
import '@nldd/design-system/spacer';
import '@nldd/design-system/text';
import '@nldd/design-system/text-cell';
import '@nldd/design-system/text-field';
import '@nldd/design-system/title';

/**
 * Comments are switched off: prompts can be read and liked, not commented on
 * (that would need moderation). Existing comments stay in the database. Set
 * this to `true` to switch the feature back on: the comment block appears and
 * comments load again.
 */
const COMMENTS_ENABLED = false;

function authorName(profile?: { full_name?: string | null; email?: string } | null): string {
  return profile?.full_name || profile?.email || 'Gebruiker';
}

export default function CollaborationPanel({
  prompt,
  refreshKey,
  /** Mag de huidige gebruiker de deelniveaus aanpassen (eigenaar/admin)? */
  canEditVisibility = false,
  /** Aangeroepen nadat de zichtbaarheid is aangepast (om de pagina te verversen). */
  onVisibilityChanged,
}: {
  prompt: Prompt;
  /** Verhoog deze waarde om deelniveaus/versies opnieuw te laden (bijv. na opslaan). */
  refreshKey?: number;
  canEditVisibility?: boolean;
  onVisibilityChanged?: () => void;
}) {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [comments, setComments] = useState<PromptComment[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [newComment, setNewComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [openVersion, setOpenVersion] = useState<string | null>(null);
  const commentRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(commentRef, newComment, setNewComment);

  async function reload() {
    try {
      const [m, v] = await Promise.all([
        COMMENTS_ENABLED ? listComments(prompt.id) : Promise.resolve([]),
        listVersions(prompt.id),
      ]);
      setComments(m);
      setVersions(v);
    } catch {
      /* not blocking */
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.id, refreshKey]);

  function onSubmitComment(e: FormEvent) {
    e.preventDefault();
    void handleAddComment();
  }

  async function handleAddComment() {
    if (!user || !newComment.trim()) return;
    setBusy(true);
    try {
      await addComment(prompt.id, user.id, newComment);
      setNewComment('');
      await reload();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Reactie plaatsen mislukt');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nldd-spacer size="32"></nldd-spacer>
      <nldd-container layout="stack" gap="24">
        {/* Sharing levels and the approval per level */}
        <VisibilityApprovalPanel
          promptId={prompt.id}
          refreshKey={refreshKey}
          canEdit={canEditVisibility}
          organizationId={prompt.organization_id ?? null}
          onChanged={onVisibilityChanged}
        />

        {/* Comments, switched off through COMMENTS_ENABLED. */}
        {COMMENTS_ENABLED && (
          <nldd-card>
            <nldd-container padding="20" gap="12">
              <nldd-title heading-level={2} size={5} text={`Reacties (${comments.length})`}></nldd-title>
              <nldd-list accessible-label="Reacties">
                <nldd-inline-dialog slot="empty" text="Nog geen reacties"></nldd-inline-dialog>
                {comments.map((c) => (
                  <nldd-list-item key={c.id}>
                    <nldd-text-cell
                      overline={`${authorName(c.profile)} · ${formatDate(c.created_at)}`}
                      text={c.body}
                    ></nldd-text-cell>
                    {(isAdmin || c.user_id === user?.id) && (
                      <nldd-list-item-segment
                        button
                        accessible-label={`Reactie van ${authorName(c.profile)} verwijderen`}
                        onClick={async () => {
                          await deleteComment(c.id);
                          await reload();
                        }}
                      >
                        <nldd-icon-cell icon="trash" size="20" color="critical"></nldd-icon-cell>
                      </nldd-list-item-segment>
                    )}
                  </nldd-list-item>
                ))}
              </nldd-list>
              {isAuthenticated ? (
                <nldd-form>
                  <form onSubmit={onSubmitComment}>
                    <nldd-text-field ref={commentRef} accessible-label="Reactie" placeholder="Schrijf een reactie…">
                      <nldd-button
                        slot="button"
                        type="submit"
                        text="Plaats"
                        disabled={busy || undefined}
                      ></nldd-button>
                    </nldd-text-field>
                  </form>
                </nldd-form>
              ) : (
                <nldd-text size="xs" color="secondary">
                  Log in om te reageren.
                </nldd-text>
              )}
            </nldd-container>
          </nldd-card>
        )}

        {/* Version history */}
        <nldd-card>
          <nldd-container padding="20" gap="12">
            <nldd-title heading-level={2} size={5} text={`Versiegeschiedenis (${versions.length})`}></nldd-title>
            <nldd-list accessible-label="Versies">
              <nldd-inline-dialog slot="empty" text="Nog geen versies vastgelegd"></nldd-inline-dialog>
              {versions.map((v) => {
                const isOpen = openVersion === v.id;
                return [
                  <nldd-list-item
                    key={v.id}
                    button
                    expanded={isOpen || undefined}
                    onClick={() => setOpenVersion(isOpen ? null : v.id)}
                  >
                    <nldd-text-cell
                      text={`v${v.version}`}
                      overline={formatDate(v.created_at)}
                      supporting-text={v.change_summary || undefined}
                    ></nldd-text-cell>
                    <nldd-icon-cell icon="chevron-right" size="20" color="secondary" disclosure></nldd-icon-cell>
                  </nldd-list-item>,
                  isOpen && (
                    <nldd-list-item key={`${v.id}-inhoud`}>
                      <nldd-cell width="full">
                        <nldd-container layout="stack" gap="8" padding-block="8">
                          <nldd-text size="xs" weight="medium" color="secondary">
                            {v.title}
                          </nldd-text>
                          <nldd-code-viewer wrap max-height="12rem">
                            {v.content}
                          </nldd-code-viewer>
                        </nldd-container>
                      </nldd-cell>
                    </nldd-list-item>
                  ),
                ];
              })}
            </nldd-list>
          </nldd-container>
        </nldd-card>
      </nldd-container>
    </>
  );
}
