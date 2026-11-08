import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { getShareByToken, trackShareView } from '@/services/shareService';
import { getPrompt } from '@/services/repository';
import { useReferenceData } from '@/context/ReferenceDataContext';
import { useAuth } from '@/context/AuthContext';
import { copyToClipboard, formatDate, sharingLabel } from '@/lib/utils';
import type { EmailShare, Prompt, SharingLevel } from '@/types';

const SHARING_TAG_COLOR: Record<SharingLevel, 'neutral' | 'hemelblauw' | 'violet' | 'groen'> = {
  private: 'neutral',
  department: 'hemelblauw',
  ministry: 'violet',
  public: 'groen',
};

export default function SharePreviewPage() {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const navigate = useNavigate();
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
    notify.success('Prompt gekopieerd');
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading || authLoading) {
    return (
      <nldd-simple-section>
        <nldd-title slot="header" heading-level={1} size={2} text="Gedeelde prompt"></nldd-title>
        <nldd-activity-indicator size="32" show-text text="Prompt laden"></nldd-activity-indicator>
      </nldd-simple-section>
    );
  }

  // De deel-link bestaat echt niet (token onbekend) → genuine 'niet gevonden'.
  if (!share) {
    return (
      <nldd-simple-section>
        <nldd-inline-dialog
          icon="link"
          heading-level={1}
          text="Link niet gevonden"
          supporting-text="Deze deel-link bestaat niet (meer) of is verlopen."
        >
          <nldd-button-group slot="actions">
            <nldd-button appearance="primary" href="/" text="Naar de bibliotheek"></nldd-button>
          </nldd-button-group>
        </nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  // De deel-link bestaat wél, maar de prompt is niet zichtbaar. Dat komt door de
  // zichtbaarheidsregels (RLS): de prompt is gedeeld op afdelings-/ministerieniveau.
  // - Niet ingelogd → vraag om in te loggen en kom daarna direct hier terug.
  // - Wel ingelogd → de prompt hoort bij een ander ministerie/afdeling: geen toegang.
  if (!prompt) {
    if (!isAuthenticated) {
      return (
        <nldd-simple-section>
          <nldd-inline-dialog
            icon="lock"
            icon-color="accent"
            heading-level={1}
            text="Log in om deze prompt te bekijken"
            supporting-text="Deze prompt is gedeeld binnen de overheid. Log in met je account; daarna open je de prompt meteen; je hoeft de link niet opnieuw te openen."
          >
            <nldd-button-group slot="actions">
              <nldd-button
                appearance="primary"
                href="/auth/login"
                start-icon="login"
                text="Inloggen"
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  navigate('/auth/login', { state: { from: location.pathname } });
                }}
              ></nldd-button>
            </nldd-button-group>
          </nldd-inline-dialog>
          <nldd-spacer size="16"></nldd-spacer>
          <nldd-text size="sm" color="secondary" horizontal-alignment="center">
            Nog geen account? <nldd-link href="/auth/signup" text="Registreren"></nldd-link>
          </nldd-text>
        </nldd-simple-section>
      );
    }
    // Ingelogd, maar geen toegang: de prompt hoort bij een andere afdeling/ministerie.
    return (
      <nldd-simple-section>
        <nldd-inline-dialog
          icon="lock"
          icon-color="warning"
          heading-level={1}
          text="Geen toegang tot deze prompt"
          supporting-text="Deze prompt is gedeeld binnen een ander ministerie of een andere afdeling, of is nog niet goedgekeurd. Daardoor kun je hem niet bekijken."
        >
          <nldd-button-group slot="actions">
            <nldd-button appearance="primary" href="/" text="Naar de bibliotheek"></nldd-button>
          </nldd-button-group>
        </nldd-inline-dialog>
      </nldd-simple-section>
    );
  }

  const category = categoryById(prompt.category_id);
  const role = roleById(prompt.role_id);

  return (
    <nldd-simple-section>
      <nldd-title
        slot="header"
        heading-level={1}
        size={2}
        overline="Gedeelde prompt"
        text={prompt.title}
        supporting-text={prompt.description || undefined}
      ></nldd-title>
      <nldd-container max-width="48rem">
        <nldd-container layout="wrap" gap="8">
          {category && <nldd-tag color="lintblauw" text={category.name}></nldd-tag>}
          {role && <nldd-tag color="neutral" text={role.name}></nldd-tag>}
          <nldd-tag color={SHARING_TAG_COLOR[prompt.sharing_level] ?? 'neutral'} text={sharingLabel(prompt.sharing_level)}></nldd-tag>
        </nldd-container>
        <nldd-spacer size="32"></nldd-spacer>

        <nldd-container layout="row" gap="8" vertical-alignment="center">
          <nldd-title heading-level={2} size={5} text="Prompt-inhoud"></nldd-title>
          <nldd-spacer size="flexible" direction="horizontal"></nldd-spacer>
          <nldd-button
            appearance="primary"
            start-icon={copied ? 'check-mark' : 'copy'}
            text="Kopieer"
            onClick={copy}
          ></nldd-button>
        </nldd-container>
        <nldd-spacer size="12"></nldd-spacer>
        <nldd-code-viewer wrap no-copy max-height="400px">{prompt.content}</nldd-code-viewer>
        <nldd-spacer size="12"></nldd-spacer>
        <nldd-text size="sm" color="secondary">
          Gedeeld door {share.shared_by || 'een collega'} · {formatDate(share.shared_at)} · {share.view_count + 1}{' '}
          weergaven
        </nldd-text>
        <nldd-spacer size="24"></nldd-spacer>
        <nldd-link href={`/prompt/${prompt.id}`} end-icon="arrow-right" text="Open in de bibliotheek"></nldd-link>
      </nldd-container>
    </nldd-simple-section>
  );
}
