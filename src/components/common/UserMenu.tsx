import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserCircle2, LogOut, ShieldCheck, ChevronDown, User } from 'lucide-react';
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
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
      title="Stel je naam in"
    >
      <UserCircle2 size={20} className="text-rijksblauw-500" />
      <span className="hidden sm:inline">{name || 'Stel je naam in'}</span>
    </button>
  );
}

export default function UserMenu() {
  const { configured, loading, isAuthenticated, isAdmin, profile, user, signOut } = useAuth();
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
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <UserCircle2 size={20} className="text-rijksblauw-500" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-1.5 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-800">{label}</p>
            {user?.email && <p className="truncate text-xs text-slate-400">{user.email}</p>}
          </div>
          <div className="my-1 border-t border-slate-100" />
          <Link
            to="/profiel"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <User size={16} className="text-rijksblauw-500" /> Mijn profiel
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              <ShieldCheck size={16} className="text-rijksblauw-500" /> Beheerpaneel
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-rijksrood"
          >
            <LogOut size={16} /> Uitloggen
          </button>
        </div>
      )}
    </div>
  );
}
