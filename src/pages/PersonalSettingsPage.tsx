import { Navigate, NavLink, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Accessibility, MessageSquare, Settings2, UserRound } from '@/components/common/icons';
import { useAuth } from '@/context/AuthContext';
import AccountSettings from '@/components/settings/AccountSettings';
import AccessibilityHelp from '@/components/settings/AccessibilityHelp';
import AccessibilitySettings from '@/components/settings/AccessibilitySettings';
import ChatInstructionSettings from '@/components/settings/ChatInstructionSettings';
import ChatIntakeSettings from '@/components/settings/ChatIntakeSettings';
import PromptCheckSettings from '@/components/settings/PromptCheckSettings';
import ProfileSettings from '@/components/settings/ProfileSettings';
import ChatMemorySettings from '@/components/settings/ChatMemorySettings';
import WordSettings from '@/components/settings/WordSettings';
import { HELP_PATH } from '@/lib/shortcuts';

const PARTS = [
  { slug: 'profiel', label: 'Profiel', icon: UserRound },
  { slug: 'chat', label: 'Chat', icon: MessageSquare },
  { slug: 'toegankelijkheid', label: 'Toegankelijkheid', icon: Accessibility },
] as const;

const ACCESSIBILITY_PARTS = [
  { to: '/instellingen/toegankelijkheid', label: 'Instellen' },
  { to: HELP_PATH, label: 'Hulp' },
] as const;

/**
 * Profiel en persoonlijke instellingen op één plek. Openbaar: toegankelijkheid
 * moet ook zonder account in te stellen zijn; Profiel vraagt dan om in te loggen.
 * Elk onderdeel heeft een eigen adres en de navigatie bestaat uit gewone links,
 * zodat toetsenbord en schermlezer ze vanzelf begrijpen.
 */
export default function PersonalSettingsPage() {
  const { onderdeel, sub } = useParams();
  const { loading, isAuthenticated } = useAuth();
  // Oude adressen: de hulppagina van voordat die onder Toegankelijkheid viel, en
  // Account, dat nu onder Profiel staat.
  if (onderdeel === 'hulp') return <Navigate to={HELP_PATH} replace />;
  if (onderdeel === 'account') return <Navigate to="/instellingen/profiel" replace />;
  if (!PARTS.some((part) => part.slug === onderdeel)) {
    // Wacht op de sessie, anders belandt een ingelogde gebruiker eerst bij Chat.
    if (loading) return null;
    return <Navigate to={isAuthenticated ? '/instellingen/profiel' : '/instellingen/chat'} replace />;
  }
  const accessibility = onderdeel === 'toegankelijkheid';
  if (sub && !(accessibility && sub === 'hulp')) {
    return <Navigate to={`/instellingen/${onderdeel}`} replace />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-rijksblauw-700 dark:text-rijksblauw-200">
        <Settings2 size={24} aria-hidden="true" />
        {isAuthenticated ? 'Profiel en instellingen' : 'Instellingen'}
      </h1>

      <nav aria-label="Onderdelen van de instellingen">
        <ul className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
          {PARTS.map(({ slug, label, icon: Icon }) => (
            <li key={slug}>
              <NavLink
                to={`/instellingen/${slug}`}
                className={({ isActive }) =>
                  clsx(
                    '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 font-medium transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                    isActive
                      ? 'border-rijksblauw-700 text-rijksblauw-700 dark:border-rijksblauw-200 dark:text-rijksblauw-200'
                      : 'border-transparent text-slate-700 hover:text-rijksblauw-700 dark:text-slate-200 dark:hover:text-rijksblauw-200',
                  )
                }
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {accessibility && (
        <nav aria-label="Onderdelen van Toegankelijkheid">
          <ul className="flex flex-wrap gap-2">
            {ACCESSIBILITY_PARTS.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    clsx(
                      'flex min-h-11 items-center rounded-lg px-3 py-1.5 font-medium transition-colors sm:block sm:min-h-0',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-rijksblauw-500',
                      isActive
                        ? 'bg-rijksblauw-700 text-white dark:bg-rijksblauw-500'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                    )
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {onderdeel === 'chat' && (
        <>
          <ChatIntakeSettings />
          <PromptCheckSettings />
          <WordSettings />
          <ChatInstructionSettings />
          <ChatMemorySettings />
        </>
      )}
      {accessibility && !sub && <AccessibilitySettings />}
      {accessibility && sub === 'hulp' && <AccessibilityHelp />}
      {onderdeel === 'profiel' && (
        <>
          <ProfileSettings />
          <AccountSettings />
        </>
      )}
    </div>
  );
}
