-- Community: "likes" (duimpjes) op prompts + publiek leesbare auteursgegevens.
--
-- Doel: collega's stimuleren om prompts te maken en de kwaliteit zichtbaar
-- maken. Iedereen ziet hoeveel likes een prompt heeft; alleen ingelogde
-- ambtenaren kunnen liken, één keer per prompt, en hun like weer intrekken.
--
-- Daarnaast een publieke (geanonimiseerde) kijk op profielen zodat de auteur
-- van een prompt — voornaam + ministerie — voor iedereen zichtbaar is, zonder
-- privacygevoelige velden (zoals e-mail) bloot te geven.

-- 1. Likes-tabel ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS prompt_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Eén like per gebruiker per prompt.
  UNIQUE (prompt_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_likes_prompt ON prompt_likes(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_likes_user ON prompt_likes(user_id);

ALTER TABLE prompt_likes ENABLE ROW LEVEL SECURITY;

-- Iedereen (ook anon) mag de likes lezen → tellingen zijn publiek zichtbaar.
DROP POLICY IF EXISTS prompt_likes_select ON prompt_likes;
CREATE POLICY prompt_likes_select ON prompt_likes
  FOR SELECT TO anon, authenticated USING (TRUE);

-- Alleen ingelogde gebruikers mogen liken, en alleen namens zichzelf.
DROP POLICY IF EXISTS prompt_likes_insert_own ON prompt_likes;
CREATE POLICY prompt_likes_insert_own ON prompt_likes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Je kunt alleen je eigen like weer intrekken.
DROP POLICY IF EXISTS prompt_likes_delete_own ON prompt_likes;
CREATE POLICY prompt_likes_delete_own ON prompt_likes
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Aantal likes per prompt (publiek leesbaar) ---------------------------
--
-- Een view met de telling per prompt. Views erven de rechten van de eigenaar,
-- en omdat de SELECT-policy op prompt_likes toch al publiek is, is dit veilig.

CREATE OR REPLACE VIEW prompt_like_counts AS
  SELECT prompt_id, COUNT(*)::int AS like_count
  FROM prompt_likes
  GROUP BY prompt_id;

GRANT SELECT ON prompt_like_counts TO anon, authenticated;

-- 3. Publieke auteursgegevens --------------------------------------------
--
-- De `profiles`-tabel houdt strikte RLS (e-mail blijft privé). Voor de
-- community tonen we alleen de niet-gevoelige velden: naam + organisatie.
-- security_invoker = off → de view omzeilt de strikte profiles-RLS, maar
-- exposeert bewust alleen onschuldige kolommen.

CREATE OR REPLACE VIEW public_profiles
  WITH (security_invoker = off) AS
  SELECT id, full_name, organization_id
  FROM profiles
  WHERE is_active = TRUE;

GRANT SELECT ON public_profiles TO anon, authenticated;
