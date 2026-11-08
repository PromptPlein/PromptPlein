import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getChatSettingsCached } from '@/services/settingsService';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';

/** Warm the lazy ChatPage chunk as soon as someone points at the menu item. */
function prefetchChatPage() {
  void import('@/pages/ChatPage');
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end: boolean;
  /** Only while the administrator has the chat switched on. */
  chatOnly?: boolean;
  prefetch?: () => void;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Start', icon: 'home', end: true },
  { to: '/genereren', label: 'Maken', icon: 'magic', end: false },
  { to: '/chat', label: 'Chat', icon: 'comment', end: false, chatOnly: true, prefetch: prefetchChatPage },
  { to: '/bibliotheek', label: 'Mijn prompts', icon: 'library', end: false },
  { to: '/zoeken', label: 'Ontdekken', icon: 'discover', end: false },
];

export default function Header() {
  const { isAdmin, isModerator } = useAuth();
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

  const isCurrent = (to: string, end: boolean) => (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));
  const items = navItems.filter((item) => !item.chatOnly || chatEnabled);

  return (
    <nldd-top-navigation-bar
      logo-title="Rijksorganisatie voor Ontwikkeling, Digitalisering en Innovatie"
      logo-subtitle="Ministerie van Binnenlandse Zaken en Koninkrijksrelaties"
      website-title="PromptPlein"
      website-href="/"
    >
      <nldd-menu-bar slot="global" accessible-label="Hoofdnavigatie">
        {items.map(({ to, label, icon, end, prefetch }) => (
          <nldd-menu-bar-item
            key={to}
            href={to}
            text={label}
            icon={icon}
            current={isCurrent(to, end) || undefined}
            onPointerEnter={prefetch}
            onFocus={prefetch}
          ></nldd-menu-bar-item>
        ))}
        {(isModerator || isAdmin) && (
          <nldd-menu-bar-item
            href="/goedkeuringen"
            text="Goedkeuringen"
            icon="clipboard-bullet-list"
            current={isCurrent('/goedkeuringen', false) || undefined}
          ></nldd-menu-bar-item>
        )}
      </nldd-menu-bar>
      <nldd-menu-bar slot="utility" accessible-label="Account en instellingen">
        <nldd-menu-bar-item
          href="/instellingen/toegankelijkheid"
          text="Toegankelijkheid"
          icon="accessibility"
          icon-only
          current={isCurrent('/instellingen/toegankelijkheid', false) || undefined}
        ></nldd-menu-bar-item>
        <NotificationBell />
        <UserMenu />
      </nldd-menu-bar>
    </nldd-top-navigation-bar>
  );
}
