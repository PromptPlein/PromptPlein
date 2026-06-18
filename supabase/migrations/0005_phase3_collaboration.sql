-- Overheid Prompt Library — Phase 3: samenwerking & goedkeuringsworkflow.
--
-- Voegt toe: status-levenscyclus op prompts (concept → ingediend → goedgekeurd/
-- afgewezen), automatische versiegeschiedenis, medewerkers (collaborators),
-- reacties (comments) en een goedkeuringslog.

-- 1. Uitbreidingen op prompts: status + eigenaar (auth) + review-velden.
ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'archived')),
  ADD COLUMN IF NOT EXISTS created_by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Bestaande prompts zijn reeds gepubliceerde inhoud → markeer als goedgekeurd.
UPDATE prompts SET status = 'approved' WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_prompts_status ON prompts(status);
CREATE INDEX IF NOT EXISTS idx_prompts_created_by_user ON prompts(created_by_user);

-- 2. Versiegeschiedenis (automatisch gevuld via trigger).
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (prompt_id, version)
);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id);

-- 3. Medewerkers per prompt.
CREATE TABLE IF NOT EXISTS prompt_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (prompt_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_prompt_collaborators_prompt ON prompt_collaborators(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_collaborators_user ON prompt_collaborators(user_id);

-- 4. Reacties.
CREATE TABLE IF NOT EXISTS prompt_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_comments_prompt ON prompt_comments(prompt_id);

-- 5. Goedkeuringslog.
CREATE TABLE IF NOT EXISTS prompt_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompt_approvals_prompt ON prompt_approvals(prompt_id);

-- 6. Trigger: zet de eigenaar (auth-gebruiker) bij het aanmaken.
CREATE OR REPLACE FUNCTION public.set_prompt_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by_user IS NULL THEN
    NEW.created_by_user = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompts_set_owner ON prompts;
CREATE TRIGGER trg_prompts_set_owner
  BEFORE INSERT ON prompts
  FOR EACH ROW EXECUTE FUNCTION set_prompt_owner();

-- 7. Trigger: automatische versie-snapshot bij aanmaken en inhoudswijziging.
CREATE OR REPLACE FUNCTION public.snapshot_prompt_version()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_version INT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.title IS NOT DISTINCT FROM OLD.title
     AND NEW.content IS NOT DISTINCT FROM OLD.content THEN
    RETURN NEW; -- geen inhoudswijziging → geen nieuwe versie
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
  FROM prompt_versions WHERE prompt_id = NEW.id;

  INSERT INTO prompt_versions (prompt_id, version, title, content, created_by)
  VALUES (NEW.id, next_version, NEW.title, NEW.content, auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompts_snapshot ON prompts;
CREATE TRIGGER trg_prompts_snapshot
  AFTER INSERT OR UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION snapshot_prompt_version();

-- 8. Hulpfunctie: mag de huidige gebruiker deze prompt bewerken?
-- Eigenaar, een editor-medewerker of een admin.
CREATE OR REPLACE FUNCTION public.can_edit_prompt(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    is_admin()
    OR EXISTS (SELECT 1 FROM prompts WHERE id = p_id AND created_by_user = auth.uid())
    OR EXISTS (
      SELECT 1 FROM prompt_collaborators
      WHERE prompt_id = p_id AND user_id = auth.uid() AND role = 'editor'
    )
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_prompt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_prompt(UUID) TO authenticated;

-- 9. Verfijn de schrijfrechten op prompts: bewerken/verwijderen alleen door wie
-- mag bewerken (eigenaar/editor/admin) i.p.v. iedere ingelogde gebruiker.
DROP POLICY IF EXISTS "prompts_update_auth" ON prompts;
CREATE POLICY "prompts_update_auth" ON prompts
  FOR UPDATE TO authenticated
  USING (can_edit_prompt(id)) WITH CHECK (can_edit_prompt(id));

DROP POLICY IF EXISTS "prompts_delete_auth" ON prompts;
CREATE POLICY "prompts_delete_auth" ON prompts
  FOR DELETE TO authenticated USING (can_edit_prompt(id));

-- 10. RLS op de nieuwe tabellen.
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_approvals ENABLE ROW LEVEL SECURITY;

-- Versies: openbaar leesbaar (consistent met openbaar leesbare prompts);
-- invoegen gebeurt alleen via de trigger (security definer).
CREATE POLICY "versions_read" ON prompt_versions FOR SELECT USING (true);

-- Medewerkers: zichtbaar voor betrokkenen; beheer door eigenaar/admin.
CREATE POLICY "collab_read" ON prompt_collaborators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR can_edit_prompt(prompt_id));
CREATE POLICY "collab_manage" ON prompt_collaborators
  FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM prompts WHERE id = prompt_collaborators.prompt_id AND created_by_user = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM prompts WHERE id = prompt_collaborators.prompt_id AND created_by_user = auth.uid())
  );

-- Reacties: openbaar leesbaar; plaatsen door ingelogde gebruikers (als zichzelf);
-- verwijderen door auteur of admin.
CREATE POLICY "comments_read" ON prompt_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON prompt_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "comments_delete" ON prompt_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_admin());

-- Goedkeuringen: leesbaar voor betrokkenen; alleen admins beslissen.
CREATE POLICY "approvals_read" ON prompt_approvals
  FOR SELECT TO authenticated USING (can_edit_prompt(prompt_id) OR is_admin());
CREATE POLICY "approvals_insert" ON prompt_approvals
  FOR INSERT TO authenticated WITH CHECK (is_admin());
