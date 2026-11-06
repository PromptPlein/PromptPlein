-- Grote en veel bronbestanden in een project.
--
-- De limiet per bestand gaat van 100.000 naar 1.000.000 tekens. Per beurt past
-- er nog steeds 200.000 tekens in het gesprek, dus een groot project stuurt niet
-- meer alles mee maar de stukken die bij de vraag passen. Daarvoor wordt elk
-- bestand hier opgeknipt en doorzoekbaar gemaakt met de Nederlandse tekstzoeker
-- van Postgres. De tekst blijft in deze database; er komt geen externe dienst bij.

-- Spiegel van MAX_PROJECT_FILE_CHARS in src/services/chatProjectService.ts.
ALTER TABLE chat_project_files DROP CONSTRAINT IF EXISTS chat_project_files_text_len;
ALTER TABLE chat_project_files
  ADD CONSTRAINT chat_project_files_text_len CHECK (char_length(text) <= 1000000);

CREATE TABLE IF NOT EXISTS chat_project_file_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES chat_project_files(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('dutch'::regconfig, text)) STORED,
  UNIQUE (file_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_chat_project_file_chunks_tsv
  ON chat_project_file_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_chat_project_file_chunks_project
  ON chat_project_file_chunks (project_id, seq);

-- Strikt eigenaar-alleen, net als de bestanden zelf. Schrijven gebeurt alleen
-- via de trigger hieronder, dus er is bewust geen insert-policy.
ALTER TABLE chat_project_file_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_project_file_chunks_owner_select" ON chat_project_file_chunks;
CREATE POLICY "chat_project_file_chunks_owner_select" ON chat_project_file_chunks
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_projects p
      WHERE p.id = chat_project_file_chunks.project_id AND p.user_id = auth.uid()
    )
  );

-- Knipt op zinsgrenzen, in stukken van hoogstens 1600 tekens.
CREATE OR REPLACE FUNCTION split_project_file(p_file UUID, p_project UUID, p_text TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total INTEGER := char_length(p_text);
  pos INTEGER := 1;
  n INTEGER := 0;
  piece TEXT;
  cut INTEGER;
BEGIN
  WHILE pos <= total LOOP
    piece := substr(p_text, pos, 1600);
    cut := char_length(piece);
    IF pos + cut <= total THEN
      cut := coalesce(char_length(substring(piece FROM '(?s)^.*[.!?\n]\s')), 0);
      IF cut < 800 THEN cut := char_length(piece); END IF;
    END IF;
    piece := btrim(left(piece, cut));
    IF piece <> '' THEN
      INSERT INTO chat_project_file_chunks (file_id, project_id, seq, text)
      VALUES (p_file, p_project, n, piece);
      n := n + 1;
    END IF;
    pos := pos + cut;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION split_project_file(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION chat_project_files_split()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM split_project_file(NEW.id, NEW.project_id, NEW.text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_project_files_split ON chat_project_files;
CREATE TRIGGER trg_chat_project_files_split
  AFTER INSERT ON chat_project_files
  FOR EACH ROW EXECUTE FUNCTION chat_project_files_split();

-- Bestanden die er al staan ook doorzoekbaar maken.
SELECT split_project_file(f.id, f.project_id, f.text)
FROM chat_project_files f
WHERE NOT EXISTS (SELECT 1 FROM chat_project_file_chunks c WHERE c.file_id = f.id);

-- De stukken die bij een vraag passen. Elk woord telt los (OF in plaats van EN):
-- een gewone vraag bevat vrijwel nooit al zijn woorden in één alinea. Draait
-- onder de rechten van de aanroeper, dus RLS bepaalt wat er terugkomt.
CREATE OR REPLACE FUNCTION search_project_chunks(p_project UUID, p_query TEXT, p_limit INTEGER DEFAULT 130)
RETURNS TABLE (file_id UUID, seq INTEGER, text TEXT, rank REAL)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT replace(plainto_tsquery('dutch'::regconfig, p_query)::text, '&', '|') AS t
  )
  SELECT c.file_id, c.seq, c.text, ts_rank_cd(c.tsv, q.t::tsquery)
  FROM chat_project_file_chunks c, q
  WHERE q.t <> '' AND c.project_id = p_project AND c.tsv @@ q.t::tsquery
  ORDER BY 4 DESC, c.file_id, c.seq
  LIMIT least(p_limit, 200);
$$;

REVOKE ALL ON FUNCTION search_project_chunks(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_project_chunks(UUID, TEXT, INTEGER) TO authenticated;
