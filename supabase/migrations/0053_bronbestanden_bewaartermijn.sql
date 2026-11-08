-- 0053_bronbestanden_bewaartermijn.sql
--
-- Vervangt de bewaartermijn uit 0051. Na drie maanden zonder gebruik gaan alleen
-- de bronbestanden van een project weg (met hun stukken en vectoren, ON DELETE
-- CASCADE uit 0046 en 0049). Het project zelf blijft staan, met naam en
-- instructie.
--
-- Een week vooraf krijgt de eigenaar een mail (transactioneel via brevo-event,
-- dus zonder uitschrijflink: het is een melding over zijn eigen gegevens). In de
-- mail staat een link naar /bronnen-bewaren/<id>. Daar staat de knop die de
-- bestanden bewaart. De link zelf bewaart niets: mailscanners openen links
-- vanzelf, en dan zou niemand ooit iets kwijtraken.
--
-- Elke stap komt in chat_project_retention_log: gewaarschuwd, bewaard en
-- verwijderd. Zo is na te gaan wie wanneer heeft gekozen om te bewaren.
--
-- Gebruik telt nog steeds als bewaren: wie het project opent of er een vraag in
-- stelt, zet de klok terug (mark_chat_project_used uit 0051) en een eventuele
-- waarschuwing vervalt. Dat staat niet in het logboek, de knop wel.

-- 1. Wanneer de waarschuwing is verstuurd. Leeg = nog niet gewaarschuwd.
ALTER TABLE chat_projects
  ADD COLUMN IF NOT EXISTS files_warned_at TIMESTAMPTZ;

-- 2. Het logboek.
CREATE TABLE IF NOT EXISTS chat_project_retention_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Blijft staan als het project later wordt verwijderd.
  project_id UUID REFERENCES chat_projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('gewaarschuwd', 'bewaard', 'verwijderd')),
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_project_retention_log_project
  ON chat_project_retention_log (project_id, created_at DESC);

ALTER TABLE chat_project_retention_log ENABLE ROW LEVEL SECURITY;

-- Lezen mag de eigenaar. Schrijven gaat alleen via de functies hieronder.
DROP POLICY IF EXISTS "retention_log_owner_select" ON chat_project_retention_log;
CREATE POLICY "retention_log_owner_select" ON chat_project_retention_log
  FOR SELECT USING (user_id = auth.uid());

-- 3. Gebruik zet de waarschuwing terug. Waarschuwen zelf telt niet als gebruik
-- en verandert de volgorde in de zijbalk niet.
CREATE OR REPLACE FUNCTION public.touch_chat_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['last_used_at', 'updated_at', 'files_warned_at'])
     = (to_jsonb(OLD) - ARRAY['last_used_at', 'updated_at', 'files_warned_at']) THEN
    NEW.updated_at := OLD.updated_at;
    IF NEW.last_used_at > OLD.last_used_at THEN
      NEW.files_warned_at := NULL;
    END IF;
    RETURN NEW;
  END IF;
  NEW.updated_at := NOW();
  NEW.last_used_at := NOW();
  NEW.files_warned_at := NULL;
  RETURN NEW;
END;
$$;

-- Datum in het Nederlands, los van de taalinstelling van de server.
CREATE OR REPLACE FUNCTION private.datum_nl(p_date DATE)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT extract(day FROM p_date)::int || ' '
    || (ARRAY['januari','februari','maart','april','mei','juni','juli','augustus',
              'september','oktober','november','december'])[extract(month FROM p_date)::int]
    || ' ' || extract(year FROM p_date)::int
$$;

-- De dag waarop de bestanden weggaan: een week na de waarschuwing.
CREATE OR REPLACE FUNCTION private.bronnen_weg_op(p_warned TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT (p_warned AT TIME ZONE 'Europe/Amsterdam')::date + 7
$$;

-- 4. De knop. Alleen de eigenaar, en elke keer komt er een regel in het logboek.
-- Geeft de vroegste datum terug waarop de bestanden weer weg kunnen.
CREATE OR REPLACE FUNCTION public.keep_chat_project_files(p_project UUID)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_files INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd' USING ERRCODE = '42501';
  END IF;

  UPDATE chat_projects
  SET last_used_at = NOW(), files_warned_at = NULL
  WHERE id = p_project AND user_id = auth.uid()
  RETURNING name INTO v_name;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Project niet gevonden' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_files FROM chat_project_files WHERE project_id = p_project;

  INSERT INTO chat_project_retention_log (project_id, user_id, project_name, action, file_count)
  VALUES (p_project, auth.uid(), v_name, 'bewaard', v_files);

  RETURN ((NOW() + INTERVAL '3 months') AT TIME ZONE 'Europe/Amsterdam')::date;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_chat_project_files(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.keep_chat_project_files(UUID) TO authenticated;

-- 5. De nachtelijke taak: eerst verwijderen wat een week geleden is gewaarschuwd,
-- dan waarschuwen wat over een week aan de beurt is. Projecten zonder bestanden
-- slaat hij over: daar valt niets te verwijderen.
--
-- Verwijderen gebeurt alleen na een waarschuwing, ook als de mail niet kon
-- (testaccounts zonder postvak krijgen de waarschuwing wel in het logboek).
-- Dus nooit binnen een week na deze migratie.
CREATE OR REPLACE FUNCTION public.opruimen_ongebruikte_projecten()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_weg INTEGER := 0;
  v_vandaag DATE := (NOW() AT TIME ZONE 'Europe/Amsterdam')::date;
BEGIN
  FOR r IN
    SELECT p.id, p.user_id, p.name,
           (SELECT count(*) FROM chat_project_files f WHERE f.project_id = p.id)::int AS files
    FROM chat_projects p
    WHERE p.files_warned_at IS NOT NULL
      AND private.bronnen_weg_op(p.files_warned_at) <= v_vandaag
  LOOP
    DELETE FROM chat_project_files WHERE project_id = r.id;
    UPDATE chat_projects SET files_warned_at = NULL WHERE id = r.id;
    IF r.files > 0 THEN
      INSERT INTO chat_project_retention_log (project_id, user_id, project_name, action, file_count)
      VALUES (r.id, r.user_id, r.name, 'verwijderd', r.files);
      v_weg := v_weg + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT p.id, p.user_id, p.name,
           (SELECT count(*) FROM chat_project_files f WHERE f.project_id = p.id)::int AS files
    FROM chat_projects p
    WHERE p.files_warned_at IS NULL
      AND p.last_used_at < NOW() - INTERVAL '3 months' + INTERVAL '7 days'
      AND EXISTS (SELECT 1 FROM chat_project_files f WHERE f.project_id = p.id)
  LOOP
    UPDATE chat_projects SET files_warned_at = NOW() WHERE id = r.id;
    INSERT INTO chat_project_retention_log (project_id, user_id, project_name, action, file_count)
    VALUES (r.id, r.user_id, r.name, 'gewaarschuwd', r.files);
    PERFORM private.brevo_event(
      'promptplein_bronnen_verlopen',
      private.mail_recipient(r.user_id),
      jsonb_build_object(
        'titel', r.name,
        'aantal', CASE WHEN r.files = 1 THEN '1 bronbestand' ELSE r.files || ' bronbestanden' END,
        'datum', private.datum_nl(private.bronnen_weg_op(NOW())),
        'link', 'https://www.promptplein.app/bronnen-bewaren/' || r.id
      )
    );
  END LOOP;

  RETURN v_weg;
END;
$$;

REVOKE ALL ON FUNCTION public.opruimen_ongebruikte_projecten() FROM PUBLIC, anon, authenticated;

-- 6. Wat de pagina /bronnen-bewaren toont. Draait onder de rechten van de
-- aanroeper, dus RLS laat alleen het eigen project zien.
CREATE OR REPLACE FUNCTION public.chat_project_retention(p_project UUID)
RETURNS TABLE (name TEXT, file_count INTEGER, delete_on DATE, keep_until DATE)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.name,
         (SELECT count(*) FROM chat_project_files f WHERE f.project_id = p.id)::int,
         -- Zelfde rekensom als private.bronnen_weg_op; dat schema is niet
         -- bereikbaar voor ingelogde gebruikers.
         CASE WHEN p.files_warned_at IS NOT NULL
              THEN (p.files_warned_at AT TIME ZONE 'Europe/Amsterdam')::date + 7 END,
         ((p.last_used_at + INTERVAL '3 months') AT TIME ZONE 'Europe/Amsterdam')::date
  FROM chat_projects p
  WHERE p.id = p_project AND p.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.chat_project_retention(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_project_retention(UUID) TO authenticated;

-- De geplande taak uit 0051 (projecten-opruimen, 03:17 UTC) blijft dezelfde
-- functie aanroepen en hoeft niet te veranderen.
