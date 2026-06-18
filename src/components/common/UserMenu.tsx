import { useEffect, useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import { getCurrentUser, setCurrentUser } from '@/lib/utils';

/**
 * Minimale "wie ben ik"-instelling. Phase 1 heeft geen authenticatie; de naam
 * wordt gebruikt als `created_by` bij het uploaden van prompts.
 */
export default function UserMenu() {
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
