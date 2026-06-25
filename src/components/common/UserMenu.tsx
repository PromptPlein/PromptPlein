import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserCircle2, LogOut, ShieldCheck, ChevronDown, User, Sun, Moon, Monitor, Mail } from 'lucide-react';
import clsx from 'clsx';
import { useTheme, type ThemeChoice } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getCurrentUser, setCurrentUser } from '@/lib/utils';

/** Lokale "wie ben ik"-instelling voor de mock-modus (geen Supabase-backend). */
function LocalNameMenu() {
  const [name, setName] = useState(getCurrentUser());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => setDraft(name), [name]);

  function save() {
    const trimmed = draft.trim();
    setCurrentUser(trimmed);
    setName(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          className="opl-input w-40 py-1.5"
          placeholder="Je naam"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="opl-btn-primary py-1.5" onClick={save}>
          Opslaan
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      title="Stel je naam in"
    >
      <UserCircle2 size={20} className="text-rijksblauw-500" />
      <span className="hidden sm:inline">{name || 'Stel je naam in'}</span>
    </button>

  );
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Licht', icon: Sun },
  { value: 'dark', label: 'Donker', icon: Moon },
  { value: 'system', label: 'Systeem', icon: Monitor },
];

export default function UserMenu() {
  const { configured, loading, isAuthenticated, isAdmin, profile, user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Geen Supabase-backend → val terug op de lokale naam-instelling.
  if (!configured) return <LocalNameMenu />;

  if (loading) {
    return <span className="px-2.5 py-1.5 text-sm text-slate-400">…</span>;
  }

  if (!isAuthenticated) {
    return (
      <Link to="/auth/login" className="opl-btn-primary py-1.5">
        Inloggen
      </Link>
    );
  }

  const label = profile?.full_name || user?.email || 'Account';

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/');
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <UserCircle2 size={20} className="text-rijksblauw-500" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
            {user?.email && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{user.email}</p>}
          </div>
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <Link
            to="/profiel"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <User size={16} className="text-rijksblauw-500" /> Mijn profiel
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ShieldCheck size={16} className="text-rijksblauw-500" /> Beheerpaneel
            </Link>
          )}
          <Link
            to="/contact"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Mail size={16} className="text-rijksblauw-500" /> Contact
          </Link>

          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Thema
          </div>
          <div className="flex gap-1 px-1.5 pb-1">
            {THEME_OPTIONS.map(({ value, label: tLabel, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={clsx(
                  'flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px]',
                  theme === value
                    ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700',
                )}
                title={tLabel}
              >
                <Icon size={15} /> {tLabel}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-rijksrood dark:text-slate-300 dark:hover:bg-red-500/10"
          >
            <LogOut size={16} /> Uitloggen
          </button>
        </div>
      )}
    </div>
  );
}
