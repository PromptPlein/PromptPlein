import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserCircle2, LogOut, LogIn, ShieldCheck, ClipboardCheck, ChevronDown, User, Sun, Moon, Monitor, Mail, Settings2 } from '@/components/common/icons';
import clsx from 'clsx';
import { useTheme, type ThemeChoice } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getCurrentUser, setCurrentUser } from '@/lib/utils';
import useDismiss from '@/lib/useDismiss';

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
      aria-label={name || 'Stel je naam in'}
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
  const { configured, loading, isAuthenticated, isAdmin, isModerator, profile, user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(open, ref, useCallback(() => setOpen(false), []));

  // Geen Supabase-backend → val terug op de lokale naam-instelling.
  if (!configured) return <LocalNameMenu />;

  if (loading) {
    return <span className="px-2.5 py-1.5 text-sm text-slate-400">…</span>;
  }

  const label = profile?.full_name || user?.email || 'Account';

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/');
  }

  const itemClass =
    'flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 sm:min-h-0';

  return (
    <div ref={ref} className="relative">
      {!isAuthenticated && (
        <Link to="/auth/login" className="opl-btn-primary hidden py-1.5 sm:inline-flex">
          Inloggen
        </Link>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={isAuthenticated ? `Accountmenu van ${label}` : 'Menu'}
        className={clsx(
          'items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
          isAuthenticated ? 'flex' : 'flex sm:hidden',
        )}
      >
        <UserCircle2 size={20} className="text-rijksblauw-500" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="z-50 mt-2 max-h-[calc(var(--zichtbaar,100dvh)-5rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800 max-sm:fixed max-sm:inset-x-2 max-sm:top-[64px] sm:absolute sm:right-0 sm:w-56">
          {isAuthenticated ? (
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
              {user?.email && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{user.email}</p>}
            </div>
          ) : (
            <Link
              to="/auth/login"
              onClick={() => setOpen(false)}
              className="opl-btn-primary w-full"
            >
              <LogIn size={16} /> Inloggen
            </Link>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          {isAuthenticated && (
            <Link to="/profiel" onClick={() => setOpen(false)} className={itemClass}>
              <User size={16} className="text-rijksblauw-500" /> Mijn profiel
            </Link>
          )}
          <Link to="/instellingen" onClick={() => setOpen(false)} className={itemClass}>
            <Settings2 size={16} className="text-rijksblauw-500" /> Instellingen
          </Link>
          {(isModerator || isAdmin) && (
            <Link to="/goedkeuringen" onClick={() => setOpen(false)} className={clsx(itemClass, 'sm:hidden')}>
              <ClipboardCheck size={16} className="text-rijksblauw-500" /> Goedkeuringen
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" onClick={() => setOpen(false)} className={itemClass}>
              <ShieldCheck size={16} className="text-rijksblauw-500" /> Beheerpaneel
            </Link>
          )}
          <Link to="/contact" onClick={() => setOpen(false)} className={itemClass}>
            <Mail size={16} className="text-rijksblauw-500" /> Contact
          </Link>

          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <div className="px-3 py-1 text-[0.6875rem] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Thema
          </div>
          <div className="flex gap-1 px-1.5 pb-1">
            {THEME_OPTIONS.map(({ value, label: tLabel, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={clsx(
                  'flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[0.6875rem]',
                  theme === value
                    ? 'bg-rijksblauw-50 text-rijksblauw-700 dark:bg-rijksblauw-500/15 dark:text-rijksblauw-200'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700',
                )}
                title={tLabel}
                aria-pressed={theme === value}
              >
                <Icon size={15} /> {tLabel}
              </button>
            ))}
          </div>
          {isAuthenticated && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-rijksrood dark:text-slate-300 dark:hover:bg-red-500/10"
              >
                <LogOut size={16} /> Uitloggen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
