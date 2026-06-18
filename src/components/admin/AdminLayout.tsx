import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  FolderTree,
  ScrollText,
  LogOut,
  ShieldCheck,
  ArrowLeft,
  BarChart3,
} from 'lucide-react';
import clsx from 'clsx';
import { useAdmin } from '@/hooks/useAdmin';

const adminNav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/technieken', label: 'Technieken', icon: Sparkles, end: false },
  { to: '/admin/rollen', label: 'Rollen', icon: Users, end: false },
  { to: '/admin/categorieen', label: 'Categorieën', icon: FolderTree, end: false },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, end: false },
];

function AdminLogin({ onLogin }: { onLogin: (token: string) => boolean }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!onLogin(token)) setError(true);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rijksblauw-500 text-white">
        <ShieldCheck size={28} />
      </span>
      <h1 className="text-2xl font-bold text-rijksblauw-700">Admin-toegang</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Voer de admin-token in om het beheerpaneel te openen.
      </p>
      <form onSubmit={submit} className="mt-6 w-full space-y-3">
        <input
          type="password"
          autoFocus
          className="opl-input"
          placeholder="Admin-token"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setError(false);
          }}
        />
        {error && <p className="text-sm text-rijksrood">Onjuiste token.</p>}
        <button type="submit" className="opl-btn-primary w-full">
          Inloggen
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-400">
        Demo-token: <code className="rounded bg-slate-100 px-1.5 py-0.5">admin</code>
      </p>
      <Link to="/" className="mt-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Terug naar de app
      </Link>
    </div>
  );
}

export default function AdminLayout() {
  const { authenticated, login, logout } = useAdmin();
  const navigate = useNavigate();

  if (!authenticated) {
    return <AdminLogin onLogin={login} />;
  }

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="opl-card sticky top-20 p-3">
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            <ShieldCheck size={18} className="text-rijksblauw-500" />
            <span className="font-bold text-rijksblauw-700">Beheer</span>
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
                      ? 'bg-rijksblauw-50 text-rijksblauw-700'
                      : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-rijksrood"
            >
              <LogOut size={16} /> Uitloggen
            </button>
          </div>
        </div>

        {/* Mobiele tab-balk */}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobiele admin-navigatie */}
        <nav className="mb-4 flex gap-1 overflow-x-auto md:hidden">
          {adminNav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium',
                  isActive ? 'bg-rijksblauw-50 text-rijksblauw-700' : 'bg-white text-slate-600',
                )
              }
            >
              <Icon size={14} /> {label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
