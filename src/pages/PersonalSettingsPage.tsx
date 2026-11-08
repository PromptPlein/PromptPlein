import { Navigate, useLocation, useParams } from 'react-router-dom';
import AccessibilityHelp from '@/components/settings/AccessibilityHelp';
import AccessibilitySettings from '@/components/settings/AccessibilitySettings';
import ChatInstructionSettings from '@/components/settings/ChatInstructionSettings';
import ChatIntakeSettings from '@/components/settings/ChatIntakeSettings';
import ChatMemorySettings from '@/components/settings/ChatMemorySettings';
import { HELP_PATH } from '@/lib/shortcuts';
import { useAuth } from '@/context/AuthContext';
import PageColumn, { Panel } from '@/components/common/PageColumn';
import '@nldd/design-system/container';
import '@nldd/design-system/link';
import '@nldd/design-system/spacer';
import '@nldd/design-system/tab-bar';

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
  const { configured, isAuthenticated } = useAuth();
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
    <PageColumn title="Instellingen" icon="gear">

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

      {/* Elk onderdeel op een eigen witte kaart. */}
      <nldd-container gap="16">
        {onderdeel === 'chat' && (
          <>
            <Panel>
              <ChatIntakeSettings />
            </Panel>
            <Panel>
              <ChatInstructionSettings />
            </Panel>
            {/* Het geheugen bestaat alleen met een account; zonder blijft de kaart weg. */}
            {(!configured || isAuthenticated) && (
              <Panel>
                <ChatMemorySettings />
              </Panel>
            )}
          </>
        )}
        {accessibility && !sub && (
          <Panel>
            <AccessibilitySettings />
          </Panel>
        )}
        {accessibility && sub === 'hulp' && (
          <Panel>
            <AccessibilityHelp />
          </Panel>
        )}
      </nldd-container>
    </PageColumn>
  );
}
