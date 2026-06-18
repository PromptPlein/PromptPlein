-- Overheid Prompt Library — Phase 3: RLS-hulpfuncties naar een afgeschermd
-- `private`-schema verplaatsen. PostgREST exposeert alleen `public`, dus deze
-- functies zijn daarna niet meer als REST-RPC aanroepbaar — terwijl RLS ze nog
-- gewoon kan gebruiken. Lost de laatste "SECURITY DEFINER executable"-
-- waarschuwingen voor onze eigen helpers op.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Helpers opnieuw aanmaken in `private`.
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION private.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.can_edit_prompt(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_admin()
    OR EXISTS (SELECT 1 FROM public.prompts WHERE id = p_id AND created_by_user = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.prompt_collaborators
      WHERE prompt_id = p_id AND user_id = auth.uid() AND role = 'editor'
    )
$$;

REVOKE EXECUTE ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.current_app_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.current_org_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_edit_prompt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_prompt(uuid) TO authenticated;

-- Alle policies herschrijven naar private.* ----------------------------------

-- admin_audit_log
DROP POLICY IF EXISTS "audit_admin_insert" ON admin_audit_log;
DROP POLICY IF EXISTS "audit_admin_read" ON admin_audit_log;
CREATE POLICY "audit_admin_insert" ON admin_audit_log FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "audit_admin_read" ON admin_audit_log FOR SELECT TO authenticated USING (private.is_admin());

-- analytics_events
DROP POLICY IF EXISTS "analytics_admin_read" ON analytics_events;
CREATE POLICY "analytics_admin_read" ON analytics_events FOR SELECT TO authenticated USING (private.is_admin());

-- categories
DROP POLICY IF EXISTS "categories_admin_insert" ON categories;
DROP POLICY IF EXISTS "categories_admin_update" ON categories;
DROP POLICY IF EXISTS "categories_admin_delete" ON categories;
CREATE POLICY "categories_admin_insert" ON categories FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "categories_admin_update" ON categories FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "categories_admin_delete" ON categories FOR DELETE TO authenticated USING (private.is_admin());

-- email_shares
DROP POLICY IF EXISTS "shares_admin_delete" ON email_shares;
CREATE POLICY "shares_admin_delete" ON email_shares FOR DELETE TO authenticated USING (private.is_admin());

-- organizations
DROP POLICY IF EXISTS "orgs_admin_insert" ON organizations;
DROP POLICY IF EXISTS "orgs_admin_update" ON organizations;
DROP POLICY IF EXISTS "orgs_admin_delete" ON organizations;
CREATE POLICY "orgs_admin_insert" ON organizations FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "orgs_admin_update" ON organizations FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "orgs_admin_delete" ON organizations FOR DELETE TO authenticated USING (private.is_admin());

-- profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (id = (select auth.uid()) OR organization_id = private.current_org_id() OR private.is_admin());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (id = (select auth.uid()) OR private.is_admin())
  WITH CHECK ((id = (select auth.uid()) AND role = private.current_app_role()) OR private.is_admin());
CREATE POLICY "profiles_insert_admin" ON profiles FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE TO authenticated USING (private.is_admin());

-- prompt_approvals
DROP POLICY IF EXISTS "approvals_insert" ON prompt_approvals;
DROP POLICY IF EXISTS "approvals_read" ON prompt_approvals;
CREATE POLICY "approvals_insert" ON prompt_approvals FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "approvals_read" ON prompt_approvals FOR SELECT TO authenticated
  USING (private.can_edit_prompt(prompt_id) OR private.is_admin());

-- prompt_collaborators
DROP POLICY IF EXISTS "collab_read" ON prompt_collaborators;
DROP POLICY IF EXISTS "collab_insert" ON prompt_collaborators;
DROP POLICY IF EXISTS "collab_update" ON prompt_collaborators;
DROP POLICY IF EXISTS "collab_delete" ON prompt_collaborators;
CREATE POLICY "collab_read" ON prompt_collaborators FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR private.can_edit_prompt(prompt_id));
CREATE POLICY "collab_insert" ON prompt_collaborators FOR INSERT TO authenticated
  WITH CHECK (private.is_admin() OR EXISTS (SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id AND prompts.created_by_user = (select auth.uid())));
CREATE POLICY "collab_update" ON prompt_collaborators FOR UPDATE TO authenticated
  USING (private.is_admin() OR EXISTS (SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id AND prompts.created_by_user = (select auth.uid())))
  WITH CHECK (private.is_admin() OR EXISTS (SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id AND prompts.created_by_user = (select auth.uid())));
CREATE POLICY "collab_delete" ON prompt_collaborators FOR DELETE TO authenticated
  USING (private.is_admin() OR EXISTS (SELECT 1 FROM prompts WHERE prompts.id = prompt_collaborators.prompt_id AND prompts.created_by_user = (select auth.uid())));

-- prompt_comments
DROP POLICY IF EXISTS "comments_delete" ON prompt_comments;
CREATE POLICY "comments_delete" ON prompt_comments FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()) OR private.is_admin());

-- prompts
DROP POLICY IF EXISTS "prompts_update_auth" ON prompts;
DROP POLICY IF EXISTS "prompts_delete_auth" ON prompts;
CREATE POLICY "prompts_update_auth" ON prompts FOR UPDATE TO authenticated
  USING (private.can_edit_prompt(id)) WITH CHECK (private.can_edit_prompt(id));
CREATE POLICY "prompts_delete_auth" ON prompts FOR DELETE TO authenticated
  USING (private.can_edit_prompt(id));

-- roles
DROP POLICY IF EXISTS "roles_admin_insert" ON roles;
DROP POLICY IF EXISTS "roles_admin_update" ON roles;
DROP POLICY IF EXISTS "roles_admin_delete" ON roles;
CREATE POLICY "roles_admin_insert" ON roles FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "roles_admin_update" ON roles FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "roles_admin_delete" ON roles FOR DELETE TO authenticated USING (private.is_admin());

-- technique_templates
DROP POLICY IF EXISTS "templates_admin_insert" ON technique_templates;
DROP POLICY IF EXISTS "templates_admin_update" ON technique_templates;
DROP POLICY IF EXISTS "templates_admin_delete" ON technique_templates;
CREATE POLICY "templates_admin_insert" ON technique_templates FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "templates_admin_update" ON technique_templates FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "templates_admin_delete" ON technique_templates FOR DELETE TO authenticated USING (private.is_admin());

-- techniques
DROP POLICY IF EXISTS "techniques_admin_insert" ON techniques;
DROP POLICY IF EXISTS "techniques_admin_update" ON techniques;
DROP POLICY IF EXISTS "techniques_admin_delete" ON techniques;
CREATE POLICY "techniques_admin_insert" ON techniques FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "techniques_admin_update" ON techniques FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "techniques_admin_delete" ON techniques FOR DELETE TO authenticated USING (private.is_admin());

-- Oude public-helpers verwijderen (geen policy verwijst er nog naar).
DROP FUNCTION IF EXISTS public.can_edit_prompt(uuid);
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.current_app_role();
DROP FUNCTION IF EXISTS public.current_org_id();
