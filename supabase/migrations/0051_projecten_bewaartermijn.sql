-- Bewaartermijn voor chatprojecten: een project dat een jaar niet is gebruikt,
-- wordt verwijderd, met zijn bronbestanden, stukken en vectoren (ON DELETE
-- CASCADE uit 0030, 0046 en 0049). Bronbestanden kunnen persoonsgegevens of
-- vertrouwelijke stukken bevatten; wat niemand meer gebruikt, hoort hier niet te
-- blijven staan.
--
-- Gebruik is: het project openen in de chat, de projectinstellingen openen of
-- een vraag stellen in het project. De client roept daarvoor
-- mark_chat_project_used aan, één keer per sessie. Een wijziging aan naam of
-- instructie telt ook als gebruik.
--
-- Let op: verwijderd is niet meteen overal weg. In de back-ups van Supabase
-- blijven de gegevens staan tot die back-up zelf verloopt.
--
-- Bestaande projecten beginnen te tellen bij het uitvoeren van deze migratie.

ALTER TABLE chat_projects
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_chat_projects_last_used
  ON chat_projects (last_used_at);

-- updated_at bepaalt de volgorde in de zijbalk. Alleen gebruik markeren mag die
-- volgorde niet veranderen; een echte wijziging telt wel als gebruik.
CREATE OR REPLACE FUNCTION public.touch_chat_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.last_used_at IS DISTINCT FROM OLD.last_used_at
     AND (to_jsonb(NEW) - 'last_used_at' - 'updated_at')
       = (to_jsonb(OLD) - 'last_used_at' - 'updated_at') THEN
    NEW.updated_at := OLD.updated_at;
    RETURN NEW;
  END IF;
  NEW.updated_at := NOW();
  NEW.last_used_at := NOW();
  RETURN NEW;
END;
$$;

-- Markeert gebruik. Draait onder de rechten van de aanroeper, dus RLS laat
-- alleen de eigenaar zijn eigen project bijwerken. Hoogstens één keer per uur
-- een schrijfactie.
CREATE OR REPLACE FUNCTION public.mark_chat_project_used(p_project UUID)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE chat_projects
  SET last_used_at = NOW()
  WHERE id = p_project
    AND user_id = auth.uid()
    AND last_used_at < NOW() - INTERVAL '1 hour';
$$;

REVOKE ALL ON FUNCTION public.mark_chat_project_used(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_chat_project_used(UUID) TO authenticated;

-- Ruimt op wat een jaar niet is gebruikt. Alleen voor de geplande taak hieronder.
CREATE OR REPLACE FUNCTION public.opruimen_ongebruikte_projecten()
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH weg AS (
    DELETE FROM chat_projects
    WHERE last_used_at < NOW() - INTERVAL '1 year'
    RETURNING 1
  )
  SELECT count(*)::integer FROM weg;
$$;

REVOKE ALL ON FUNCTION public.opruimen_ongebruikte_projecten() FROM PUBLIC, anon, authenticated;

-- Elke nacht om 03:17 UTC. De uitkomst staat in cron.job_run_details.
--
-- Bewust geen GRANT op het schema cron: Supabase zet die rechten zelf bij het
-- aanzetten van pg_cron. Dat doet een event trigger van Supabase bij elk
-- CREATE EXTENSION voor pg_cron, ook bij IF NOT EXISTS als de extensie er al is,
-- en die tweede keer faalt met "2BP01: dependent privileges exist". Daarom
-- draait het commando alleen als pg_cron nog ontbreekt. Zo is het bestand veilig
-- om opnieuw te draaien: cron.schedule met dezelfde naam werkt de bestaande taak bij.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;
  END IF;
END
$$;

SELECT cron.schedule(
  'projecten-opruimen',
  '17 3 * * *',
  $$SELECT public.opruimen_ongebruikte_projecten()$$
);
