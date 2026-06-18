-- Overheid Prompt Library — Phase 3: in-app notificaties.
--
-- Notificaties worden server-side gegenereerd via triggers op de
-- samenwerkingsgebeurtenissen (goedkeuring, reacties, medewerker toegevoegd),
-- zodat ze niet te omzeilen zijn vanuit de client.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('approval', 'comment', 'collaborator', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Gebruikers zien en beheren uitsluitend hun eigen notificaties.
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- (Geen INSERT-policy: notificaties ontstaan alleen via de triggers hieronder.)

-- 1. Goedkeuring/afwijzing → notificeer de eigenaar.
CREATE OR REPLACE FUNCTION public.notify_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved', 'rejected')
     AND NEW.created_by_user IS NOT NULL
     AND NEW.created_by_user IS DISTINCT FROM NEW.reviewed_by THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.created_by_user,
      'approval',
      CASE WHEN NEW.status = 'approved' THEN 'Prompt goedgekeurd' ELSE 'Prompt afgewezen' END,
      NEW.title,
      '/prompt/' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_status ON prompts;
CREATE TRIGGER trg_notify_status
  AFTER UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION notify_on_status_change();

-- 2. Nieuwe reactie → notificeer eigenaar + medewerkers (behalve de auteur).
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT id, title, created_by_user INTO p FROM prompts WHERE id = NEW.prompt_id;

  IF p.created_by_user IS NOT NULL AND p.created_by_user <> NEW.user_id THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (p.created_by_user, 'comment', 'Nieuwe reactie op je prompt', p.title, '/prompt/' || p.id);
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT c.user_id, 'comment', 'Nieuwe reactie', p.title, '/prompt/' || p.id
  FROM prompt_collaborators c
  WHERE c.prompt_id = NEW.prompt_id
    AND c.user_id <> NEW.user_id
    AND c.user_id IS DISTINCT FROM p.created_by_user;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment ON prompt_comments;
CREATE TRIGGER trg_notify_comment
  AFTER INSERT ON prompt_comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- 3. Als medewerker toegevoegd → notificeer de betreffende gebruiker.
CREATE OR REPLACE FUNCTION public.notify_on_collaborator()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p_title TEXT;
BEGIN
  IF NEW.user_id IS DISTINCT FROM NEW.added_by THEN
    SELECT title INTO p_title FROM prompts WHERE id = NEW.prompt_id;
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'collaborator', 'Toegevoegd als medewerker', p_title, '/prompt/' || NEW.prompt_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_collaborator ON prompt_collaborators;
CREATE TRIGGER trg_notify_collaborator
  AFTER INSERT ON prompt_collaborators
  FOR EACH ROW EXECUTE FUNCTION notify_on_collaborator();

-- 4. Live updates: voeg de tabel toe aan de realtime-publicatie (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END
$$;
