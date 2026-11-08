-- 0052_user_memories.sql
-- Geheugen van de chat: vaste wensen die een gebruiker in een gesprek uitspreekt
-- met woorden als "voortaan", "onthoud dit" of "vanaf nu altijd".
--
-- Elke wens is een eigen rij, zodat de gebruiker hem op /instellingen/chat los
-- kan zien en verwijderen. De rijen gaan als laatste blok in de systeemprompt van
-- de chat en zijn daar leidend, ook boven de systeemprompt van de beheerder.
--
-- WAAROM DIT OP DE SERVER STAAT
-- Gesprekken blijven op het apparaat (src/lib/chatStorage.ts). Een wens is net als
-- de eigen instructie uit 0047 een instelling die de gebruiker op elk apparaat
-- terugverwacht, en de gebruiker vraagt er zelf om met "onthoud dit". Het gesprek
-- zelf komt hier niet: alleen de korte regel die de AI uit het bericht schrijft.
--
-- WAAROM EEN VECTOR
-- Tot zo'n 100.000 tokens gaan alle wensen mee in elke beurt. Daarboven gaan alleen
-- de wensen mee die het best bij de vraag passen, gevonden met mistral-embed
-- (1024 dimensies, zelfde model als 0049). De vector wordt bij het opslaan gemaakt:
-- de tekst gaat dan toch al naar Mistral om de wens op te schrijven. Een wens
-- zonder vector krijgt hem later alsnog (mode 'memory-search').
--
-- Strikt eigenaar-alleen RLS, net als 0047: ook een beheerder leest niet mee.

CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- DEFAULT auth.uid(): de edge function voegt rijen toe met het token van de
  -- gebruiker en hoeft het id dus niet zelf mee te sturen.
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Spiegel van MAX_MEMORY_CHARS in src/services/memoryService.ts en in de edge
  -- function. Eén korte regel, geen lap tekst.
  text TEXT NOT NULL CONSTRAINT user_memories_text_len CHECK (char_length(text) BETWEEN 1 AND 500),
  embedding extensions.vector(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories (user_id, created_at);

ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON user_memories FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON user_memories TO authenticated;
-- Wijzigen kan alleen de vector: de tekst schrijft de gebruiker opnieuw door de
-- wens opnieuw uit te spreken, of hij verwijdert hem.
GRANT UPDATE (embedding) ON user_memories TO authenticated;

DROP POLICY IF EXISTS "user_memories_owner_select" ON user_memories;
CREATE POLICY "user_memories_owner_select" ON user_memories
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_memories_owner_insert" ON user_memories;
CREATE POLICY "user_memories_owner_insert" ON user_memories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_memories_owner_update" ON user_memories;
CREATE POLICY "user_memories_owner_update" ON user_memories
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_memories_owner_delete" ON user_memories;
CREATE POLICY "user_memories_owner_delete" ON user_memories
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- De wensen die het best bij een vraag passen. Draait onder de rechten van de
-- aanroeper, dus RLS beperkt het tot de eigen rijen. Bewust geen HNSW-index om
-- dezelfde reden als in 0049: per gebruiker exact vergelijken is snel genoeg.
CREATE OR REPLACE FUNCTION match_user_memories(
  p_embedding extensions.vector,
  p_limit INTEGER DEFAULT 40
)
RETURNS TABLE (id UUID, text TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT m.id, m.text, m.created_at
  FROM user_memories m
  WHERE m.user_id = auth.uid() AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_embedding, m.created_at
  LIMIT least(greatest(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION match_user_memories(extensions.vector, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION match_user_memories(extensions.vector, INTEGER) TO authenticated;
