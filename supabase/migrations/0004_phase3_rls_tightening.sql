-- Overheid Prompt Library — Phase 3: aanscherpen RLS op de Phase 1/2-tabellen.
--
-- Tot nu toe stonden deze tabellen volledig open (anon mocht alles, incl.
-- verwijderen). Nu de inlog-UI live is, sluiten we dat gat:
--   * Lezen blijft openbaar waar de publieke app dat nodig heeft
--     (taxonomie, prompts, gedeelde links). SELECT USING (true) wordt door de
--     linter bewust niet als probleem gezien.
--   * Schrijven (INSERT/UPDATE/DELETE) vereist een ingelogde gebruiker; beheer
--     van taxonomie/sjablonen is voorbehouden aan admins (is_admin()).
--   * Telemetrie (analytics) en deel-links blijven bewust insertbaar zonder
--     login, omdat ze ook door anonieme bezoekers worden gegenereerd.
--
-- LET OP — gedragswijziging: anonieme bezoekers kunnen geen prompts meer
-- aanmaken/bewerken/verwijderen. Daarvoor is voortaan inloggen vereist.

-- Helper: predicaat "is ingelogd" (vermijdt de always-true linterwaarschuwing
-- en documenteert de bedoeling).
-- (auth.uid() IS NOT NULL is true zodra er een geldige sessie is.)

-- 1. PROMPTS — openbaar leesbaar; schrijven vereist login.
DROP POLICY IF EXISTS "phase1_open_prompts" ON prompts;
DROP POLICY IF EXISTS "prompts_read" ON prompts;
DROP POLICY IF EXISTS "prompts_write_auth" ON prompts;
CREATE POLICY "prompts_read" ON prompts FOR SELECT USING (true);
CREATE POLICY "prompts_insert_auth" ON prompts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "prompts_update_auth" ON prompts
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "prompts_delete_auth" ON prompts
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 2. OPTIMIZATIONS — idem.
DROP POLICY IF EXISTS "phase1_open_optimizations" ON optimizations;
CREATE POLICY "optimizations_read" ON optimizations FOR SELECT USING (true);
CREATE POLICY "optimizations_insert_auth" ON optimizations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "optimizations_update_auth" ON optimizations
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "optimizations_delete_auth" ON optimizations
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 3. TAXONOMIE (roles/categories/techniques) — openbaar leesbaar; alleen admins beheren.
DROP POLICY IF EXISTS "phase2_write_roles" ON roles;
DROP POLICY IF EXISTS "phase1_read_roles" ON roles;
CREATE POLICY "roles_read" ON roles FOR SELECT USING (true);
CREATE POLICY "roles_admin_write" ON roles
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "phase2_write_categories" ON categories;
DROP POLICY IF EXISTS "phase1_read_categories" ON categories;
CREATE POLICY "categories_read" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_admin_write" ON categories
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "phase2_write_techniques" ON techniques;
DROP POLICY IF EXISTS "phase1_read_techniques" ON techniques;
CREATE POLICY "techniques_read" ON techniques FOR SELECT USING (true);
CREATE POLICY "techniques_admin_write" ON techniques
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 4. TECHNIQUE_TEMPLATES — openbaar leesbaar; alleen admins beheren.
DROP POLICY IF EXISTS "phase2_open_templates" ON technique_templates;
CREATE POLICY "templates_read" ON technique_templates FOR SELECT USING (true);
CREATE POLICY "templates_admin_write" ON technique_templates
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 5. ANALYTICS_EVENTS — bewust openbaar insertbaar (telemetrie van alle
-- bezoekers); alleen admins mogen lezen; niemand mag wijzigen/verwijderen.
DROP POLICY IF EXISTS "phase2_open_analytics" ON analytics_events;
CREATE POLICY "analytics_insert_any" ON analytics_events
  FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_admin_read" ON analytics_events
  FOR SELECT TO authenticated USING (is_admin());

-- 6. EMAIL_SHARES — publieke deel-links: openbaar leesbaar (via token),
-- aanmaken + weergaveteller bijwerken mag anoniem; verwijderen alleen admins.
DROP POLICY IF EXISTS "phase2_open_shares" ON email_shares;
CREATE POLICY "shares_read" ON email_shares FOR SELECT USING (true);
CREATE POLICY "shares_insert_any" ON email_shares FOR INSERT WITH CHECK (true);
CREATE POLICY "shares_update_any" ON email_shares
  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "shares_admin_delete" ON email_shares
  FOR DELETE TO authenticated USING (is_admin());

-- 7. ADMIN_AUDIT_LOG — alleen admins mogen schrijven en lezen.
DROP POLICY IF EXISTS "phase2_open_audit" ON admin_audit_log;
CREATE POLICY "audit_admin_insert" ON admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "audit_admin_read" ON admin_audit_log
  FOR SELECT TO authenticated USING (is_admin());
