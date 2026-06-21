-- Overheid Prompt Library — Meervoudige deelniveaus met eigen status per niveau.
--
-- Een prompt kan op MEERDERE niveaus tegelijk gedeeld worden (afdeling +
-- ministerie + Rijksoverheid). Elk niveau krijgt een eigen rij met een eigen
-- goedkeuringsstatus, zodat bijv. "Afdeling direct beschikbaar, Ministerie wacht
-- op een moderator" schoon werkt — niemand wacht op een ander niveau.
--
-- Privé wordt NIET als rij opgeslagen: een prompt zonder enige
-- prompt_visibility-rij is privé (alleen zichtbaar voor de maker/admin).

-- 1. Tabel: één rij per (prompt × niveau).
CREATE TABLE IF NOT EXISTS prompt_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  -- Het deelniveau. 'department' = afdeling/organisatie van de prompt,
  -- 'ministry' = de hele ministerie-tak, 'public' = hele Rijksoverheid.
  level TEXT NOT NULL CHECK (level IN ('department', 'ministry', 'public')),
  -- De organisatie waarop dit niveau scope heeft (een momentopname):
  --   department → de organisatie van de prompt (exacte match voor kijkers)
  --   ministry   → de ministerie-wortel van die organisatie
  --   public     → NULL (iedereen)
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  -- Eigen status per niveau. 'approved' = zichtbaar; 'pending' = wacht op
  -- goedkeuring; 'rejected' = afgewezen (blijft onzichtbaar).
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('approved', 'pending', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (prompt_id, level)
);

CREATE INDEX IF NOT EXISTS idx_prompt_visibility_prompt ON prompt_visibility(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_visibility_level_status ON prompt_visibility(level, status);
CREATE INDEX IF NOT EXISTS idx_prompt_visibility_org ON prompt_visibility(org_id);

ALTER TABLE prompt_visibility ENABLE ROW LEVEL SECURITY;

-- 2. Backfill: bestaande prompts behouden hun zichtbaarheid.
--    Alle huidige prompts staan op sharing_level 'public' + status 'approved';
--    we vertalen dat 1-op-1 naar een approved public-zichtbaarheidsrij, zodat er
--    GEEN gat ontstaat zodra de strikte SELECT-RLS hieronder actief wordt.
--    Generiek vertaald per oud sharing_level zodat ook afwijkende rijen meekomen:
INSERT INTO prompt_visibility (prompt_id, level, org_id, status, reviewed_at)
SELECT
  p.id,
  CASE
    WHEN p.sharing_level IN ('department') THEN 'department'
    WHEN p.sharing_level IN ('ministry') THEN 'ministry'
    ELSE 'public'                       -- 'public' en legacy 'role' → public
  END AS level,
  CASE
    WHEN p.sharing_level = 'department' THEN p.organization_id
    WHEN p.sharing_level = 'ministry' THEN private.ministry_root_id(p.organization_id)
    ELSE NULL
  END AS org_id,
  -- Bestaande, reeds goedgekeurde prompts blijven zichtbaar.
  CASE WHEN COALESCE(p.status, 'approved') = 'approved' THEN 'approved' ELSE 'pending' END AS status,
  CASE WHEN COALESCE(p.status, 'approved') = 'approved' THEN NOW() ELSE NULL END AS reviewed_at
FROM prompts p
WHERE p.sharing_level <> 'private'
  AND NOT EXISTS (SELECT 1 FROM prompt_visibility v WHERE v.prompt_id = p.id)
ON CONFLICT (prompt_id, level) DO NOTHING;

-- 3. Hulpfunctie: mag de ingelogde gebruiker een prompt ZIEN?
--    Maker en admin zien alles; verder telt of er een APPROVED zichtbaarheidsrij
--    is die op de gebruiker van toepassing is:
--      public     → iedereen
--      ministry   → zelfde ministerie-wortel als de gebruiker
--      department → exact dezelfde organisatie als de gebruiker
CREATE OR REPLACE FUNCTION private.can_see_prompt(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    private.is_admin()
    OR EXISTS (SELECT 1 FROM prompts WHERE id = p_id AND created_by_user = auth.uid())
    OR EXISTS (
      SELECT 1 FROM prompt_visibility v
      WHERE v.prompt_id = p_id
        AND v.status = 'approved'
        AND (
          v.level = 'public'
          OR (v.level = 'ministry' AND v.org_id = private.current_ministry_root_id())
          OR (v.level = 'department' AND v.org_id = private.current_org_id())
        )
    )
$$;

-- 4. Hulpfunctie: mag de ingelogde gebruiker een zichtbaarheids-RIJ modereren?
--    department → automatisch (door de maker bij het indienen al approved gezet,
--                 hier voor de volledigheid ook door admins toegestaan)
--    ministry   → moderator van de betreffende ministerie-tak, of admin
--    public     → alleen admin / super_admin
CREATE OR REPLACE FUNCTION private.can_moderate_visibility(v_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM prompt_visibility v
    WHERE v.id = v_id
      AND (
        private.is_admin()
        OR (v.level = 'ministry' AND private.is_org_moderator(v.org_id))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION private.can_see_prompt(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_moderate_visibility(uuid) FROM PUBLIC;
-- can_see_prompt moet ook voor anon werken (publieke prompts), dus aan beide rollen.
GRANT EXECUTE ON FUNCTION private.can_see_prompt(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.can_moderate_visibility(uuid) TO authenticated;

-- 5. RLS op prompt_visibility.
--    Lezen: iedereen die de bijbehorende prompt mag zien (zodat de UI de
--    niveaus/statussen kan tonen); plus de maker en moderatoren/admins ook voor
--    nog-niet-goedgekeurde rijen.
DROP POLICY IF EXISTS "prompt_visibility_read" ON prompt_visibility;
CREATE POLICY "prompt_visibility_read" ON prompt_visibility
  FOR SELECT USING (
    status = 'approved'
    OR private.can_edit_prompt(prompt_id)
    OR private.can_moderate_visibility(id)
  );

--    Toevoegen: alleen wie de prompt mag bewerken (de maker of een editor/admin).
DROP POLICY IF EXISTS "prompt_visibility_insert" ON prompt_visibility;
CREATE POLICY "prompt_visibility_insert" ON prompt_visibility
  FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_prompt(prompt_id));

--    Bijwerken (goedkeuren/afwijzen): alleen wie dit niveau mag modereren.
--    (department wordt al bij het indienen op 'approved' gezet en hoeft niet
--    gemodereerd te worden; admins kunnen desgewenst alsnog bijsturen.)
DROP POLICY IF EXISTS "prompt_visibility_update" ON prompt_visibility;
CREATE POLICY "prompt_visibility_update" ON prompt_visibility
  FOR UPDATE TO authenticated
  USING (private.can_moderate_visibility(id) OR private.can_edit_prompt(prompt_id))
  WITH CHECK (private.can_moderate_visibility(id) OR private.can_edit_prompt(prompt_id));

--    Verwijderen: de maker/editor van de prompt (een niveau intrekken).
DROP POLICY IF EXISTS "prompt_visibility_delete" ON prompt_visibility;
CREATE POLICY "prompt_visibility_delete" ON prompt_visibility
  FOR DELETE TO authenticated
  USING (private.can_edit_prompt(prompt_id));
