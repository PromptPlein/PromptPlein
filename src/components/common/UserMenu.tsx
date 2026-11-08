import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTheme, type ThemeChoice } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getCurrentUser, setCurrentUser } from '@/lib/utils';
import { useNlddEvent, useNlddValue } from '@/lib/nldd';
import MenuAction from './MenuAction';

const THEMES: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: 'light', label: 'Licht', icon: 'sun' },
  { value: 'dark', label: 'Donker', icon: 'moon' },
  { value: 'system', label: 'Systeem', icon: 'display' },
];

/** In local mode (no backend) the name is a setting of this browser. */
function LocalNameDialog({ open, onClose }: { open: boolean; onClose: (name?: string) => void }) {
  const [draft, setDraft] = useState(getCurrentUser());
  const dialogRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLElement & { value?: string }>(null);
  useNlddValue(fieldRef, draft, setDraft);
  useNlddEvent(dialogRef, 'close', () => onClose());
  return (
    <nldd-modal-dialog ref={dialogRef} open={open || undefined} text="Je naam" horizontal-alignment="left">
      <nldd-form-field label="Naam">
        <nldd-text-field ref={fieldRef} autocomplete="name"></nldd-text-field>
      </nldd-form-field>
      <nldd-button slot="actions" appearance="primary" text="Bewaar" onClick={() => onClose(draft.trim())}></nldd-button>
      <nldd-button slot="actions" appearance="secondary" text="Annuleer" onClick={() => onClose()}></nldd-button>
    </nldd-modal-dialog>
  );
}

/** The account item in the utility bar: who you are, your pages, theme and log out. */
export default function UserMenu() {
  const { configured, loading, isAuthenticated, isAdmin, isModerator, profile, user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [localName, setLocalName] = useState(getCurrentUser());
  const [naming, setNaming] = useState(false);

  const label = configured ? profile?.full_name || user?.email || 'Account' : localName || 'Stel je naam in';
  const signedIn = configured && isAuthenticated;

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <>
      <nldd-menu-bar-item text={signedIn || !configured ? label : 'Menu'} icon="account" expandable content-priority="icon">
        <nldd-menu accessible-label="Account">
          {signedIn && (
            <nldd-container slot="header" padding="12">
              <nldd-identity text={label} supporting-text={user?.email ?? undefined}></nldd-identity>
            </nldd-container>
          )}
          {configured && !isAuthenticated && !loading && <nldd-menu-item icon="login" text="Inloggen" href="/auth/login"></nldd-menu-item>}
          {!configured && <MenuAction icon="edit" text="Naam instellen" onSelect={() => setNaming(true)} />}
          {signedIn && <nldd-menu-item icon="user" text="Mijn profiel" href="/profiel"></nldd-menu-item>}
          <nldd-menu-item icon="settings" text="Instellingen" href="/instellingen"></nldd-menu-item>
          {(isModerator || isAdmin) && (
            <nldd-menu-item icon="clipboard-bullet-list" text="Goedkeuringen" href="/goedkeuringen"></nldd-menu-item>
          )}
          {(isAdmin || !configured) && <nldd-menu-item icon="shield-check-mark" text="Beheer" href="/admin"></nldd-menu-item>}
          <nldd-menu-item icon="email" text="Contact" href="/contact"></nldd-menu-item>
          <nldd-menu-group text="Thema">
            {THEMES.map((t) => (
              <MenuAction
                key={t.value}
                type="radio"
                icon={t.icon}
                text={t.label}
                selected={theme === t.value || undefined}
                onSelect={() => setTheme(t.value)}
              />
            ))}
          </nldd-menu-group>
          {signedIn && (
            <>
              <nldd-menu-divider></nldd-menu-divider>
              <MenuAction icon="logout" text="Uitloggen" onSelect={() => void handleSignOut()} />
            </>
          )}
        </nldd-menu>
      </nldd-menu-bar-item>
      {!configured &&
        createPortal(
        <LocalNameDialog
          open={naming}
          onClose={(name) => {
            setNaming(false);
            if (name !== undefined) {
              setCurrentUser(name);
              setLocalName(name);
            }
          }}
        />,
        document.body,
      )}
    </>
  );
}
