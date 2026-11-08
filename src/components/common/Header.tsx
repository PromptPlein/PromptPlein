import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Library,
  MessageSquare,
  Search,
  ShieldCheck,
  ClipboardCheck,
  Accessibility,
} from '@/components/common/icons';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { getChatSettingsCached } from '@/services/settingsService';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

/** Warm de lazy ChatPage-chunk alvast op zodra de gebruiker het menu-item aanraakt. */
function prefetchChatPage() {
  void import('@/pages/ChatPage');
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  /** Alleen tonen zolang de beheerder de chat aan heeft staan. */
  chatOnly?: boolean;
  /** Lazy chunk alvast laden bij hover/aanraken. */
  prefetch?: () => void;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Start', icon: LayoutDashboard, end: true },
  { to: '/genereren', label: 'Maken', icon: Sparkles, end: false },
  // Chat is voor iedereen zichtbaar, zolang de admin hem aan heeft.
  {
    to: '/chat',
    label: 'Chat',
    icon: MessageSquare,
    end: false,
    chatOnly: true,
    prefetch: prefetchChatPage,
  },
  { to: '/bibliotheek', label: 'Mijn prompts', icon: Library, end: false },
  { to: '/zoeken', label: 'Ontdekken', icon: Search, end: false },
];

export default function Header() {
  const { isAdmin, isModerator, configured } = useAuth();
  const { pathname } = useLocation();
  const [chatEnabled, setChatEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    void getChatSettingsCached().then((s) => {
      if (active) setChatEnabled(s.enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const items = navItems.filter((item) => !item.chatOnly || chatEnabled);
  return (
    <>
      {/* De kop scrolt weg, de navigatiebalk blijft staan. Zo houden lange
          pagina's en de chat hun hoogte, ondanks het lint van 80 pixels. Op een
          liggende telefoon is er zo weinig hoogte dat de chat de kop laat vallen. */}
      <header
        className={clsx(
          'bg-white pt-[env(safe-area-inset-top)] dark:bg-slate-900',
          // In de leesstand van de chat klapt de kop in (zie useReadingMode).
          pathname === '/chat' && 'opl-chat-kop laag:hidden',
        )}
      >
        {/* In de chat volgt de kop de breedte van de chat (max-w-6xl in
            ChatPage), zodat het logo op één lijn staat met de zijbalk. */}
        <div
          className={clsx(
            'relative mx-auto flex h-[64px] items-center justify-between pl-4 pr-1 sm:h-[80px] sm:px-6 lg:px-8',
            pathname === '/chat' ? 'max-w-6xl' : 'max-w-7xl',
          )}
        >
          <Link to="/" className="flex items-center">
            <img
              src="/promptplein-logo.png"
              alt="PromptPlein"
              className="h-[44px] w-auto shrink-0 object-contain dark:rounded dark:bg-white dark:p-1"
            />
          </Link>

          {/* Het lint hangt aan de bovenrand, midden op de pagina. */}
          <img
            src="/logo-rijksoverheid.svg"
            alt="Logo Rijksoverheid"
            width={40}
            height={80}
            className="absolute left-1/2 top-0 h-[64px] w-[32px] -translate-x-1/2 sm:h-[80px] sm:w-[40px]"
          />

          {/* Naast het lint is op een smalle telefoon plek voor drie knoppen.
              Toegankelijkheid blijft altijd staan; de rest zit op de telefoon in
              het accountmenu. */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            {(isModerator || isAdmin) && (
              <NavLink
                to="/goedkeuringen"
                className={({ isActive }) =>
                  clsx(
                    'hidden rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 sm:block',
                    isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
                  )
                }
                title="Goedkeuringen"
                aria-label="Goedkeuringen"
              >
                <ClipboardCheck size={18} />
              </NavLink>
            )}
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                clsx(
                  'hidden rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 sm:block',
                  isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
                )
              }
              title="Beheer"
              aria-label="Beheer"
            >
              <ShieldCheck size={18} />
            </NavLink>
            <NavLink
              to="/instellingen/toegankelijkheid"
              className={({ isActive }) =>
                clsx(
                  'flex h-[44px] w-[44px] items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 sm:h-auto sm:w-auto sm:p-2',
                  isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
                )
              }
              title="Toegankelijkheid"
              aria-label="Toegankelijkheid"
            >
              <Accessibility size={20} className="sm:h-[18px] sm:w-[18px]" />
            </NavLink>
            {/* Op de telefoon zit het thema in het accountmenu. Zonder backend is
                er geen accountmenu, dan blijft de knop staan. */}
            <div className={configured ? 'hidden sm:block' : undefined}>
              <ThemeToggle />
            </div>
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Telefoon: vast onderaan, binnen bereik van de duim. Vanaf sm plakt hij
          bovenaan. In de broncode blijft hij direct na de kop staan, dus ook
          toetsenbord en schermlezer komen hem eerst tegen. */}
      <nav
        className={clsx(
          'opl-onderbalk z-40 bg-rijksblauw-700 text-white dark:border-slate-700',
          'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:border-t max-sm:border-rijksblauw-500',
          'max-sm:pb-[env(safe-area-inset-bottom)] max-sm:pl-[env(safe-area-inset-left)] max-sm:pr-[env(safe-area-inset-right)]',
          'sm:sticky sm:top-0 dark:sm:border-b',
        )}
        aria-label="Hoofdnavigatie"
      >
        <div className="mx-auto flex max-w-7xl lg:justify-center lg:px-8">
          {items.map(({ to, label, icon: Icon, end, prefetch }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onPointerEnter={prefetch}
              onTouchStart={prefetch}
              onFocus={prefetch}
              className={({ isActive }) =>
                clsx(
                  // De balk heeft een vaste plek, dus de labels groeien niet
                  // onbeperkt mee met de tekstgrootte (net als de tabbalk van iOS).
                  'flex min-h-[60px] min-w-[48px] flex-auto flex-col items-center justify-center gap-[4px] whitespace-nowrap px-[2px] py-[6px]',
                  'text-[min(0.8125rem,15px)] font-semibold leading-none sm:px-2 sm:py-2',
                  'transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2',
                  'focus-visible:-outline-offset-2 focus-visible:outline-white',
                  'laag:min-h-[44px] laag:flex-row laag:gap-2 laag:py-2',
                  'lg:h-14 lg:min-h-0 lg:flex-none lg:flex-row lg:gap-2.5 lg:px-5 lg:py-0 lg:text-lg',
                  isActive && 'shadow-[inset_0_-3px_0_0_theme(colors.pleingroen.vast)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} className={isActive ? 'text-pleingroen-vast' : undefined} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
