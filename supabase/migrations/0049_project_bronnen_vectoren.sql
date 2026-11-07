-- Zoeken op betekenis in de bronbestanden van een project.
--
-- De stukken uit migratie 0046 krijgen een vector van mistral-embed (1024
-- dimensies). Een vraag over "vakantiedagen" vindt daarmee ook een stuk over
-- "verlof", wat de woordzoeker mist. Die blijft meedoen, want voor exacte
-- termen zoals wetsartikelen en zaaknummers is hij juist beter.
--
-- De vectoren staan in deze database; er komt geen aparte vectordienst bij. De
-- edge function maakt ze (mode 'project-index') en schrijft ze weg met het token
-- van de gebruiker, dus RLS bewaakt ook dit pad.
--
-- Bewust geen HNSW- of IVFFlat-index. Die zoeken over alle projecten en filteren
-- pas daarna op project_id, waardoor treffers binnen één project wegvallen. Een
-- project heeft hoogstens enkele tienduizenden stukken, dus exact vergelijken via
-- idx_chat_project_file_chunks_project is snel genoeg en nooit onvolledig.
--
-- Wissel je van embeddingmodel, gooi de vectoren dan weg: die van twee modellen
-- zijn niet met elkaar te vergelijken.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE chat_project_file_chunks
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1024);

-- Vindt snel wat nog een vector nodig heeft.
CREATE INDEX IF NOT EXISTS idx_chat_project_file_chunks_todo
  ON chat_project_file_chunks (project_id, id) WHERE embedding IS NULL;

-- Tot nu toe kon niemand stukken wijzigen. Nu mag de eigenaar precies één kolom
-- zetten; de tekst blijft alleen via de trigger uit 0046 te schrijven.
REVOKE UPDATE ON chat_project_file_chunks FROM anon, authenticated;
GRANT UPDATE (embedding) ON chat_project_file_chunks TO authenticated;

DROP POLICY IF EXISTS "chat_project_file_chunks_owner_update" ON chat_project_file_chunks;
CREATE POLICY "chat_project_file_chunks_owner_update" ON chat_project_file_chunks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_projects p
      WHERE p.id = chat_project_file_chunks.project_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_projects p
      WHERE p.id = chat_project_file_chunks.project_id AND p.user_id = auth.uid()
    )
  );

-- Schrijft een portie vectoren in één keer weg: [{ "id": 1, "embedding": [...] }].
-- Draait onder de rechten van de aanroeper. Een vector die er al staat, blijft staan.
CREATE OR REPLACE FUNCTION save_chunk_embeddings(p_items JSONB)
RETURNS INTEGER
LANGUAGE sql
SET search_path = public, extensions
AS $$
  WITH gezet AS (
    UPDATE chat_project_file_chunks c
    SET embedding = (i.value -> 'embedding')::text::extensions.vector(1024)
    FROM jsonb_array_elements(p_items) i
    WHERE c.id = (i.value ->> 'id')::bigint AND c.embedding IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM gezet;
$$;

REVOKE ALL ON FUNCTION save_chunk_embeddings(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_chunk_embeddings(JSONB) TO authenticated;

-- De stukken die bij een vraag passen, op betekenis én op woorden. Beide lijsten
-- gaan samen met reciprocal rank fusion: de plek telt en niet de score, want
-- afstand en tekstscore zijn niet met elkaar te vergelijken. Stukken zonder
-- vector en een aanroep zonder p_embedding vallen zo vanzelf terug op de
-- woordzoeker. Draait onder de rechten van de aanroeper, dus RLS bepaalt wat er
-- terugkomt.
CREATE OR REPLACE FUNCTION match_project_chunks(
  p_project UUID,
  p_query TEXT,
  p_embedding extensions.vector DEFAULT NULL,
  p_limit INTEGER DEFAULT 30
)
RETURNS TABLE (file_id UUID, seq INTEGER, text TEXT, rank DOUBLE PRECISION)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT replace(plainto_tsquery('dutch'::regconfig, p_query)::text, '&', '|') AS t
  ),
  woorden AS (
    SELECT c.id, row_number() OVER (ORDER BY ts_rank_cd(c.tsv, q.t::tsquery) DESC, c.id) AS plek
    FROM chat_project_file_chunks c, q
    WHERE q.t <> '' AND c.project_id = p_project AND c.tsv @@ q.t::tsquery
    ORDER BY plek
    LIMIT 100
  ),
  betekenis AS (
    SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> p_embedding, c.id) AS plek
    FROM chat_project_file_chunks c
    WHERE p_embedding IS NOT NULL AND c.project_id = p_project AND c.embedding IS NOT NULL
    ORDER BY plek
    LIMIT 100
  ),
  samen AS (
    SELECT s.id, sum(1.0 / (60 + s.plek)) AS score
    FROM (SELECT * FROM woorden UNION ALL SELECT * FROM betekenis) s
    GROUP BY s.id
  )
  SELECT c.file_id, c.seq, c.text, s.score::double precision
  FROM samen s
  JOIN chat_project_file_chunks c ON c.id = s.id
  ORDER BY s.score DESC, c.file_id, c.seq
  LIMIT least(p_limit, 60);
$$;

REVOKE ALL ON FUNCTION match_project_chunks(UUID, TEXT, extensions.vector, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION match_project_chunks(UUID, TEXT, extensions.vector, INTEGER) TO authenticated;
