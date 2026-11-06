import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
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
  const { isAdmin, isModerator } = useAuth();
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
          pagina's en de chat hun hoogte, ondanks het lint van 80 pixels. */}
      <header className="bg-white dark:bg-slate-900">
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center justify-between sm:h-20 sm:flex-nowrap sm:px-6 lg:px-8">
          <Link to="/" className="flex h-16 items-center pl-4 sm:h-auto sm:pl-0">
            <img
              src="/promptplein-logo.png"
              alt="PromptPlein"
              className="h-11 w-auto shrink-0 object-contain dark:rounded dark:bg-white dark:p-1"
            />
          </Link>

          {/* Het lint hangt aan de bovenrand, midden op de pagina. */}
          <img
            src="/logo-rijksoverheid.svg"
            alt="Logo Rijksoverheid"
            width={40}
            height={80}
            className="absolute left-1/2 top-0 h-16 w-8 -translate-x-1/2 sm:h-20 sm:w-10"
          />

          {/* Op een smalle telefoon passen de knoppen niet naast het lint en
              krijgen ze een eigen regel. */}
          <div className="flex w-full items-center justify-end gap-1 border-t border-slate-200 px-2 py-1 dark:border-slate-700 sm:w-auto sm:border-0 sm:p-0">
            {(isModerator || isAdmin) && (
              <NavLink
                to="/goedkeuringen"
                className={({ isActive }) =>
                  clsx(
                    'rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800',
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
                  'rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800',
                  isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
                )
              }
              title="Beheer"
              aria-label="Beheer"
            >
              <ShieldCheck size={18} />
            </NavLink>
            <NavLink
              to="/toegankelijkheid"
              className={({ isActive }) =>
                clsx(
                  'rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800',
                  isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
                )
              }
              title="Toegankelijkheid"
              aria-label="Toegankelijkheid"
            >
              <Accessibility size={18} />
            </NavLink>
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>

      <nav
        className="sticky top-0 z-40 bg-rijksblauw-700 text-white dark:border-b dark:border-slate-700"
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
                  'flex flex-1 flex-col items-center gap-1 whitespace-nowrap px-2 py-2 text-[13px] font-semibold',
                  'transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2',
                  'focus-visible:-outline-offset-2 focus-visible:outline-white',
                  'lg:h-14 lg:flex-none lg:flex-row lg:gap-2.5 lg:px-5 lg:py-0 lg:text-lg',
                  isActive && 'shadow-[inset_0_-3px_0_0_theme(colors.rijksoranje.vast)]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} className={isActive ? 'text-rijksoranje-vast' : undefined} />
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
