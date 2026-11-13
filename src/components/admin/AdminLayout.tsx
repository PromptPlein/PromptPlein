import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  FolderTree,
  ScrollText,
  LogOut,
  ShieldCheck,
  ChevronDown,
  BarChart3,
  Building2,
  UserCog,
  UserCheck,
  ClipboardCheck,
  PieChart,
  Bot,
  Briefcase,
  FolderPlus,
  FileCode2,
} from '@/components/common/icons';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/goedkeuringen', label: 'Goedkeuringen', icon: ClipboardCheck, end: false },
  { to: '/admin/gebruikers', label: 'Gebruikers', icon: UserCog, end: false },
  { to: '/admin/moderatoren', label: 'Moderatoren', icon: UserCheck, end: false },
  { to: '/admin/organisaties', label: 'Organisaties', icon: Building2, end: false },
  { to: '/admin/onderdeel-aanvragen', label: 'Onderdeel-aanvragen', icon: Building2, end: false },
  { to: '/admin/technieken', label: 'Technieken', icon: Sparkles, end: false },
  { to: '/admin/rollen', label: 'Functies', icon: Users, end: false },
  { to: '/admin/functie-aanvragen', label: 'Functie-aanvragen', icon: Briefcase, end: false },
  { to: '/admin/categorieen', label: 'Categorieën', icon: FolderTree, end: false },
  { to: '/admin/categorie-aanvragen', label: 'Categorie-aanvragen', icon: FolderPlus, end: false },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/admin/rapportage', label: 'Rapportage', icon: PieChart, end: false },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, end: false },
  { to: '/admin/instellingen', label: 'AI-instellingen', icon: Bot, end: false },
  { to: '/admin/prompts', label: 'Prompts', icon: FileCode2, end: false },
];

export default function AdminLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const current =
    adminNav.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to))) ??
    adminNav[0];
  const CurrentIcon = current.icon;

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="opl-card sticky top-20 p-3">
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            <ShieldCheck size={18} className="text-rijksblauw-500" />
            <span className="font-bold text-rijksblauw-700 dark:text-rijksblauw-200">Beheer</span>
          </div>
          <nav className="space-y-1">
            {adminNav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  )
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              onClick={() => {
                void signOut();
                navigate('/');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-rijksrood dark:text-slate-300 dark:hover:bg-red-500/10"
            >
              <LogOut size={16} /> Uitloggen
            </button>
          </div>
        </div>

      </aside>

      <div className="min-w-0 flex-1">
        {/* Telefoon: vijftien onderdelen passen niet naast elkaar, en een rij die
            zijwaarts schuift verbergt de helft. Daarom een knop met het huidige
            onderdeel, die de volledige lijst openklapt. */}
        <div className="mb-4 md:hidden">
          <button
            type="button"
            className="opl-btn-secondary w-full !justify-between"
            aria-expanded={menuOpen}
            aria-controls="beheer-onderdelen"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CurrentIcon size={16} className="shrink-0 text-rijksblauw-500" />
              <span className="min-w-0 text-left">Beheer: {current.label}</span>
            </span>
            <ChevronDown size={16} className={clsx('shrink-0 transition-transform', menuOpen && 'rotate-180')} />
          </button>
          {menuOpen && (
            <nav id="beheer-onderdelen" aria-label="Beheer" className="opl-card mt-2 grid grid-cols-1 gap-1 p-2 min-[416px]:grid-cols-2">
              {adminNav.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )
                  }
                >
                  <Icon size={16} className="shrink-0" /> {label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
