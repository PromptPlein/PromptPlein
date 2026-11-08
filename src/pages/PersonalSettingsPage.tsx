import { Navigate, useLocation, useParams } from 'react-router-dom';
import AccessibilityHelp from '@/components/settings/AccessibilityHelp';
import AccessibilitySettings from '@/components/settings/AccessibilitySettings';
import ChatInstructionSettings from '@/components/settings/ChatInstructionSettings';
import ChatIntakeSettings from '@/components/settings/ChatIntakeSettings';
import ChatMemorySettings from '@/components/settings/ChatMemorySettings';
import { HELP_PATH } from '@/lib/shortcuts';
import '@nldd/design-system/container';
import '@nldd/design-system/link';
import '@nldd/design-system/simple-section';
import '@nldd/design-system/spacer';
import '@nldd/design-system/tab-bar';
import '@nldd/design-system/title';

const PARTS = [
  { slug: 'chat', label: 'Chat', icon: 'message-rectangle-text' },
  { slug: 'toegankelijkheid', label: 'Toegankelijkheid', icon: 'accessibility' },
] as const;

/**
 * Persoonlijke instellingen. Openbaar: toegankelijkheid moet ook zonder account
 * in te stellen zijn. Elk onderdeel heeft een eigen adres en de navigatie bestaat
 * uit gewone links, zodat toetsenbord en schermlezer ze vanzelf begrijpen.
 */
export default function PersonalSettingsPage() {
  const { onderdeel, sub } = useParams();
  const { pathname } = useLocation();
  // Het oude adres van de hulppagina, van voordat die onder Toegankelijkheid viel.
  if (onderdeel === 'hulp') return <Navigate to={HELP_PATH} replace />;
  if (!PARTS.some((part) => part.slug === onderdeel)) {
    return <Navigate to="/instellingen/chat" replace />;
  }
  const accessibility = onderdeel === 'toegankelijkheid';
  if (sub && !(accessibility && sub === 'hulp')) {
    return <Navigate to={`/instellingen/${onderdeel}`} replace />;
  }
  const path = pathname.replace(/\/$/, '');

  return (
    <nldd-simple-section>
      <nldd-title slot="header" heading-level={1} size={2} text="Instellingen"></nldd-title>
      <nldd-container max-width="42rem">

      <nldd-tab-bar navigation accessible-label="Onderdelen van de instellingen">
        {PARTS.map(({ slug, label, icon }) => (
          <nldd-tab-bar-item
            key={slug}
            href={`/instellingen/${slug}`}
            text={label}
            icon={icon}
            current={onderdeel === slug || undefined}
          ></nldd-tab-bar-item>
        ))}
      </nldd-tab-bar>

      {accessibility && (
        <>
          <nldd-spacer size="16"></nldd-spacer>
          {path === HELP_PATH ? (
            <nldd-link href="/instellingen/toegankelijkheid" size="sm" start-icon="arrow-left" text="Terug naar Instellen"></nldd-link>
          ) : (
            <nldd-link href={HELP_PATH} size="sm" start-icon="question-mark-circle" text="Hulp en sneltoetsen"></nldd-link>
          )}
        </>
      )}
      <nldd-spacer size="24"></nldd-spacer>

      <nldd-container gap="24">
        {onderdeel === 'chat' && (
          <>
            <ChatIntakeSettings />
            <ChatInstructionSettings />
            <ChatMemorySettings />
          </>
        )}
        {accessibility && !sub && <AccessibilitySettings />}
        {accessibility && sub === 'hulp' && <AccessibilityHelp />}
      </nldd-container>
      </nldd-container>
    </nldd-simple-section>
  );
}
