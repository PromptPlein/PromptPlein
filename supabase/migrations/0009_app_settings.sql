-- Overheid Prompt Library — globale app-instellingen.
--
-- Eenvoudige key/value-tabel voor app-brede instellingen die de admin beheert.
-- Eerste gebruik: `optimize_provider` — de AI-provider die voor ALLE
-- prompt-optimalisaties wordt gebruikt (gebruikers kiezen niet meer zelf).
--
-- Leesbaar voor iedereen (de optimizer moet de keuze kunnen lezen), maar
-- alleen admins mogen schrijven.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Iedereen (ook anon) mag instellingen lezen.
DROP POLICY IF EXISTS app_settings_select ON app_settings;
CREATE POLICY app_settings_select ON app_settings
  FOR SELECT TO anon, authenticated USING (TRUE);

-- Alleen admins mogen instellingen aanmaken/wijzigen/verwijderen.
DROP POLICY IF EXISTS app_settings_admin_write ON app_settings;
CREATE POLICY app_settings_admin_write ON app_settings
  FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- Standaardwaarde: automatische fallback-keten (Claude → GPT-4 → DeepSeek).
INSERT INTO app_settings (key, value)
  VALUES ('optimize_provider', 'auto')
  ON CONFLICT (key) DO NOTHING;
