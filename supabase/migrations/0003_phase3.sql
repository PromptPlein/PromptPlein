-- Overheid Prompt Library — Phase 3 fundament: authenticatie, organisaties & RBAC
--
-- Dit fundament voegt echte gebruikers (Supabase Auth), een organisatie-
-- hiërarchie (ministeries/afdelingen/agentschappen) en rolgebaseerde toegang
-- (RBAC) toe. De bestaande Phase 1/2-tabellen blijven voorlopig open
-- toegankelijk (anon) zodat de huidige app blijft werken; hun RLS wordt pas
-- aangescherpt zodra de inlog-UI live is.

-- 1. Organisaties (ministeries / afdelingen / agentschappen) met hiërarchie
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  logo_url TEXT,
  parent_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  organization_type TEXT NOT NULL DEFAULT 'ministry'
    CHECK (organization_type IN ('ministry', 'department', 'agency')),
  contact_email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Profielen — gekoppeld aan Supabase Auth-gebruikers (auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'super_admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 3. Hulpfuncties voor RLS.
-- SECURITY DEFINER + vaste search_path zodat policies de profiles-tabel kunnen
-- raadplegen zonder oneindige RLS-recursie. EXECUTE wordt beperkt tot
-- ingelogde gebruikers (niet via anon RPC aanroepbaar).
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT organization_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 4. Maak automatisch een profiel aan bij registratie van een nieuwe Auth-gebruiker.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- handle_new_user draait alleen als trigger; niet via PostgREST RPC blootstellen.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 5. updated_at automatisch bijhouden. Herstel meteen de mutable search_path
-- waarschuwing van de database-linter op de bestaande functie.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. RLS — auth-gebaseerde policies op de NIEUWE Phase 3-tabellen.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Organisaties: iedere ingelogde gebruiker mag lezen; alleen admins beheren.
DROP POLICY IF EXISTS "orgs_read_authenticated" ON organizations;
CREATE POLICY "orgs_read_authenticated" ON organizations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "orgs_admin_insert" ON organizations;
CREATE POLICY "orgs_admin_insert" ON organizations
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "orgs_admin_update" ON organizations;
CREATE POLICY "orgs_admin_update" ON organizations
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "orgs_admin_delete" ON organizations;
CREATE POLICY "orgs_admin_delete" ON organizations
  FOR DELETE TO authenticated USING (is_admin());

-- Profielen: eigen profiel + collega's binnen dezelfde organisatie + admins.
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR organization_id = current_org_id() OR is_admin());

-- Eigen profiel bijwerken — maar je eigen rol mag je NIET wijzigen
-- (rolwijziging blijft voorbehouden aan admins via de policy hieronder).
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = current_app_role());

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 7. Seed: standaardorganisatie zodat nieuwe registraties zich kunnen koppelen.
INSERT INTO organizations (name, code, organization_type, description)
VALUES ('Rijksoverheid', 'RIJK', 'ministry', 'Standaard overkoepelende organisatie')
ON CONFLICT (code) DO NOTHING;

-- LET OP — promoveer de eerste beheerder handmatig na zijn/haar registratie:
--   UPDATE public.profiles SET role = 'super_admin' WHERE email = 'jij@voorbeeld.nl';
