import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchesShortcut, SHORTCUTS } from '@/lib/shortcuts';

/** De sneltoets naar de hulppagina werkt op elke pagina. */
export default function HelpShortcut() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!matchesShortcut(e, SHORTCUTS.hulp)) return;
      e.preventDefault();
      navigate('/instellingen/hulp');
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return null;
}
