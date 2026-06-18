import { NavLink, Link } from 'react-router-dom';
import {
  Library,
  LayoutDashboard,
  Search,
  Sparkles,
  Star,
  Flame,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';
import UserMenu from './UserMenu';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/zoeken', label: 'Zoeken', icon: Search, end: false },
  { to: '/optimaliseren', label: 'Optimaliseren', icon: Sparkles, end: false },
  { to: '/trending', label: 'Trending', icon: Flame, end: false },
  { to: '/favorieten', label: 'Favorieten', icon: Star, end: false },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rijksblauw-500 text-white">
            <Library size={20} />
          </span>
          <div className="leading-tight">
            <span className="block text-sm font-bold text-rijksblauw-700">Overheid</span>
            <span className="block text-xs font-medium text-slate-500">Prompt Library</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Hoofdnavigatie">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-rijksblauw-50 text-rijksblauw-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <NavLink
            to="/activiteit"
            className={({ isActive }) =>
              clsx(
                'rounded-lg p-2 hover:bg-slate-100',
                isActive ? 'text-rijksblauw-700' : 'text-slate-500',
              )
            }
            title="Mijn activiteit"
            aria-label="Mijn activiteit"
          >
            <Activity size={18} />
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              clsx(
                'rounded-lg p-2 hover:bg-slate-100',
                isActive ? 'text-rijksblauw-700' : 'text-slate-500',
              )
            }
            title="Beheer"
            aria-label="Beheer"
          >
            <ShieldCheck size={18} />
          </NavLink>
          <UserMenu />
        </div>
      </div>

      {/* Mobiele navigatie */}
      <nav
        className="flex items-center justify-around border-t border-slate-200 lg:hidden"
        aria-label="Mobiele navigatie"
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium',
                isActive ? 'text-rijksblauw-700' : 'text-slate-500',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
