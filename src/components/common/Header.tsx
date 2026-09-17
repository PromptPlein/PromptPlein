import { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Library,
  MessageSquare,
  ShieldCheck,
  ClipboardCheck,
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

/**
 * De nav bevat twee soorten items: plekken (Dashboard, Mijn prompts, …) en gereedschap.
 * Gereedschap — Genereren maakt een prompt, Chat gebruikt hem — krijgt een gevuld
 * icoonblokje in zijn eigen kleur, zodat de twee AI-acties uit de balk springen.
 */
type NavAccent = 'oranje' | 'blauw';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  /** Markeert dit item als gereedschap en bepaalt de kleur van het icoonblokje. */
  accent?: NavAccent;
  /** Alleen tonen zolang de beheerder de chat aan heeft staan. */
  chatOnly?: boolean;
  /** Lazy chunk alvast laden bij hover/aanraken. */
  prefetch?: () => void;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/genereren', label: 'Genereren', icon: Sparkles, end: false, accent: 'oranje' },
  // Chat is voor iedereen zichtbaar, zolang de admin hem aan heeft.
  {
    to: '/chat',
    label: 'Chat',
    icon: MessageSquare,
    end: false,
    accent: 'blauw',
    chatOnly: true,
    prefetch: prefetchChatPage,
  },
  { to: '/bibliotheek', label: 'Mijn prompts', icon: Library, end: false },
];

/** Verloop + gekleurde gloed per accent. */
const accentChip: Record<NavAccent, string> = {
  oranje: 'from-rijksoranje to-rijksoranje-dark shadow-rijksoranje/40',
  blauw: 'from-rijksblauw-400 to-rijksblauw-600 shadow-rijksblauw-500/40',
};

interface NavIconProps {
  icon: typeof LayoutDashboard;
  accent?: NavAccent;
  isActive: boolean;
  /** Mobiel toont het icoon boven het label en mag iets forser. */
  variant: 'balk' | 'mobiel';
}

/**
 * Icoon in een vaste 24px-doos, zodat blokjes en kale iconen even hoog blijven
 * en alle nav-items dezelfde hoogte houden.
 */
function NavIcon({ icon: Icon, accent, isActive, variant }: NavIconProps) {
  if (!accent) {
    return (
      <span className="flex h-6 w-6 items-center justify-center">
        <Icon size={variant === 'balk' ? 16 : 18} />
      </span>
    );
  }
  return (
    <span
      className={clsx(
        'flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br text-white transition-all duration-200',
        accentChip[accent],
        isActive ? 'shadow-md' : 'shadow-sm',
        'group-hover:shadow-md motion-safe:group-hover:-translate-y-px',
      )}
    >
      <Icon size={14} strokeWidth={2.25} />
    </span>
  );
}

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
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center">
          <img
            src="/promptplein-logo.png"
            alt="PromptPlein"
            className="h-11 w-auto shrink-0 object-contain"
          />
        </Link>

        {/* Absoluut gecentreerd, zodat het logo links en de knoppen rechts de
            nav niet uit het midden duwen. */}
        <nav
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex"
          aria-label="Hoofdnavigatie"
        >
          {items.map(({ to, label, icon: Icon, end, accent, prefetch }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onPointerEnter={prefetch}
              onFocus={prefetch}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-rijksblauw-50 dark:bg-rijksblauw-500/15 text-rijksblauw-700 dark:text-rijksblauw-200'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <NavIcon icon={Icon} accent={accent} isActive={isActive} variant="balk" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
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
        {items.map(({ to, label, icon: Icon, end, accent, prefetch }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onTouchStart={prefetch}
            className={({ isActive }) =>
              clsx(
                'group flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium',
                isActive ? 'text-rijksblauw-700 dark:text-rijksblauw-200' : 'text-slate-500 dark:text-slate-400',
              )
            }
          >
            {({ isActive }) => (
              <>
                <NavIcon icon={Icon} accent={accent} isActive={isActive} variant="mobiel" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
