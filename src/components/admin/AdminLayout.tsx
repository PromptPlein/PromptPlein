import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useNlddEvent } from '@/lib/nldd';

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: 'square-grid-2x2', end: true },
  { to: '/admin/goedkeuringen', label: 'Goedkeuringen', icon: 'checked-text-document', end: false },
  { to: '/admin/gebruikers', label: 'Gebruikers', icon: 'user-settings', end: false },
  { to: '/admin/moderatoren', label: 'Moderatoren', icon: 'user-admin', end: false },
  { to: '/admin/organisaties', label: 'Organisaties', icon: 'building', end: false },
  { to: '/admin/technieken', label: 'Technieken', icon: 'sparkles', end: false },
  { to: '/admin/rollen', label: 'Functies', icon: 'users', end: false },
  { to: '/admin/functie-aanvragen', label: 'Functie-aanvragen', icon: 'business-suitcase', end: false },
  { to: '/admin/categorieen', label: 'Categorieën', icon: 'categories', end: false },
  { to: '/admin/categorie-aanvragen', label: 'Categorie-aanvragen', icon: 'folder-badge-plus', end: false },
  { to: '/admin/analytics', label: 'Analytics', icon: 'bar-chart', end: false },
  { to: '/admin/rapportage', label: 'Rapportage', icon: 'graph', end: false },
  { to: '/admin/audit', label: 'Audit log', icon: 'history', end: false },
  { to: '/admin/instellingen', label: 'AI-instellingen', icon: 'ai', end: false },
  { to: '/admin/prompts', label: 'Prompts', icon: 'code', end: false },
];

type SidebarSection = HTMLElement & { show?: () => void; hide?: () => void };

/**
 * The admin shell: the list of admin pages in the sidebar of an
 * nldd-sidebar-section, next to the page itself. Below the lg width of the
 * section the sidebar becomes a sheet, opened with the button above the page.
 */
export default function AdminLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sectionRef = useRef<SidebarSection>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const current =
    adminNav.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))) ?? adminNav[0];

  useNlddEvent(sectionRef, 'open', () => setSheetOpen(true));
  useNlddEvent(sectionRef, 'close', () => setSheetOpen(false));

  // The section measures itself after its first render; read the state it settled on.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const sync = () => setCollapsed(el.hasAttribute('collapsed'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ['collapsed'] });
    return () => observer.disconnect();
  }, []);

  // A link in the sheet goes to another page; the sheet closes once it is there.
  useEffect(() => {
    sectionRef.current?.hide?.();
  }, [pathname]);

  return (
    <nldd-sidebar-section ref={sectionRef} sidebar-label="Beheer" sticky-top="80px">
      <nldd-container slot="sidebar" padding="16" layout="stack" gap="8">
        <nldd-title heading-level={2} size={5} text="Beheer"></nldd-title>
        <nldd-list type="navigation" accessible-label="Beheer" dividers="never">
          {adminNav.map((item) => (
            <nldd-list-item key={item.to} size="sm" href={item.to} current={item === current || undefined}>
              <nldd-icon-cell icon={item.icon} size="20"></nldd-icon-cell>
              <nldd-text-cell text={item.label}></nldd-text-cell>
            </nldd-list-item>
          ))}
        </nldd-list>
        <nldd-divider></nldd-divider>
        <nldd-button
          appearance="neutral-transparent"
          start-icon="logout"
          text="Uitloggen"
          width="full"
          horizontal-alignment="left"
          onClick={() => {
            void signOut();
            navigate('/');
          }}
        ></nldd-button>
      </nldd-container>

      {collapsed && (
        <>
          <nldd-button
            appearance="secondary"
            width="full"
            horizontal-alignment="left"
            start-icon={current.icon}
            text={`Beheer: ${current.label}`}
            supporting-text="Kies een ander onderdeel"
            popup-type="dialog"
            expanded={sheetOpen || undefined}
            onClick={() => sectionRef.current?.show?.()}
          ></nldd-button>
          <nldd-spacer size="24"></nldd-spacer>
        </>
      )}
      <Outlet />
    </nldd-sidebar-section>
  );
}
