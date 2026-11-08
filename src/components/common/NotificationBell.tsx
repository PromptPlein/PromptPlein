import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/utils';
import {
  listNotifications,
  markAllRead,
  markRead,
  subscribeToNotifications,
} from '@/services/notificationService';
import type { AppNotification, NotificationType } from '@/types';
import MenuAction from './MenuAction';

const ICONS: Record<NotificationType, string> = {
  approval: 'clipboard-bullet-list',
  comment: 'comment',
  collaborator: 'add-user',
  system: 'info',
};

/** The notifications of the signed-in user, as an item in the utility bar. */
export default function NotificationBell() {
  const { isAuthenticated, user, configured } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
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
    return subscribeToNotifications(user.id, refresh);
  }, [configured, isAuthenticated, user, refresh]);

  if (!configured || !isAuthenticated) return null;

  async function open(n: AppNotification) {
    if (!n.read) {
      await markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    await markAllRead();
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  return (
    <nldd-menu-bar-item
      text="Notificaties"
      accessible-label={unread > 0 ? `Notificaties, ${unread} ongelezen` : 'Notificaties'}
      icon={unread > 0 ? 'notification' : 'bell'}
      icon-only
      expandable
    >
      <nldd-menu accessible-label="Notificaties" max-items={8} empty-text="Geen notificaties">
        {items.map((n) => (
          <MenuAction
            key={n.id}
            icon={ICONS[n.type] ?? 'info'}
            text={n.read ? n.title : `**${n.title}**`}
            details={formatDate(n.created_at)}
            onSelect={() => void open(n)}
          />
        ))}
        {unread > 0 && (
          <>
            <nldd-menu-divider></nldd-menu-divider>
            <MenuAction icon="check-mark" text="Markeer alles als gelezen" onSelect={() => void readAll()} />
          </>
        )}
      </nldd-menu>
    </nldd-menu-bar-item>
  );
}
