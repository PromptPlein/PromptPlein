-- Overheid Prompt Library — Phase 3: beveiligings- & prestatieoptimalisatie.
--
-- 1. Trigger-functies niet langer als REST-RPC blootstellen (ze draaien alleen
--    als trigger). Verwijdert de "SECURITY DEFINER executable"-waarschuwingen.
-- 2. Ontbrekende dekkende indexen op foreign keys toevoegen.
-- 3. RLS-policies optimaliseren: auth.uid() in een (select …) wikkelen zodat het
--    één keer per query wordt geëvalueerd (auth_rls_initplan).
-- 4. Overlappende permissieve policies opheffen: admin-FOR ALL-policies opsplitsen
--    of samenvoegen, zodat er per (rol, actie) maar één policy is.

-- 1. Trigger-functies afschermen ---------------------------------------------
REVOKE EXECUTE ON FUNCTION public.notify_on_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_comment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_collaborator() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_prompt_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_prompt_version() FROM PUBLIC, anon, authenticated;

-- 2. Dekkende indexen op foreign keys ----------------------------------------
CREATE INDEX IF NOT EXISTS idx_analytics_prompt ON analytics_events(prompt_id);
CREATE INDEX IF NOT EXISTS idx_approvals_reviewer ON prompt_approvals(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_collab_added_by ON prompt_collaborators(added_by);
CREATE INDEX IF NOT EXISTS idx_comments_user ON prompt_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_versions_created_by ON prompt_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_prompts_reviewed_by ON prompts(reviewed_by);

-- 3 + 4. Policies herschrijven -----------------------------------------------

-- profiles: SELECT (eigen/zelfde org/admin), één UPDATE-policy (eigen óf admin),
-- aparte admin INSERT/DELETE. Verwijdert de FOR ALL-overlap.
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()) OR organization_id = current_org_id() OR is_admin());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()) OR is_admin())
  WITH CHECK (
    (id = (select auth.uid()) AND role = current_app_role()) OR is_admin()
  );

CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE TO authenticated USING (is_admin());

-- prompts: alleen de INSERT-policy bevat auth.uid().
DROP POLICY IF EXISTS "prompts_insert_auth" ON prompts;
CREATE POLICY "prompts_insert_auth" ON prompts
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);

-- optimizations: insert/update/delete.
DROP POLICY IF EXISTS "optimizations_insert_auth" ON optimizations;
DROP POLICY IF EXISTS "optimizations_update_auth" ON optimizations;
DROP POLICY IF EXISTS "optimizations_delete_auth" ON optimizations;
CREATE POLICY "optimizations_insert_auth" ON optimizations
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "optimizations_update_auth" ON optimizations
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL) WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "optimizations_delete_auth" ON optimizations
  FOR DELETE TO authenticated USING ((select auth.uid()) IS NOT NULL);

-- Taxonomie + sjablonen: openbare lees-policy blijft; admin-FOR ALL opsplitsen
-- in INSERT/UPDATE/DELETE zodat SELECT niet dubbel wordt geëvalueerd.
DROP POLICY IF EXISTS "categories_admin_write" ON categories;
CREATE POLICY "categories_admin_insert" ON categories FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "categories_admin_update" ON categories FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "categories_admin_delete" ON categories FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "roles_admin_write" ON roles;
CREATE POLICY "roles_admin_insert" ON roles FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "roles_admin_update" ON roles FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "roles_admin_delete" ON roles FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "techniques_admin_write" ON techniques;
CREATE POLICY "techniques_admin_insert" ON techniques FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "techniques_admin_update" ON techniques FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "techniques_admin_delete" ON techniques FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "templates_admin_write" ON technique_templates;
CREATE POLICY "templates_admin_insert" ON technique_templates FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "templates_admin_update" ON technique_templates FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "templates_admin_delete" ON technique_templates FOR DELETE TO authenticated USING (is_admin());

-- prompt_collaborators: read blijft; collab_manage (FOR ALL) opsplitsen.
DROP POLICY IF EXISTS "collab_read" ON prompt_collaborators;
DROP POLICY IF EXISTS "collab_manage" ON prompt_collaborators;
CREATE POLICY "collab_read" ON prompt_collaborators
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR can_edit_prompt(prompt_id));

CREATE POLICY "collab_insert" ON prompt_collaborators
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id
        AND prompts.created_by_user = (select auth.uid())
    )
  );
CREATE POLICY "collab_update" ON prompt_collaborators
  FOR UPDATE TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id
        AND prompts.created_by_user = (select auth.uid())
    )
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id
        AND prompts.created_by_user = (select auth.uid())
    )
  );
CREATE POLICY "collab_delete" ON prompt_collaborators
  FOR DELETE TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id
        AND prompts.created_by_user = (select auth.uid())
    )
  );

-- prompt_comments: insert/delete bevatten auth.uid().
DROP POLICY IF EXISTS "comments_insert" ON prompt_comments;
DROP POLICY IF EXISTS "comments_delete" ON prompt_comments;
CREATE POLICY "comments_insert" ON prompt_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "comments_delete" ON prompt_comments
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()) OR is_admin());

-- notifications: alle eigen-policies.
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
