import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, MessageSquare, ClipboardCheck, UserPlus, Info } from '@/components/common/icons';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import useDismiss from '@/lib/useDismiss';
import {
  listNotifications,
  markAllRead,
  markRead,
  subscribeToNotifications,
} from '@/services/notificationService';
import type { AppNotification, NotificationType } from '@/types';

const ICONS: Record<NotificationType, typeof Bell> = {
  approval: ClipboardCheck,
  comment: MessageSquare,
  collaborator: UserPlus,
  system: Info,
};

export default function NotificationBell() {
  const { isAuthenticated, user, configured } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read).length;

  const refresh = useCallback(() => {
    listNotifications()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!configured || !isAuthenticated || !user) {
      setItems([]);
      return;
    }
    refresh();
    const unsub = subscribeToNotifications(user.id, refresh);
    return unsub;
  }, [configured, isAuthenticated, user, refresh]);

  useDismiss(open, ref, useCallback(() => setOpen(false), []));

  if (!configured || !isAuthenticated) return null;

  async function handleClick(n: AppNotification) {
    setOpen(false);
    if (!n.read) {
      await markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.link) navigate(n.link);
  }

  async function handleMarkAll() {
    await markAllRead();
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label={unread > 0 ? `Notificaties, ${unread} ongelezen` : 'Notificaties'}
        aria-expanded={open}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rijksrood px-1 text-[0.625rem] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="z-50 mt-2 rounded-xl border border-slate-100 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-800 max-sm:fixed max-sm:inset-x-2 max-sm:top-[64px] sm:absolute sm:right-0 sm:w-80">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Notificaties</span>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 text-xs text-rijksblauw-600 dark:text-rijksblauw-300 hover:underline"
              >
                <CheckCheck size={13} /> Alles gelezen
              </button>
            )}
          </div>
          <div className="max-h-[min(24rem,calc(var(--zichtbaar,100dvh)-9rem))] overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Geen notificaties.</p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex w-full items-start gap-3 border-b border-slate-50 dark:border-slate-800 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      n.read ? '' : 'bg-rijksblauw-50/40 dark:bg-rijksblauw-500/15'
                    }`}
                  >
                    <span className="mt-0.5 text-rijksblauw-500">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{n.body}</span>}
                      <span className="mt-0.5 block text-[0.6875rem] text-slate-400 dark:text-slate-500">
                        {formatDate(n.created_at)}
                      </span>
                    </span>
                    {!n.read && <Check size={14} className="mt-1 shrink-0 text-rijksblauw-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
