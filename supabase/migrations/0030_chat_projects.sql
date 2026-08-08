-- 0030_chat_projects.sql
-- Chatprojecten: een map met een eigen projectinstructie en bronbestanden.
-- Elk gesprek dat vanuit een project start, draait onder die instructie met die
-- bestanden als bron.
--
-- WAAROM DIT WÉL IN DE DATABASE STAAT EN DE GESPREKKEN NIET
-- Gesprekken zijn vluchtig en privé: die blijven in localStorage en verdwijnen
-- bij uitloggen (zie src/lib/chatStorage.ts). Een project is juist het
-- tegenovergestelde: de gebruiker bouwt er langdurig aan, wil het op elk
-- apparaat terugzien en zou het verliezen bij een gewiste browser. Alleen de
-- BRON (instructie + bestandstekst) staat hier dus; geen enkele chatbeurt.
--
-- ALLEEN DE GEËXTRAHEERDE TEKST, NIET HET ORIGINELE BESTAND
-- De client haalt de platte tekst uit .txt/.md/.pdf/.docx (src/lib/extractDocument.ts)
-- en bewaart die hier. Verderop in de keten bestaat het bestand alleen nog als
-- tekst: de edge function plakt hem als bronblok in de systeemprompt. Een
-- Storage-bucket met het origineel zou een tweede opslag, eigen RLS en een
-- downloadpad kosten zonder dat het antwoord van het model erdoor verandert.
-- Wil je later tóch originelen bewaren, voeg dan een `storage_path`-kolom toe;
-- de rest van de keten hoeft daar niet voor te wijzigen.

-- --- De projecten zelf ---

CREATE TABLE IF NOT EXISTS chat_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Eigenaar. ON DELETE CASCADE: een verwijderd account laat geen projecten na.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Naam zoals in de zijbalk, bijv. "Merkstem" of "Verkoopmails".
  name TEXT NOT NULL,
  -- De projectinstructie: de vaste instructie die elk gesprek in dit project
  -- stuurt. Leeg mag: dan is het project puur een map met bronbestanden.
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Grenzen in de database, niet alleen in de UI: een client die de service
  -- rechtstreeks aanroept kan hier geen roman in de systeemprompt duwen.
  CONSTRAINT chat_projects_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT chat_projects_instructions_len CHECK (char_length(instructions) <= 20000)
);

-- De zijbalk vraagt altijd hetzelfde op: mijn projecten, recentst bijgewerkt eerst.
CREATE INDEX IF NOT EXISTS idx_chat_projects_user
  ON chat_projects(user_id, updated_at DESC);

-- --- De bronbestanden van een project ---

CREATE TABLE IF NOT EXISTS chat_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  -- Bestandsnaam zoals geüpload; het model ziet deze naam boven het bronblok.
  name TEXT NOT NULL,
  -- De geëxtraheerde platte tekst. Dit IS het bestand voor de rest van de keten.
  text TEXT NOT NULL,
  -- Aantal tekens van `text`, zodat de UI het bronbudget kan tonen zonder de
  -- volledige tekst op te halen (de lijst selecteert bewust niet op `text`).
  chars INTEGER NOT NULL DEFAULT 0,
  -- De tekst is bij het uploaden afgekapt op de bestandslimiet.
  truncated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_project_files_name_len CHECK (char_length(name) BETWEEN 1 AND 200),
  -- Spiegel van MAX_PROJECT_FILE_CHARS in src/services/chatProjectService.ts.
  CONSTRAINT chat_project_files_text_len CHECK (char_length(text) <= 100000)
);

CREATE INDEX IF NOT EXISTS idx_chat_project_files_project
  ON chat_project_files(project_id, created_at);

-- --- RLS: strikt eigenaar-alleen ---
-- Anders dan de meeste tabellen in deze database is hier NIETS publiek en leest
-- ook een beheerder niet mee: in een projectinstructie en zijn bronbestanden
-- staat het werk (en soms de klantdata) van één gebruiker.

ALTER TABLE chat_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_projects_owner_select" ON chat_projects;
CREATE POLICY "chat_projects_owner_select" ON chat_projects
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_projects_owner_insert" ON chat_projects;
CREATE POLICY "chat_projects_owner_insert" ON chat_projects
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_projects_owner_update" ON chat_projects;
CREATE POLICY "chat_projects_owner_update" ON chat_projects
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_projects_owner_delete" ON chat_projects;
CREATE POLICY "chat_projects_owner_delete" ON chat_projects
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE chat_project_files ENABLE ROW LEVEL SECURITY;

-- Bestanden erven het eigendom van hun project. De EXISTS-subquery draait onder
-- dezelfde RLS, dus een project van iemand anders levert geen rij op.
DROP POLICY IF EXISTS "chat_project_files_owner_select" ON chat_project_files;
CREATE POLICY "chat_project_files_owner_select" ON chat_project_files
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_projects p
      WHERE p.id = chat_project_files.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_project_files_owner_insert" ON chat_project_files;
CREATE POLICY "chat_project_files_owner_insert" ON chat_project_files
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_projects p
      WHERE p.id = chat_project_files.project_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "chat_project_files_owner_delete" ON chat_project_files;
CREATE POLICY "chat_project_files_owner_delete" ON chat_project_files
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_projects p
      WHERE p.id = chat_project_files.project_id AND p.user_id = auth.uid()
    )
  );

-- Bestanden worden nooit bijgewerkt, alleen toegevoegd en verwijderd: een
-- gewijzigd document is een nieuwe upload. Daarom bewust geen UPDATE-policy.

-- --- updated_at bijhouden ---
-- De zijbalk sorteert op updated_at, dus die moet meelopen met elke wijziging
-- aan de instructie of de naam.

CREATE OR REPLACE FUNCTION public.touch_chat_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_projects_touch ON chat_projects;
CREATE TRIGGER trg_chat_projects_touch
  BEFORE UPDATE ON chat_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_chat_project();

COMMENT ON TABLE chat_projects IS
  'Chatproject: projectinstructie + bronbestanden waaronder gesprekken draaien. Eigenaar-alleen; de gesprekken zelf staan uitsluitend in localStorage.';
COMMENT ON TABLE chat_project_files IS
  'Geëxtraheerde tekst van een bronbestand in een chatproject. Het originele bestand wordt bewust niet bewaard.';
COMMENT ON COLUMN chat_projects.instructions IS
  'Projectinstructie van de gebruiker. Gaat als leidende instructie mee in de systeemprompt van elk gesprek in dit project.';
