import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Library,
  MessageSquare,
  Search,
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
  nlddIcon: string;
  end: boolean;
  /** Alleen tonen zolang de beheerder de chat aan heeft staan. */
  chatOnly?: boolean;
  /** Lazy chunk alvast laden bij hover/aanraken. */
  prefetch?: () => void;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Start', icon: LayoutDashboard, nlddIcon: 'home', end: true },
  { to: '/genereren', label: 'Maken', icon: Sparkles, nlddIcon: 'magic', end: false },
  // Chat is voor iedereen zichtbaar, zolang de admin hem aan heeft.
  {
    to: '/chat',
    label: 'Chat',
    icon: MessageSquare,
    nlddIcon: 'comment',
    end: false,
    chatOnly: true,
    prefetch: prefetchChatPage,
  },
  { to: '/bibliotheek', label: 'Mijn prompts', icon: Library, nlddIcon: 'library', end: false },
  { to: '/zoeken', label: 'Ontdekken', icon: Search, nlddIcon: 'discover', end: false },
];

/** The width at which the design system shows the global navigation in the bar (md and up). */
const WIDE_QUERY = '(min-width: 641px)';

function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

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
  const wide = useWideScreen();
  const isCurrent = (to: string, end: boolean) => (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));
  return (
    <>
      {/* The header scrolls away. On a phone the main navigation sits at the
          bottom, within reach of the thumb; from 641 pixels it is the global
          navigation of the top bar. In the chat's reading mode the header
          folds away (see useReadingMode). */}
      <header
        className={clsx(
          'pt-[env(safe-area-inset-top)]',
          pathname === '/chat' && 'opl-chat-kop laag:hidden',
        )}
      >
        <nldd-top-navigation-bar
          logo-title="Rijksorganisatie voor Ontwikkeling, Digitalisering en Innovatie"
          logo-subtitle={wide ? 'Ministerie van Binnenlandse Zaken en Koninkrijksrelaties' : undefined}
          website-title="PromptPlein"
          website-href="/"
          width="80rem"
        >
          {wide && (
            <nldd-menu-bar slot="global" accessible-label="Hoofdnavigatie">
              {items.map(({ to, label, nlddIcon, end, prefetch }) => (
                <nldd-menu-bar-item
                  key={to}
                  href={to}
                  text={label}
                  icon={nlddIcon}
                  current={isCurrent(to, end) || undefined}
                  onPointerEnter={prefetch}
                  onFocus={prefetch}
                ></nldd-menu-bar-item>
              ))}
            </nldd-menu-bar>
          )}
          <div slot="utility" className="flex items-center gap-0.5 sm:gap-1">
            <nldd-menu-bar accessible-label="Hulpmiddelen">
              {(isModerator || isAdmin) && wide && (
                <nldd-menu-bar-item
                  href="/goedkeuringen"
                  text="Goedkeuringen"
                  icon="clipboard-bullet-list"
                  icon-only
                  current={isCurrent('/goedkeuringen', false) || undefined}
                ></nldd-menu-bar-item>
              )}
              {wide && (
                <nldd-menu-bar-item
                  href="/admin"
                  text="Beheer"
                  icon="shield-check-mark"
                  icon-only
                  current={isCurrent('/admin', false) || undefined}
                ></nldd-menu-bar-item>
              )}
              <nldd-menu-bar-item
                href="/instellingen/toegankelijkheid"
                text="Toegankelijkheid"
                icon="accessibility"
                icon-only
                current={isCurrent('/instellingen/toegankelijkheid', false) || undefined}
              ></nldd-menu-bar-item>
            </nldd-menu-bar>
            {/* On a phone the theme sits in the account menu. Without a backend
                there is no account menu, so the button stays. */}
            <div className={configured ? 'hidden sm:block' : undefined}>
              <ThemeToggle />
            </div>
            <NotificationBell />
            <UserMenu />
          </div>
        </nldd-top-navigation-bar>
      </header>

      {/* Telefoon: vast onderaan, binnen bereik van de duim. Vanaf sm plakt hij
          bovenaan. In de broncode blijft hij direct na de kop staan, dus ook
          toetsenbord en schermlezer komen hem eerst tegen. */}
      <nav
        className={clsx(
          'opl-onderbalk z-40 bg-rijksblauw-700 text-white dark:border-slate-700',
          'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:border-t max-sm:border-rijksblauw-500',
          'max-sm:pb-[env(safe-area-inset-bottom)] max-sm:pl-[env(safe-area-inset-left)] max-sm:pr-[env(safe-area-inset-right)]',
          'sm:hidden',
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
