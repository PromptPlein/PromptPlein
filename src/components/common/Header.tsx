import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Sparkles,
  Library,
  Activity,
  MessageSquare,
  ShieldCheck,
  ClipboardCheck,
  Network,
  Users,
} from 'lucide-react';
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
  iconClassName?: string;
  /** Alleen tonen voor ingelogde gebruikers (en zolang de chat aanstaat). */
  authOnly?: boolean;
  /** Lazy chunk alvast laden bij hover/aanraken. */
  prefetch?: () => void;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/zoeken', label: 'Zoeken', icon: Search, end: false },
  { to: '/genereren', label: 'Genereren', icon: Sparkles, end: false, iconClassName: 'text-rijksoranje' },
  // Chat is alleen zichtbaar voor ingelogde gebruikers (en als de admin hem aan heeft).
  { to: '/chat', label: 'Chat', icon: MessageSquare, end: false, authOnly: true, prefetch: prefetchChatPage },
  { to: '/bibliotheek', label: 'Mijn prompts', icon: Library, end: false },
  { to: '/community', label: 'Community', icon: Users, end: false },
  { to: '/netwerk', label: 'Netwerk', icon: Network, end: false },
];

export default function Header() {
  const { isAdmin, isModerator, isAuthenticated } = useAuth();
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

  const items = navItems.filter((item) => !item.authOnly || (isAuthenticated && chatEnabled));
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center">
            <img
              src="/promptplein-logo.png"
              alt="PromptPlein"
              className="h-11 w-auto shrink-0 object-contain"
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Hoofdnavigatie">
          {items.map(({ to, label, icon: Icon, end, iconClassName, prefetch }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onPointerEnter={prefetch}
              onFocus={prefetch}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-rijksblauw-50 dark:bg-rijksblauw-500/15 text-rijksblauw-700 dark:text-rijksblauw-200'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
                )
              }
            >
              <Icon size={16} className={iconClassName} />
              {label}
            </NavLink>
          ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <NavLink
            to="/activiteit"
            className={({ isActive }) =>
              clsx(
                'rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800',
                isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
              )
            }
            title="Mijn activiteit"
            aria-label="Mijn activiteit"
          >
            <Activity size={18} />
          </NavLink>
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
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>

      {/* Mobiele navigatie */}
      <nav
        className="flex items-center justify-around border-t border-slate-200 dark:border-slate-700 lg:hidden"
        aria-label="Mobiele navigatie"
      >
        {items.map(({ to, label, icon: Icon, end, iconClassName, prefetch }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onTouchStart={prefetch}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium',
                isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
              )
            }
          >
            <Icon size={18} className={iconClassName} />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
