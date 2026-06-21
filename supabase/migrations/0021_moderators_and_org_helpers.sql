-- Overheid Prompt Library — Moderatoren per organisatie + boom-hulpfuncties.
--
-- Onderdeel van de getrapte zichtbaarheid/goedkeuring:
--   * Afdeling     → automatisch goedgekeurd (geen moderator nodig).
--   * Ministerie   → goedkeuring door een MODERATOR van dat ministerie.
--   * Rijksoverheid → goedkeuring door een admin / super_admin.
--
-- "Ministerie" = de hele tak onder de ministerie-wortel: het eerste niveau
-- ónder Rijksoverheid (bijv. OCW). DUO valt daar als agentschap onder, dus voor
-- een DUO-medewerker is de ministerie-wortel OCW en bestrijkt "Ministerie" heel
-- OCW (incl. directies en andere dienstonderdelen).

-- 1. Moderatoren-koppeltabel: welke gebruiker modereert welke organisatie.
--    Een moderator wordt doorgaans gekoppeld aan een ministerie-wortel (OCW),
--    maar de tabel staat elke organisatie toe voor toekomstige fijnmazigheid.
CREATE TABLE IF NOT EXISTS organization_moderators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_moderators_user ON organization_moderators(user_id);
CREATE INDEX IF NOT EXISTS idx_org_moderators_org ON organization_moderators(organization_id);

ALTER TABLE organization_moderators ENABLE ROW LEVEL SECURITY;

-- 2. Boom-hulpfunctie: ministerie-wortel van een organisatie.
--    Loopt parent_id omhoog tot net ónder de 'government'-root (Rijksoverheid)
--    en geeft die ministerie-id terug. Voor de root/zonder ouder: geef de
--    organisatie zelf terug. SECURITY DEFINER + vaste search_path conform de
--    bestaande private-helpers.
CREATE OR REPLACE FUNCTION private.ministry_root_id(p_org_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur_id uuid := p_org_id;
  cur_parent uuid;
  cur_parent_type text;
BEGIN
  IF cur_id IS NULL THEN
    RETURN NULL;
  END IF;
  LOOP
    SELECT o.parent_id, p.organization_type
      INTO cur_parent, cur_parent_type
      FROM organizations o
      LEFT JOIN organizations p ON p.id = o.parent_id
      WHERE o.id = cur_id;

    -- Geen ouder meer (we staan op de root): geef de huidige terug.
    IF cur_parent IS NULL THEN
      RETURN cur_id;
    END IF;
    -- Ouder is de Rijksoverheid-root: de huidige is de ministerie-wortel.
    IF cur_parent_type = 'government' THEN
      RETURN cur_id;
    END IF;
    cur_id := cur_parent;
  END LOOP;
END;
$$;

-- 3. Ministerie-wortel van de ingelogde gebruiker (op basis van zijn profiel-org).
CREATE OR REPLACE FUNCTION private.current_ministry_root_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.ministry_root_id(private.current_org_id())
$$;

-- 4. Is de ingelogde gebruiker moderator van de gegeven organisatie, óf van de
--    ministerie-wortel waar die organisatie onder valt? Zo kan een moderator
--    die op OCW is gezet de hele OCW-tak modereren.
CREATE OR REPLACE FUNCTION private.is_org_moderator(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_moderators m
    WHERE m.user_id = auth.uid()
      AND m.organization_id IN (p_org_id, private.ministry_root_id(p_org_id))
  )
$$;

REVOKE EXECUTE ON FUNCTION private.ministry_root_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.current_ministry_root_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_org_moderator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ministry_root_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_ministry_root_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_moderator(uuid) TO authenticated;

-- 5. RLS op organization_moderators:
--    * Lezen: iedere ingelogde gebruiker (zodat de UI kan tonen wie modereert).
--    * Beheren (toevoegen/verwijderen): alleen admins.
DROP POLICY IF EXISTS "org_moderators_read" ON organization_moderators;
CREATE POLICY "org_moderators_read" ON organization_moderators
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "org_moderators_admin_insert" ON organization_moderators;
CREATE POLICY "org_moderators_admin_insert" ON organization_moderators
  FOR INSERT TO authenticated WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "org_moderators_admin_delete" ON organization_moderators;
CREATE POLICY "org_moderators_admin_delete" ON organization_moderators
  FOR DELETE TO authenticated USING (private.is_admin());
