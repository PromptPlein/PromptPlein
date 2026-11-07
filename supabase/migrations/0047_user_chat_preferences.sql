-- 0047_user_chat_preferences.sql
-- Persoonlijke instructie voor de chat: wensen die een gebruiker zelf instelt en
-- die in elk gewoon gesprek onder de systeemprompt van de beheerder meegaan.
--
-- WAAROM EEN EIGEN TABEL EN GEEN KOLOM OP profiles
-- De SELECT-policy van profiles laat ook collega's uit dezelfde organisatie
-- meelezen. Deze tekst is alleen voor de gebruiker zelf, dus hij krijgt een tabel
-- met strikt eigenaar-alleen RLS, net als chat_projects (0030). Ook een beheerder
-- leest hier niet mee.
--
-- WAAROM DIT WEL OP DE SERVER STAAT
-- Gesprekken blijven op het apparaat (src/lib/chatStorage.ts). Een instructie is
-- een instelling die de gebruiker op elk apparaat terugverwacht en bevat geen
-- gesprek. Daarom vereist hij een account en meldt de interface dat hij op de
-- server staat. Verwijderen wist de rij echt: een lege instructie wordt niet
-- bewaard.

CREATE TABLE IF NOT EXISTS user_chat_preferences (
  -- Eén rij per gebruiker. ON DELETE CASCADE: een verwijderd account laat niets na.
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  personal_instruction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Spiegel van MAX_PERSONAL_INSTRUCTION_CHARS in
  -- src/services/personalInstructionService.ts. De tekst gaat bij elke chatvraag
  -- mee, dus de grens staat ook hier en niet alleen in de interface.
  CONSTRAINT user_chat_preferences_instruction_len
    CHECK (char_length(personal_instruction) BETWEEN 1 AND 4000)
);

DROP TRIGGER IF EXISTS trg_user_chat_preferences_updated_at ON user_chat_preferences;
CREATE TRIGGER trg_user_chat_preferences_updated_at
  BEFORE UPDATE ON user_chat_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_chat_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON user_chat_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_chat_preferences TO authenticated;

DROP POLICY IF EXISTS "user_chat_preferences_owner_select" ON user_chat_preferences;
CREATE POLICY "user_chat_preferences_owner_select" ON user_chat_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_chat_preferences_owner_insert" ON user_chat_preferences;
CREATE POLICY "user_chat_preferences_owner_insert" ON user_chat_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_chat_preferences_owner_update" ON user_chat_preferences;
CREATE POLICY "user_chat_preferences_owner_update" ON user_chat_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_chat_preferences_owner_delete" ON user_chat_preferences;
CREATE POLICY "user_chat_preferences_owner_delete" ON user_chat_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());
